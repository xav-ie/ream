{
  description = "ream — on-demand PDF tools (Go API + Astro UI)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs@{ flake-parts, treefmt-nix, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      imports = [ treefmt-nix.flakeModule ];

      perSystem =
        { config, pkgs, ... }:
        let
          # CLI tools the server (and its tests) shell out to.
          tools = with pkgs; [
            pdfcpu
            qpdf
            ghostscript
            img2pdf
            poppler-utils
            libreoffice
          ];
        in
        {
          packages.ream = pkgs.callPackage ./package.nix { };
          packages.default = config.packages.ream;

          # `nix fmt` / the formatting check. The frontend keeps its own prettier
          # (astro plugin) + lint toolchain, so it's excluded here; treefmt covers
          # Nix, Go, and the root docs/CI files (mirrors the dots config).
          treefmt =
            _:
            let
              # Format go.mod via `go mod edit -fmt`, as dots does.
              goModFormatterModule =
                { mkFormatterModule, ... }:
                {
                  imports = [
                    (mkFormatterModule {
                      name = "go-mod-fmt";
                      package = "go";
                      args = [
                        "mod"
                        "edit"
                        "-fmt"
                      ];
                      includes = [ "**/go.mod" ];
                    })
                  ];
                };
            in
            {
              imports = [ goModFormatterModule ];
              projectRootFile = "flake.nix";
              programs = {
                deadnix.enable = true;
                statix.enable = true;
                nixfmt.enable = true;
                gofmt.enable = true;
                go-mod-fmt.enable = true;
                prettier.enable = true;
              };
              settings = {
                on-unmatched = "fatal";
                excludes = [
                  "frontend/**" # formatted + checked by its own pnpm prettier (astro plugin)
                  "**/.gitignore"
                  ".envrc"
                  "flake.lock"
                  "go.sum"
                  "*.lock"
                  "result"
                  ".direnv/**"
                ];
              };
            };

          checks = {
            # The package must build (frontend + Go + wrapper).
            build = config.packages.default;

            # Behavioural tests of the API/CLI operations against generated fixtures.
            gotest =
              pkgs.runCommand "ream-gotest"
                {
                  nativeBuildInputs = [ pkgs.go ] ++ tools;
                }
                ''
                  cp -r ${./.} src && chmod -R +w src && cd src
                  export HOME="$TMPDIR" GOCACHE="$TMPDIR/go" GOFLAGS=-mod=mod GOPROXY=off CGO_ENABLED=0
                  go vet ./...
                  go test ./...
                  touch "$out"
                '';
          };

          devShells.default = pkgs.mkShell {
            packages = [
              pkgs.go
              pkgs.gopls
              pkgs.gotools
              pkgs.nodejs_22
              pkgs.pnpm_10
              config.treefmt.build.wrapper
            ]
            ++ tools;
            # `cd frontend && pnpm install` then `REAM_WEBROOT=frontend/dist go run .`.
            REAM_WEBROOT = "frontend/dist";
          };
        };
    };
}
