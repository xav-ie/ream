---
"ream": patch
---

Build the container image with Nix again. LibreOffice is trimmed to what headless conversion needs (~900 MB instead of ~2.8 GB), and large store paths are spread over several layers, which Cloudflare's runtime needs to unpack them.
