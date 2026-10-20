# ream

## 0.2.0

### Minor Changes

- 567d28a: Run on Cloudflare Containers, with a Deploy to Cloudflare button. The Worker checks the Cloudflare Access token on every request, and the UI uploads files in chunks so files over Cloudflare's 100 MB request limit work.
