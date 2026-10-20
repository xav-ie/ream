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
 && mkdir -p /deps/nix/store /app/nix/store /app/etc /app/tmp \
 && for p in $(nix-store -qR result); do \
      case "$p" in \
        /nix/store/*-ream-*) cp -a "$p" /app/nix/store/ ;; \
        *) cp -a "$p" /deps/nix/store/ ;; \
      esac; \
    done \
 && touch -h -d @1 /deps /deps/nix /deps/nix/store \
 && ln -s "$(readlink -f result)/bin/ream" /app/ream \
 && chmod 1777 /app/tmp \
 && echo 'root:x:0:0::/tmp:/bin/false' > /app/etc/passwd \
 && echo 'root:x:0:' > /app/etc/group

FROM scratch
# Two layers: the tools' closure (LibreOffice and the rest, ~2.8 GB) only
# changes with nixpkgs, so a release that touches ream alone pushes just the
# small app layer. The fixed directory mtimes keep the deps layer byte-identical.
COPY --from=build /deps /
COPY --from=build /app /
# No socket activation here: ream binds the port itself, and the Container's
# sleepAfter (src/worker.ts), not ream's idle exit, stops it.
ENV REAM_HOST=0.0.0.0
EXPOSE 8086
CMD ["/ream", "--port", "8086"]
