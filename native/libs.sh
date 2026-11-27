#!/bin/sh
# libs.sh <target folder> — the three libraries the app loads at run time, put beside the app (27.11., audit H5).
#
# Before, the app fetched them from jsDelivr on every device: whoever serves that address could hand the app other
# code. Now each build takes the packages once from the npm registry, checks every one against the SHA-512 written
# here (the registry's own "integrity" of that version) and copies only the files a browser needs:
#   <target>/transformers/  Whisper (transformers.js) and its runtime      ≈ 22.5 MB
#   <target>/sqlite/        SQLite as WebAssembly                          ≈ 1.6 MB
#   <target>/h3/            H3 cells for o_                                ≈ 0.5 MB
# The app (signclip/sign, 5-take/whisper-engine.js, 3-index/sqlite.js, 5-take/where.js) asks for exactly these paths.
# Run by all three workflows: web/lib for the web app and the APK. For the app straight from signclip/sign in a
# browser: sh native/libs.sh ../sign/app/lib (the folder is not kept in git).
# A new version = a new line here with its integrity (npm view <package>@<version> dist.integrity), nothing else.
set -eu
out=$1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
get() { # get <tarball address> <sha512, Base64> <folder> <files…>
  url=$1; want=$2; dir=$3; shift 3
  curl -fsSL --retry 3 -o "$tmp/p.tgz" "$url"
  got=$(openssl dgst -sha512 -binary "$tmp/p.tgz" | openssl base64 -A)
  if [ "$got" != "$want" ]; then echo "libs: $url is not the file expected"; echo "  got  sha512-$got"; echo "  want sha512-$want"; exit 1; fi
  rm -rf "$tmp/x" && mkdir -p "$tmp/x" "$out/$dir"
  tar -xzf "$tmp/p.tgz" -C "$tmp/x"
  for f in "$@"; do cp "$tmp/x/package/$f" "$out/$dir/"; done
  for l in LICENSE LICENSE.md; do if [ -f "$tmp/x/package/$l" ]; then cp "$tmp/x/package/$l" "$out/$dir/LICENSE"; fi; done # the licence travels with the files
  echo "libs: $dir ← $(basename "$url")"
}
get https://registry.npmjs.org/@huggingface/transformers/-/transformers-3.8.1.tgz \
  'tsTk4zVjImqdqjS8/AOZg2yNLd1z9S5v+7oUPpXaasDRwEDhB+xnglK1k5cad26lL5/ZIaeREgWWy0bs9y9pPA==' transformers \
  dist/transformers.min.js dist/ort-wasm-simd-threaded.jsep.mjs dist/ort-wasm-simd-threaded.jsep.wasm
get https://registry.npmjs.org/@sqlite.org/sqlite-wasm/-/sqlite-wasm-3.54.1-build1.tgz \
  'foW427VBLJ3G87bsnvQTZCc9zYe0Fq1wH0pz1I6BlKLKXcArIAyTkHtq0iT2llmhcMQt9T/p6l5PpQQh+6O8uQ==' sqlite \
  dist/index.mjs dist/sqlite3.wasm dist/sqlite3-opfs-async-proxy.js
get https://registry.npmjs.org/h3-js/-/h3-js-4.5.0.tgz \
  'uKmdPc+DuarnR+XqZxEuWOMw7KzzKROrx3MLeJpFnMOs78S9M5eZ+X5RieS9UcSFQqbeXzbfWuX/W9Pyajinqw==' h3 \
  dist/browser/h3-js.es.js
du -sh "$out" | cut -f1
