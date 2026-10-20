{
  lib,
  buildGoModule,
  makeWrapper,
  stdenvNoCC,
  nodejs_22,
  pnpm_10,
  pnpmConfigHook,
  fetchPnpmDeps,
  pdfcpu,
  qpdf,
  ghostscript,
  img2pdf,
  poppler-utils,
  libreoffice,
}:
let
  # package.json carries the version; changesets bumps it on release.
  inherit ((lib.importJSON ./package.json)) version;

  # The top-level pnpm hooks default to the newest pnpm; pin them to pnpm 10 so
  # the build agrees with the committed (pnpm 10) lockfile.
  pnpm10ConfigHook = pnpmConfigHook.override { pnpm = pnpm_10; };
  fetchPnpm10Deps = fetchPnpmDeps.override { pnpm = pnpm_10; };

  # Static Astro site, built with pnpm and served by the Go binary out of
  # $REAM_WEBROOT. Nothing here is needed at runtime beyond the emitted dist.
  frontend = stdenvNoCC.mkDerivation (finalAttrs: {
    pname = "ream-frontend";
    inherit version;
    src = ./frontend;
    nativeBuildInputs = [
      nodejs_22
      pnpm_10
      pnpm10ConfigHook
    ];
    pnpmDeps = fetchPnpm10Deps {
      inherit (finalAttrs) pname version src;
      fetcherVersion = 3;
      hash = "sha256-4qRvQ0T8ZD7LY0OXUG9kpwK7eYDaRmtqBrV0alIRNmc=";
    };
    buildPhase = ''
      runHook preBuild
      pnpm build
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      cp -r dist $out
      runHook postInstall
    '';
  });

  # Runtime CLIs the server shells out to, wrapped onto PATH.
  runtimeTools = [
    pdfcpu
    qpdf
    ghostscript
    img2pdf
    poppler-utils
    libreoffice
  ];
in
buildGoModule {
  pname = "ream";
  inherit version;
  src = ./.;
  vendorHash = null; # stdlib only

  nativeBuildInputs = [ makeWrapper ];

  # Tests shell out to the CLIs; keep them out of the default build (libreoffice
  # is heavy) and run them via the flake's `checks` instead.
  doCheck = false;

  postInstall = ''
    wrapProgram $out/bin/ream \
      --prefix PATH : ${lib.makeBinPath runtimeTools} \
      --set REAM_WEBROOT ${frontend}
  '';

  meta = {
    description = "On-demand PDF utility server with an Astro UI";
    mainProgram = "ream";
    platforms = lib.platforms.linux;
  };
}
