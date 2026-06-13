# ream

[![Checks](https://github.com/xav-ie/ream/actions/workflows/checks.yml/badge.svg)](https://github.com/xav-ie/ream/actions/workflows/checks.yml)

On-demand, self-hosted PDF tools — a tiny Go server that shells out to
battle-tested CLIs (`pdfcpu`, `qpdf`, `ghostscript`, `img2pdf`, `poppler`,
`libreoffice`), behind a small Astro + UnoCSS UI.

It's built to cost **nothing at idle**: under socket activation no process runs
until a request arrives, and the server exits itself after 5 minutes of
inactivity. Files are processed in a per-request temp dir and never persisted.

## Tools

| Tool              | Does                                                     |
| ----------------- | -------------------------------------------------------- |
| Compress          | Shrink file size (target a max MB, or a quality preset). |
| Images → PDF      | One image per page; drag to set order.                   |
| Merge             | Combine several PDFs into one.                           |
| Office → PDF      | Word, Excel, ODF, and more (via LibreOffice).            |
| PDF → Images      | A PNG per page, returned as a zip.                       |
| Reorder / extract | Pick a page sequence or range.                           |
| Split             | One PDF per page, as a zip.                              |

The UI's reorder/merge/images grids support drag-to-reorder, typed page ranges,
duplicate/remove, and click-to-preview (lightbox for images and PDF pages).

## How it works

A single Go binary (`main.go`, stdlib only) serves the static frontend from
`$REAM_WEBROOT` and exposes `POST /api/<tool>` endpoints that take a multipart
upload, run the relevant CLI (bounded by a per-op timeout, with the request body
capped at 512 MiB), and stream the result back. There is no database and no
on-disk state.

- **Socket activation**: if started with `LISTEN_FDS`/`LISTEN_PID` set (e.g. by
  a systemd `.socket`), it adopts the inherited listener; otherwise it binds
  `--port` (default `8086`).
- **Idle exit**: an in-flight-request counter lets it shut down after 5 minutes
  with nothing happening, so socket activation re-spawns it on the next request.

## Develop

A flake-parts dev shell provides Go, Node/pnpm, and all the runtime CLIs:

```sh
nix develop            # or: direnv allow  (an .envrc is included)
cd frontend && pnpm install && pnpm build   # emits frontend/dist
REAM_WEBROOT=frontend/dist go run .          # http://localhost:8086
```

For frontend iteration, `cd frontend && pnpm dev` runs the Astro dev server.

## Build (Nix)

```sh
nix build              # ./result/bin/ream, frontend + CLIs wrapped onto PATH
```

The package (`package.nix`) builds the Astro site with pnpm, compiles the Go
binary, and wraps it so `$REAM_WEBROOT` and the CLI tools are baked in — the
result runs anywhere with no further setup.

## Formatting

`treefmt` (via `nix fmt`) owns Nix, Go, and the root docs/CI files
(`nixfmt`/`deadnix`/`statix`, `gofmt`, `go-mod-fmt`, `prettier`). The frontend
keeps its own plugin-aware prettier (`cd frontend && pnpm format`), since it
needs `prettier-plugin-astro`.

## CI

[`.github/workflows/checks.yml`](.github/workflows/checks.yml) runs on every
push to `main` and on pull requests, in two parts:

- **`frontend`** — a matrix of one job per check so failures stay isolated:
  `lint` (eslint), `knip` (dead code), `astro` (type/diagnostics check),
  `format` (prettier `--check`), and `fallow` (complexity gate).
- **`nix`** — `nix flake check`, which reproducibly runs:
  - `build` — the full package (frontend + Go binary + wrapper),
  - `gotest` — `go vet` + `go test` against fixtures generated at test time
    (the flake wires in ghostscript/qpdf/libreoffice/… so the tests can shell
    out to the real tools, no apt setup),
  - `treefmt` — the formatting check for Nix/Go/root files.
