<p align="center">
  <img src=".github/logo.svg" alt="ream" width="128" height="128">
</p>

<h1 align="center">ream</h1>

<p align="center">PDF tools you host yourself. Files never leave your machine or your Cloudflare account.</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/xav-ie/ream"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>
</p>

<p align="center">
  <a href="https://github.com/xav-ie/ream/actions/workflows/ci.yml"><img src="https://github.com/xav-ie/ream/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/xav-ie/ream/releases"><img src="https://img.shields.io/github/v/release/xav-ie/ream" alt="Release"></a>
</p>

ream is a small web app for everyday PDF chores. A Go server runs proven
command line tools (`qpdf`, `pdfcpu`, `ghostscript`, `img2pdf`, `poppler`,
`libreoffice`) behind an Astro UI. It holds no state: each request works in its
own temporary folder, which is deleted when the response is sent. When idle it
uses nothing, on a server or on Cloudflare.

| Tool              | What it does                                   |
| ----------------- | ---------------------------------------------- |
| Compress          | Shrinks a PDF by quality preset or target size |
| Merge             | Combines several PDFs in the order you choose  |
| Reorder / extract | Picks, reorders or duplicates pages            |
| Split             | One PDF per page, as a zip                     |
| Images → PDF      | One image per page                             |
| PDF → Images      | A PNG per page, as a zip                       |
| Office → PDF      | Word, Excel, PowerPoint, ODF and more          |

The grids support drag to reorder, typed page ranges, and click to preview.
After a tool saves a PDF, a "Continue with" row hands that result straight to
the next tool (compress, then reorder, then split, and so on); the file rides
in IndexedDB across the page load and never goes back to the server.

## Deploy your own

Runs on [Cloudflare Containers](https://developers.cloudflare.com/containers/),
which needs the Workers Paid plan ($5 a month). Personal use stays within the
plan's included container time.

1. Click **Deploy to Cloudflare** above. Cloudflare copies this repository into
   your GitHub account, builds the container image and deploys the Worker. It
   asks for `REAM_ACCESS_TEAM_DOMAIN` and `REAM_ACCESS_AUD`: enter your team
   domain (Zero Trust > Settings > Team domain, like
   `yourteam.cloudflareaccess.com`) and any placeholder for the AUD for now.
2. Put Cloudflare Access in front of the Worker: Workers & Pages > your Worker
   > Settings > Domains & Routes, turn on Access for `workers.dev` (or add a
   > custom domain with its own Access application), and allow your email.
3. Copy that Access application's Application Audience (AUD) Tag (Zero Trust >
   Access > Applications, open it) into the Worker's `REAM_ACCESS_AUD` secret
   (Worker > Settings > Variables and Secrets).

Until Access is set up, ream answers every request with 403: the Worker checks
the Access token itself, so a forgotten setting fails closed instead of opening
LibreOffice to the internet.

### Limits on Cloudflare

- **Uploads:** Cloudflare caps a request body at 100 MB, so the UI sends each
  file in 64 MiB pieces first. A file can be up to 2 GiB.
- **Cold start:** after 5 idle minutes the container sleeps; the next request
  waits a few seconds for it to start.
- **One instance:** every request goes to the same container, so all pieces of
  an upload land on the same disk.

## Run it anywhere else

```sh
nix run github:xav-ie/ream                   # http://127.0.0.1:8086
docker build -t ream . && docker run -p 127.0.0.1:8086:8086 ream
```

The Nix package wraps every tool onto `PATH`, so it needs no other setup. On a
host, run it under a systemd socket unit: ream adopts the socket
(`LISTEN_FDS`), starts on the first request and exits after 5 idle minutes.
Without socket activation it binds `$REAM_HOST:--port` (default
`127.0.0.1:8086`). There is no login, so put it behind something that has one.

## Develop

```sh
nix develop                                   # Go, Node, pnpm and every CLI (or: direnv allow)
cd frontend && pnpm install && pnpm build     # emits frontend/dist
cd .. && REAM_WEBROOT=frontend/dist go run .  # http://localhost:8086
```

`cd frontend && pnpm dev` runs the Astro dev server for UI work. `pnpm install`
at the root installs the Worker's tooling; `pnpm exec wrangler dev` runs the
Worker and container locally, which needs Docker or Podman (the dev shell
routes Podman through `scripts/podman-docker`, which drops the buildx flags
Podman rejects).

Deploy through a release (see [Releases](#releases)) or from a machine with
Docker. `pnpm run deploy` under Podman builds the image but fails to start it:
Podman recompresses the layers on push, so the registry holds a different
digest than the one wrangler recorded (`IMAGE_REGISTRY_DOESNT_CONTAIN_IMAGE`).

## Test

```sh
nix flake check          # go vet + go test against the real CLIs, the package build, formatting
cd frontend && pnpm check   # eslint, knip, astro check, prettier, fallow
pnpm check:types && pnpm test   # the Worker and its Access check
```

`nix fmt` formats Nix, Go and the root files; the frontend keeps its own
prettier (`pnpm format`) for the Astro plugin. Run `pnpm types` after changing
`wrangler.jsonc`.

## How it works

- **Server:** `main.go`, standard library only. `POST /api/<tool>` takes a
  multipart upload, runs the tool with a 3 minute timeout, and streams the
  result back.
- **Chunked uploads:** `PUT /api/upload/<id>?offset=N` writes one piece of a
  file at its offset; the tool request then names it as `<id>/<filename>`.
  Uploads are single use. Plain multipart files still work.
- **Cloudflare:** `src/worker.ts` checks the Access token and forwards the
  request to one `Ream` container (`standard-1`: ½ vCPU, 4 GiB). The
  `Dockerfile` builds ream and the frontend, then installs the tools from
  Debian, using LibreOffice's no-GUI packages. That keeps the image near
  650 MB; the Nix closure carries LibreOffice's desktop stack and comes to
  about 3 GB, which Cloudflare's runtime repeatedly failed to unpack. The flake
  stays the reference for development and the tests.

## Releases

Each user facing change adds a note with `pnpm changeset`. Every push to
`main` keeps one "chore: version packages" PR up to date with the next version
and its changelog; merging it tags `v<version>`, publishes a GitHub release and
deploys the Worker (when the repository has the `CLOUDFLARE_ACCOUNT_ID`
variable and the `CLOUDFLARE_API_TOKEN` and `REAM_DOMAIN` secrets; see
`.github/workflows/release.yml`). `package.nix` reads its version from
`package.json`, so the Nix package and the release always agree.
