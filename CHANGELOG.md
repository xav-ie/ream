# ream

## 0.2.1

### Patch Changes

- 2ac0e8f: Ship the container image as two layers, the tools and ream itself, so a release uploads only the small app layer and Cloudflare no longer has to unpack one 3 GB layer.

## 0.2.0

### Minor Changes

- 567d28a: Run on Cloudflare Containers, with a Deploy to Cloudflare button. The Worker checks the Cloudflare Access token on every request, and the UI uploads files in chunks so files over Cloudflare's 100 MB request limit work.
