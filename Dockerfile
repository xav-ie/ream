# Cloudflare Containers image. Debian's no-GUI LibreOffice keeps it near 1 GB;
# the Nix closure (package.nix) carries LibreOffice's desktop stack and comes
# to ~3 GB, which Cloudflare's runtime fails to unpack. The flake still owns
# development and the tests.
FROM docker.io/library/golang:1.25-trixie@sha256:2c4c60ef415fbfa5e90300722293bef36c5e63fae17570ce18f580af933dbd73 AS go
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ream . \
 && CGO_ENABLED=0 GOBIN=/out go install -trimpath -ldflags="-s -w" github.com/pdfcpu/pdfcpu/cmd/pdfcpu@v0.12.1

FROM docker.io/library/node:24-trixie-slim@sha256:27526714fd6b7dc938f8cb1665bf1fe749efadadf0145d5bcc07f0fbd0370b60 AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM docker.io/library/debian:trixie-slim@sha256:918311b7b6c4c6f68b232ba516584925f6c78ad82b6fd534b98979df6438e483
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ghostscript qpdf poppler-utils img2pdf \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-dejavu-core fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea \
 && rm -rf /var/lib/apt/lists/*
COPY --from=go /out/ream /out/pdfcpu /usr/local/bin/
COPY --from=web /src/frontend/dist /srv/ream
# No socket activation here: ream binds the port itself, and the Container's
# sleepAfter (src/worker.ts), not ream's idle exit, stops it.
ENV REAM_HOST=0.0.0.0 REAM_WEBROOT=/srv/ream
EXPOSE 8086
CMD ["ream", "--port", "8086"]
