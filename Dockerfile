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
 && mkdir -p /image/nix/store /image/etc /image/tmp \
 && cp -a $(nix-store -qR result) /image/nix/store/ \
 && ln -s "$(readlink -f result)/bin/ream" /image/ream \
 && chmod 1777 /image/tmp \
 && echo 'root:x:0:0::/tmp:/bin/false' > /image/etc/passwd \
 && echo 'root:x:0:' > /image/etc/group

FROM scratch
COPY --from=build /image /
# No socket activation here: ream binds the port itself, and the Container's
# sleepAfter (src/worker.ts), not ream's idle exit, stops it.
ENV REAM_HOST=0.0.0.0
EXPOSE 8086
CMD ["/ream", "--port", "8086"]
