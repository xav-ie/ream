package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// These tests exercise the HTTP API the frontend calls into. Every fixture is
// generated at runtime with ghostscript, so no binary blobs are committed.
// A test skips (rather than fails) when a required CLI tool is absent, so
// `go test` is friendly off-Nix; CI runs them with every tool on PATH.

func requireTools(t *testing.T, tools ...string) {
	t.Helper()
	for _, tool := range tools {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("tool %q not on PATH; skipping", tool)
		}
	}
}

// makePDF writes an n-page blank PDF and returns its path.
func makePDF(t *testing.T, dir, name string, pages int) string {
	t.Helper()
	path := filepath.Join(dir, name)
	cmd := exec.Command("gs", "-dBATCH", "-dNOPAUSE", "-q",
		"-sDEVICE=pdfwrite", "-sOutputFile="+path,
		"-c", strings.TrimSpace(strings.Repeat("showpage ", pages)))
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("make pdf: %v\n%s", err, out)
	}
	return path
}

// makePNG writes a tiny PNG and returns its path.
func makePNG(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	cmd := exec.Command("gs", "-dBATCH", "-dNOPAUSE", "-q",
		"-sDEVICE=pngmono", "-g120x120", "-sOutputFile="+path, "-c", "showpage")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("make png: %v\n%s", err, out)
	}
	return path
}

var pageCountRe = regexp.MustCompile(`(?i)page count:\s*(\d+)`)

func pdfPageCount(t *testing.T, path string) int {
	t.Helper()
	out, err := exec.Command("pdfcpu", "info", path).CombinedOutput()
	if err != nil {
		t.Fatalf("pdfcpu info: %v\n%s", err, out)
	}
	m := pageCountRe.FindSubmatch(out)
	if m == nil {
		t.Fatalf("no page count in:\n%s", out)
	}
	n, _ := strconv.Atoi(string(m[1]))
	return n
}

// form describes a multipart request: files keyed by field, plus plain values.
type form struct {
	files  map[string][]string // field -> file paths (order preserved)
	values map[string]string
}

// call builds a multipart POST, runs it through the given handler, and returns
// the recorder. It asserts the field/file ordering matches the upload.
func call(t *testing.T, h http.HandlerFunc, f form) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for field, paths := range f.files {
		for _, p := range paths {
			fw, err := mw.CreateFormFile(field, filepath.Base(p))
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(p)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := fw.Write(data); err != nil {
				t.Fatal(err)
			}
		}
	}
	for k, v := range f.values {
		_ = mw.WriteField(k, v)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/x", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

// saveBody writes the recorder's body to disk and returns the path.
func saveBody(t *testing.T, dir, name string, rr *httptest.ResponseRecorder) string {
	t.Helper()
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rr.Code, rr.Body.String())
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, rr.Body.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func zipNames(t *testing.T, rr *httptest.ResponseRecorder) []string {
	t.Helper()
	dir := t.TempDir()
	zp := saveBody(t, dir, "out.zip", rr)
	out, err := exec.Command("unzip", "-Z1", zp).CombinedOutput()
	if err != nil {
		t.Fatalf("unzip: %v\n%s", err, out)
	}
	var names []string
	for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if l != "" {
			names = append(names, l)
		}
	}
	return names
}

func TestMerge(t *testing.T) {
	requireTools(t, "gs", "pdfcpu")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	b := makePDF(t, dir, "b.pdf", 2)
	rr := call(t, op(merge), form{files: map[string][]string{"files": {a, b}}})
	out := saveBody(t, dir, "merged.pdf", rr)
	if got := pdfPageCount(t, out); got != 5 {
		t.Fatalf("merged page count = %d, want 5", got)
	}
}

func TestMergeRejectsSingle(t *testing.T) {
	requireTools(t, "gs")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 1)
	rr := call(t, op(merge), form{files: map[string][]string{"files": {a}}})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestReorder(t *testing.T) {
	requireTools(t, "gs", "pdfcpu", "qpdf")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	rr := call(t, op(reorder), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"order": "3,1,2"},
	})
	out := saveBody(t, dir, "r.pdf", rr)
	if got := pdfPageCount(t, out); got != 3 {
		t.Fatalf("reordered page count = %d, want 3", got)
	}
}

func TestReorderRejectsInjection(t *testing.T) {
	requireTools(t, "gs")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 2)
	rr := call(t, op(reorder), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"order": "; rm -rf /"},
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (spec must be rejected)", rr.Code)
	}
}

func TestSplit(t *testing.T) {
	requireTools(t, "gs", "pdfcpu", "unzip")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	rr := call(t, op(split), form{files: map[string][]string{"file": {a}}})
	if names := zipNames(t, rr); len(names) != 3 {
		t.Fatalf("split produced %d files, want 3: %v", len(names), names)
	}
}

func TestCompress(t *testing.T) {
	requireTools(t, "gs", "pdfcpu")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	rr := call(t, op(compress), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"level": "screen"},
	})
	out := saveBody(t, dir, "c.pdf", rr)
	if got := pdfPageCount(t, out); got != 3 {
		t.Fatalf("compressed page count = %d, want 3", got)
	}
}

func TestCompressRejectsBadLevel(t *testing.T) {
	requireTools(t, "gs")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 1)
	rr := call(t, op(compress), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"level": "ultra"},
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestCompressTarget(t *testing.T) {
	requireTools(t, "gs", "pdfcpu")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	rr := call(t, op(compress), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"maxmb": "1"},
	})
	out := saveBody(t, dir, "c.pdf", rr)
	if got := pdfPageCount(t, out); got != 3 {
		t.Fatalf("target compress page count = %d, want 3", got)
	}
	if info, _ := os.Stat(out); info.Size() > 1024*1024 {
		t.Fatalf("output %d bytes exceeds 1MB target", info.Size())
	}
}

func TestCompressTargetRejectsBadValue(t *testing.T) {
	requireTools(t, "gs")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 1)
	rr := call(t, op(compress), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"maxmb": "-2"},
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestCompressTargetUnreachable(t *testing.T) {
	requireTools(t, "gs")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 2)
	// 0.0001 MB (~100 bytes) is below any real PDF, so no rung fits → error.
	rr := call(t, op(compress), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"maxmb": "0.0001"},
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (target unreachable)", rr.Code)
	}
}

func TestImagesToPDF(t *testing.T) {
	requireTools(t, "gs", "pdfcpu", "img2pdf")
	dir := t.TempDir()
	i1 := makePNG(t, dir, "1.png")
	i2 := makePNG(t, dir, "2.png")
	rr := call(t, op(imagesToPDF), form{files: map[string][]string{"files": {i1, i2}}})
	out := saveBody(t, dir, "i.pdf", rr)
	if got := pdfPageCount(t, out); got != 2 {
		t.Fatalf("images->pdf page count = %d, want 2", got)
	}
}

func TestPDFToImages(t *testing.T) {
	requireTools(t, "gs", "pdftoppm", "unzip")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 3)
	rr := call(t, op(pdfToImages), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"dpi": "72"},
	})
	names := zipNames(t, rr)
	if len(names) != 3 {
		t.Fatalf("pdf->images produced %d pngs, want 3: %v", len(names), names)
	}
	for _, n := range names {
		if !strings.HasSuffix(n, ".png") {
			t.Fatalf("unexpected file in zip: %s", n)
		}
	}
}

func TestPDFToImagesSubset(t *testing.T) {
	requireTools(t, "gs", "qpdf", "pdftoppm", "unzip")
	dir := t.TempDir()
	a := makePDF(t, dir, "a.pdf", 4)
	rr := call(t, op(pdfToImages), form{
		files:  map[string][]string{"file": {a}},
		values: map[string]string{"order": "3,1", "dpi": "72"},
	})
	if names := zipNames(t, rr); len(names) != 2 {
		t.Fatalf("subset pdf->images produced %d pngs, want 2: %v", len(names), names)
	}
}

func TestOfficeToPDF(t *testing.T) {
	requireTools(t, "libreoffice", "pdfcpu")
	dir := t.TempDir()
	src := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(src, []byte("Hello, ream.\nSecond line.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	rr := call(t, op(officeToPDF), form{files: map[string][]string{"file": {src}}})
	out := saveBody(t, dir, "note.pdf", rr)
	if got := pdfPageCount(t, out); got < 1 {
		t.Fatalf("office->pdf page count = %d, want >= 1", got)
	}
}
