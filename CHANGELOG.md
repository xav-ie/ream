# ream

## 0.3.0

### Minor Changes

- 4f5a0c1: Chain tools: after a tool saves a PDF, a "Continue with" row opens the next tool with that result already loaded.

## 0.2.2

### Patch Changes

- eefec8c: Build the container image on Debian with LibreOffice's no-GUI packages. It shrinks from about 3 GB to 650 MB, which Cloudflare's runtime can unpack, so the container starts again.

## 0.2.1

### Patch Changes

- 2ac0e8f: Ship the container image as two layers, the tools and ream itself, so a release uploads only the small app layer and Cloudflare no longer has to unpack one 3 GB layer.

## 0.2.0

### Minor Changes

- 567d28a: Run on Cloudflare Containers, with a Deploy to Cloudflare button. The Worker checks the Cloudflare Access token on every request, and the UI uploads files in chunks so files over Cloudflare's 100 MB request limit work.
