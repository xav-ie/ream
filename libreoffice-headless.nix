# LibreOffice for `--headless --convert-to` only. nixpkgs builds it as a desktop
# app (help in 31 languages, GTK, GStreamer, Java, Python), a ~2.8 GB closure;
# this copies the cached build and deletes what conversion never loads, which
# also drops those dependencies from the closure (~900 MB). No compiling.
{
  lib,
  runCommand,
  writeShellScriptBin,
  makeFontsConf,
  perl,
  coreutils,
  gnugrep,
  gnused,
  libreoffice,
  dejavu_fonts,
  liberation_ttf,
  carlito,
  caladea,
}:
let
  src = libreoffice.unwrapped;
  # Same name as src, so the store path keeps its length and the hash rewrite
  # below is a byte-for-byte swap inside binaries.
  trimmed = runCommand src.name { nativeBuildInputs = [ perl ]; } ''
    cp -a ${src} $out
    chmod -R u+w $out
    lo=$out/lib/libreoffice
    rm -rf $lo/help $lo/program/classes
    find $lo/program/resource -mindepth 1 -maxdepth 1 ! -name en-US -exec rm -rf {} +
    find $lo/share/registry -name 'Langpack-*.xcd' ! -name 'Langpack-en-US.xcd' -delete
    rm -f $lo/program/libvclplug_gtk3lo.so $lo/program/liblibreofficekitgtk.so \
          $lo/program/libavmediagst.so $lo/program/libjava*.so \
          $lo/program/libofficebean.so $lo/program/libpythonloaderlo.so \
          $lo/program/libpyuno.so $lo/program/pyuno.so
    old=$(basename ${src} | cut -c1-32)
    new=$(basename $out | cut -c1-32)
    find $out -type f -print0 | xargs -0 perl -pi -e "s/$old/$new/g"
  '';
  fonts = makeFontsConf {
    fontDirectories = [
      dejavu_fonts
      liberation_ttf
      carlito
      caladea
    ];
  };
in
writeShellScriptBin "libreoffice" ''
  export PATH=${
    lib.makeBinPath [
      coreutils
      gnugrep
      gnused
    ]
  }:$PATH
  export FONTCONFIG_FILE=${fonts} SAL_USE_VCLPLUGIN=svp
  exec ${trimmed}/lib/libreoffice/program/soffice "$@"
''
