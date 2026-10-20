---
"ream": patch
---

Ship the container image as two layers, the tools and ream itself, so a release uploads only the small app layer and Cloudflare no longer has to unpack one 3 GB layer.
