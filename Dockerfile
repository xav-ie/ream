# Builds ream with Nix, so package.nix stays the one definition of the app and
# the CLIs it runs, then copies only its runtime closure into an empty image.
# wrangler builds this for Cloudflare Containers (Deploy button, CI, and
# `pnpm run deploy`); it needs nothing on the host but Docker or Podman.
FROM docker.io/nixos/nix:2.35.3@sha256:62c506c32c75395163676006f0c00d75c31578fffaac1167d600289f72477b78 AS build
WORKDIR /src
COPY . .
RUN nix --extra-experimental-features "nix-command flakes" \
      --option filter-syscalls false --option sandbox false \
      build .#ream \
 && for i in big0 big1 big2 big3 $(seq 0 31); do mkdir -p /layers/$i/nix/store; done \
 && mkdir -p /app/nix/store /app/etc /app/tmp \
 && for p in $(nix-store -qR result); do \
      case "$p" in \
        /nix/store/*-ream-*) cp -a "$p" /app/nix/store/ ;; \
        *) if [ "$(du -sm "$p" | cut -f1)" -gt 256 ]; then \
             find "$p" -type d -exec sh -c 'for d; do for i in 0 1 2 3; do mkdir -p "/layers/big$i$d"; done; done' sh {} + ; \
             find "$p" ! -type d | while read -r f; do \
               cp -a "$f" "/layers/big$(( $(printf %s "$f" | cksum | cut -d' ' -f1) % 4 ))$f"; \
             done; \
           else cp -a "$p" "/layers/$(( $(printf %s "$p" | cksum | cut -d' ' -f1) % 32 ))/nix/store/"; fi ;; \
      esac; \
    done \
 && find /layers -type d -exec touch -h -d @1 {} + \
 && ln -s "$(readlink -f result)/bin/ream" /app/ream \
 && chmod 1777 /app/tmp \
 && echo 'root:x:0:0::/tmp:/bin/false' > /app/etc/passwd \
 && echo 'root:x:0:' > /app/etc/group

FROM scratch
# Cloudflare's runtime refuses to unpack a layer holding all of LibreOffice
# (~530 MB of it in one layer fails every time; the same files over two layers
# start), so any store path over 256 MB is spread file by file over four
# layers, and the rest of the closure over 32 by a stable hash of each path.
# A layer only changes when one of its paths does, so a release that touches
# ream alone pushes just the small app layer; fixed directory mtimes keep the
# rest byte-identical.
COPY --from=build /layers/big0 /
COPY --from=build /layers/big1 /
COPY --from=build /layers/big2 /
COPY --from=build /layers/big3 /
COPY --from=build /layers/0 /
COPY --from=build /layers/1 /
COPY --from=build /layers/2 /
COPY --from=build /layers/3 /
COPY --from=build /layers/4 /
COPY --from=build /layers/5 /
COPY --from=build /layers/6 /
COPY --from=build /layers/7 /
COPY --from=build /layers/8 /
COPY --from=build /layers/9 /
COPY --from=build /layers/10 /
COPY --from=build /layers/11 /
COPY --from=build /layers/12 /
COPY --from=build /layers/13 /
COPY --from=build /layers/14 /
COPY --from=build /layers/15 /
COPY --from=build /layers/16 /
COPY --from=build /layers/17 /
COPY --from=build /layers/18 /
COPY --from=build /layers/19 /
COPY --from=build /layers/20 /
COPY --from=build /layers/21 /
COPY --from=build /layers/22 /
COPY --from=build /layers/23 /
COPY --from=build /layers/24 /
COPY --from=build /layers/25 /
COPY --from=build /layers/26 /
COPY --from=build /layers/27 /
COPY --from=build /layers/28 /
COPY --from=build /layers/29 /
COPY --from=build /layers/30 /
COPY --from=build /layers/31 /
COPY --from=build /app /
# No socket activation here: ream binds the port itself, and the Container's
# sleepAfter (src/worker.ts), not ream's idle exit, stops it.
ENV REAM_HOST=0.0.0.0
EXPOSE 8086
CMD ["/ream", "--port", "8086"]
