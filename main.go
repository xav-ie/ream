// ream — a tiny, on-demand PDF utility server.
//
// It holds no state and runs no background work: every operation shells out to
// a CLI tool only when a request arrives. Combined with systemd socket
// activation (the process does not exist until a connection lands) and a
// self-imposed idle exit, idle cost is zero CPU and zero RAM.
//
// The HTTP API is the contract the frontend calls into; see *_test.go for the
// behavioural tests that exercise each operation against a generated fixture.
package main

import (
	"archive/zip"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

const (
	idleTimeout    = 5 * time.Minute
	maxUpload      = 512 << 20 // 512 MiB request-body cap
	defaultPort    = 8086
	defaultWebroot = "frontend/dist"
	opTimeout      = 3 * time.Minute // ceiling for any single CLI invocation

	// Chunked uploads: Cloudflare caps a request body at 100 MB, so the UI sends
	// each file in pieces under that and the operation names the upload instead.
	maxChunk = 96 << 20
	maxFile  = 2 << 30
)

var uploadID = regexp.MustCompile(`^[0-9a-f]{32}$`)

var (
	lastActivity atomic.Int64 // unix seconds of most recent request boundary
	inflight     atomic.Int64
)

func main() {
	log.SetFlags(0)
	port := flag.Int("port", defaultPort, "port to listen on when not socket-activated")
	flag.Parse()

	ln, activated := listener(*port)
	if !activated {
		log.Printf("ream: listening on %s (no socket activation)", ln.Addr())
	}

	srv := &http.Server{
		Handler: track(routes(webroot())),
		// Bound reads so a slow/stalled client can't keep `inflight` above zero
		// forever and defeat the idle self-exit. No WriteTimeout: a legitimate
		// gs/libreoffice conversion can take a while before the response is sent.
		ReadHeaderTimeout: 15 * time.Second,
		ReadTimeout:       5 * time.Minute,
	}
	lastActivity.Store(time.Now().Unix())
	go idleWatch(srv, activated)

	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("ream: serve: %v", err)
	}
}

// routes builds the full handler: static frontend at / and the operation API
// under /api. Factored out so tests can mount it without a real socket.
func routes(webroot string) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir(webroot)))
	mux.HandleFunc("PUT /api/upload/{id}", uploadChunk)
	mux.HandleFunc("/api/merge", op(merge))
	mux.HandleFunc("/api/reorder", op(reorder))
	mux.HandleFunc("/api/split", op(split))
	mux.HandleFunc("/api/compress", op(compress))
	mux.HandleFunc("/api/images-to-pdf", op(imagesToPDF))
	mux.HandleFunc("/api/pdf-to-images", op(pdfToImages))
	mux.HandleFunc("/api/office-to-pdf", op(officeToPDF))
	return mux
}

func webroot() string {
	if w := os.Getenv("REAM_WEBROOT"); w != "" {
		return w
	}
	return defaultWebroot
}

// listener returns the systemd-activated socket (fd 3) when present, else binds
// $REAM_HOST:port (default 127.0.0.1; the container image sets 0.0.0.0). The bool reports whether activation was
// used; under socket activation the port is irrelevant (systemd owns the socket).
func listener(port int) (net.Listener, bool) {
	if pid, _ := strconv.Atoi(os.Getenv("LISTEN_PID")); pid == os.Getpid() {
		if n, _ := strconv.Atoi(os.Getenv("LISTEN_FDS")); n >= 1 {
			f := os.NewFile(3, "systemd-socket") // SD_LISTEN_FDS_START
			if l, err := net.FileListener(f); err == nil {
				return l, true
			}
		}
	}
	host := os.Getenv("REAM_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	l, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("ream: listen %s: %v", addr, err)
	}
	return l, false
}

// track records request boundaries so idleWatch can tell when nothing is happening.
func track(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inflight.Add(1)
		lastActivity.Store(time.Now().Unix())
		defer func() {
			lastActivity.Store(time.Now().Unix())
			inflight.Add(-1)
		}()
		h.ServeHTTP(w, r)
	})
}

// idleWatch shuts the server down after idleTimeout with no in-flight requests,
// but only under socket activation — where systemd re-spawns us on the next
// connection. Without activation we stay up (dev mode).
func idleWatch(srv *http.Server, activated bool) {
	if !activated {
		return
	}
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for range t.C {
		if inflight.Load() > 0 {
			continue
		}
		if time.Since(time.Unix(lastActivity.Load(), 0)) >= idleTimeout {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = srv.Shutdown(ctx)
			cancel()
			return
		}
	}
}

// job is one request's scratch directory plus its parsed multipart form.
type job struct {
	dir  string
	form *multipart.Form
}

// op adapts a handler that returns (resultPath, downloadName, error) into an
// http.HandlerFunc, owning multipart parsing, the temp dir, and cleanup.
func op(fn func(j *job) (path, name string, err error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		// Cap the total request body, then parse with a modest in-memory budget
		// (larger uploads spill to disk in the per-request temp area).
		r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			http.Error(w, "bad upload: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer func() { _ = r.MultipartForm.RemoveAll() }()

		dir, err := os.MkdirTemp("", "ream-")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer os.RemoveAll(dir)

		path, name, err := fn(&job{dir: dir, form: r.MultipartForm})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		serveFile(w, path, name)
	}
}

// uploadsDir holds chunked uploads until an operation claims them.
// ponytail: no janitor; abandoned uploads go when the container sleeps (or the
// PrivateTmp unit stops). Add an mtime sweep if a long-lived host ever needs it.
func uploadsDir() string { return filepath.Join(os.TempDir(), "ream-uploads") }

// uploadChunk writes one piece of an upload at ?offset=N. Pieces may arrive in
// any order or be retried; each lands at its own offset.
func uploadChunk(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uploadID.MatchString(id) {
		http.Error(w, "bad upload id", http.StatusBadRequest)
		return
	}
	offset, err := strconv.ParseInt(r.URL.Query().Get("offset"), 10, 64)
	if err != nil || offset < 0 || r.ContentLength < 0 || offset+r.ContentLength > maxFile {
		http.Error(w, "bad offset or length", http.StatusBadRequest)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxChunk)
	if err := os.MkdirAll(uploadsDir(), 0o700); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	f, err := os.OpenFile(filepath.Join(uploadsDir(), id), os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	if _, err := io.Copy(io.NewOffsetWriter(f, offset), r.Body); err != nil {
		http.Error(w, "upload: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// save writes the uploaded files in form field `field` into the job dir,
// preserving upload order, and returns their on-disk paths. The field holds
// either multipart files or "<upload id>/<filename>" references to chunked
// uploads, which are moved in.
func (j *job) save(field string) ([]string, error) {
	if refs := j.form.Value[field]; len(refs) > 0 {
		return j.claim(refs)
	}
	headers := j.form.File[field]
	if len(headers) == 0 {
		return nil, fmt.Errorf("no files in field %q", field)
	}
	var paths []string
	for i, fh := range headers {
		src, err := fh.Open()
		if err != nil {
			return nil, err
		}
		// Prefix with index to keep a stable, shell-safe ordering on disk.
		dst := filepath.Join(j.dir, fmt.Sprintf("%03d-%s", i, sanitize(fh.Filename)))
		out, err := os.Create(dst)
		if err != nil {
			src.Close()
			return nil, err
		}
		if _, err := io.Copy(out, src); err != nil {
			src.Close()
			out.Close()
			return nil, err
		}
		src.Close()
		out.Close()
		paths = append(paths, dst)
	}
	return paths, nil
}

func (j *job) claim(refs []string) ([]string, error) {
	var paths []string
	for i, ref := range refs {
		id, name, _ := strings.Cut(ref, "/")
		if !uploadID.MatchString(id) {
			return nil, fmt.Errorf("bad upload reference %q", ref)
		}
		dst := filepath.Join(j.dir, fmt.Sprintf("%03d-%s", i, sanitize(name)))
		if err := os.Rename(filepath.Join(uploadsDir(), id), dst); err != nil {
			return nil, fmt.Errorf("upload %s: %w", id, err)
		}
		paths = append(paths, dst)
	}
	return paths, nil
}

func (j *job) value(field string) string {
	v, ok := j.form.Value[field]
	if !ok || len(v) == 0 {
		return ""
	}
	return strings.TrimSpace(v[0])
}

func (j *job) has(field string) bool { return j.value(field) != "" }

// run executes a command (bounded by opTimeout) and surfaces combined output on
// failure, so a wedged tool can't pin the process indefinitely.
func run(name string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s failed: %v\n%s", name, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func merge(j *job) (string, string, error) {
	in, err := j.save("files")
	if err != nil {
		return "", "", err
	}
	if len(in) < 2 {
		return "", "", errors.New("merge needs at least two PDFs")
	}
	out := filepath.Join(j.dir, "merged.pdf")
	return out, "merged.pdf", run("pdfcpu", append([]string{"merge", out}, in...)...)
}

var pageSpec = regexp.MustCompile(`^[0-9,\-rz ]+$`)

// extractPages rebuilds `in` from the given page spec (reorder and/or subset)
// via qpdf, writing the result under dir.
func extractPages(dir, in, spec string) (string, error) {
	if !pageSpec.MatchString(spec) {
		return "", errors.New(`order must look like "3,1,2" or "5-1"`)
	}
	out := filepath.Join(dir, "ordered.pdf")
	return out, run("qpdf", "--empty", "--pages", in, spec, "--", out)
}

func reorder(j *job) (string, string, error) {
	in, err := j.save("file")
	if err != nil {
		return "", "", err
	}
	out, err := extractPages(j.dir, in[0], j.value("order"))
	return out, "reordered.pdf", err
}

func split(j *job) (string, string, error) {
	in, err := j.save("file")
	if err != nil {
		return "", "", err
	}
	outDir := filepath.Join(j.dir, "pages")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", "", err
	}
	// span 1 => one PDF per page.
	if err := run("pdfcpu", "split", in[0], outDir, "1"); err != nil {
		return "", "", err
	}
	return zipDir(j.dir, outDir, "pages.zip")
}

// gsCompress runs Ghostscript with the given extra args, writing to out.
func gsCompress(in, out string, extra ...string) error {
	args := []string{
		"-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5",
		"-dNOPAUSE", "-dBATCH", "-dQUIET",
	}
	args = append(args, extra...)
	args = append(args, "-sOutputFile="+out, in)
	return run("gs", args...)
}

func screenAt(dpi int) []string {
	r := strconv.Itoa(dpi)
	return []string{
		"-dPDFSETTINGS=/screen",
		"-dDownsampleColorImages=true", "-dColorImageResolution=" + r,
		"-dDownsampleGrayImages=true", "-dGrayImageResolution=" + r,
		"-dDownsampleMonoImages=true", "-dMonoImageResolution=" + r,
	}
}

// compressLadder is ordered highest-quality first. Target mode returns the
// best-quality output that still fits under the requested size.
var compressLadder = []struct{ args []string }{
	{[]string{"-dPDFSETTINGS=/prepress"}},
	{[]string{"-dPDFSETTINGS=/printer"}},
	{[]string{"-dPDFSETTINGS=/ebook"}},
	{[]string{"-dPDFSETTINGS=/screen"}},
	{screenAt(72)},
	{screenAt(50)},
	{screenAt(36)},
}

func compress(j *job) (string, string, error) {
	in, err := j.save("file")
	if err != nil {
		return "", "", err
	}
	// Size mode (target a max size) vs quality mode (pick a PDFSETTINGS level).
	// The UI sends an explicit mode; without one, a bare maxmb implies size.
	if j.value("mode") == "size" || (!j.has("mode") && j.has("maxmb")) {
		return compressToTarget(j, in[0])
	}
	level := "ebook"
	if j.has("level") {
		switch v := j.value("level"); v {
		case "screen", "ebook", "printer", "prepress":
			level = v
		default:
			return "", "", errors.New("level must be screen|ebook|printer|prepress")
		}
	}
	out := filepath.Join(j.dir, "compressed.pdf")
	return out, "compressed.pdf", gsCompress(in[0], out, "-dPDFSETTINGS=/"+level)
}

// compressToTarget walks the quality ladder and returns the first (highest
// quality) output at or under the requested size. If even the most aggressive
// setting can't reach the target, it reports the smallest achievable size as an
// error rather than silently returning an over-target file.
func compressToTarget(j *job, in string) (string, string, error) {
	mb, err := strconv.ParseFloat(j.value("maxmb"), 64)
	if err != nil || mb <= 0 {
		return "", "", errors.New("enter a maximum size in MB")
	}
	target := int64(mb * 1024 * 1024)

	best := ""
	var bestSize int64
	for i, cfg := range compressLadder {
		candidate := filepath.Join(j.dir, fmt.Sprintf("c%d.pdf", i))
		if err := gsCompress(in, candidate, cfg.args...); err != nil {
			continue
		}
		info, err := os.Stat(candidate)
		if err != nil {
			continue
		}
		if info.Size() <= target {
			return candidate, "compressed.pdf", nil
		}
		if best == "" || info.Size() < bestSize {
			best, bestSize = candidate, info.Size()
		}
	}
	if best == "" {
		return "", "", errors.New("compression produced no output")
	}
	return "", "", fmt.Errorf("smallest achievable is %.1f MB, above the %.1f MB target — raise the limit",
		float64(bestSize)/(1024*1024), mb)
}

func imagesToPDF(j *job) (string, string, error) {
	in, err := j.save("files")
	if err != nil {
		return "", "", err
	}
	out := filepath.Join(j.dir, "images.pdf")
	return out, "images.pdf", run("img2pdf", append(append([]string{}, in...), "-o", out)...)
}

func pdfToImages(j *job) (string, string, error) {
	in, err := j.save("file")
	if err != nil {
		return "", "", err
	}
	// Optional page order/subset: reorder/extract before rasterising.
	src := in[0]
	if j.has("order") {
		src, err = extractPages(j.dir, in[0], j.value("order"))
		if err != nil {
			return "", "", err
		}
	}
	outDir := filepath.Join(j.dir, "images")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", "", err
	}
	dpi := "150"
	if j.has("dpi") {
		if n, err := strconv.Atoi(j.value("dpi")); err == nil && n >= 36 && n <= 600 {
			dpi = strconv.Itoa(n)
		}
	}
	if err := run("pdftoppm", "-png", "-r", dpi, src, filepath.Join(outDir, "page")); err != nil {
		return "", "", err
	}
	return zipDir(j.dir, outDir, "images.zip")
}

func officeToPDF(j *job) (string, string, error) {
	in, err := j.save("file")
	if err != nil {
		return "", "", err
	}
	outDir := filepath.Join(j.dir, "out")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", "", err
	}
	// A throwaway per-request profile avoids LibreOffice's single-instance lock.
	profile := "file://" + filepath.Join(j.dir, "loprofile")
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "libreoffice", "--headless",
		"-env:UserInstallation="+profile,
		"--convert-to", "pdf", "--outdir", outDir, in[0])
	cmd.Env = append(os.Environ(), "HOME="+j.dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("libreoffice failed: %v\n%s", err, strings.TrimSpace(string(out)))
	}
	pdfs, _ := filepath.Glob(filepath.Join(outDir, "*.pdf"))
	if len(pdfs) == 0 {
		return "", "", errors.New("conversion produced no PDF (unsupported input?)")
	}
	// Strip the per-upload "%03d-" index prefix from the download name.
	return pdfs[0], indexPrefix.ReplaceAllString(filepath.Base(pdfs[0]), ""), nil
}

var indexPrefix = regexp.MustCompile(`^\d+-`)

// zipDir packs every regular file in src into a zip written under workdir.
func zipDir(workdir, src, name string) (string, string, error) {
	entries, err := os.ReadDir(src)
	if err != nil {
		return "", "", err
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() {
			files = append(files, e.Name())
		}
	}
	if len(files) == 0 {
		return "", "", errors.New("nothing produced")
	}
	sort.Strings(files)

	zipPath := filepath.Join(workdir, name)
	zf, err := os.Create(zipPath)
	if err != nil {
		return "", "", err
	}
	defer zf.Close()
	zw := zip.NewWriter(zf)
	for _, fn := range files {
		w, err := zw.Create(fn)
		if err != nil {
			return "", "", err
		}
		r, err := os.Open(filepath.Join(src, fn))
		if err != nil {
			return "", "", err
		}
		if _, err := io.Copy(w, r); err != nil {
			r.Close()
			return "", "", err
		}
		r.Close()
	}
	if err := zw.Close(); err != nil {
		return "", "", err
	}
	return zipPath, name, nil
}

func serveFile(w http.ResponseWriter, path, name string) {
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	ct := "application/pdf"
	if strings.HasSuffix(name, ".zip") {
		ct = "application/zip"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	if st != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(st.Size(), 10))
	}
	_, _ = io.Copy(w, f)
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]`)

func sanitize(s string) string {
	s = filepath.Base(s)
	s = unsafeName.ReplaceAllString(s, "_")
	if s == "" || s == "." {
		return "file"
	}
	return s
}
