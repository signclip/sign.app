#!/bin/sh
# libs.sh <target folder> [server] — the libraries the app loads at run time, put beside the app (27.11., audit H5).
#
# Before, the app fetched them from jsDelivr on every device: whoever serves that address could hand the app other
# code. Now each build takes the packages once from the npm registry, checks every one against the SHA-512 written
# here (the registry's own "integrity" of that version) and copies only the files a browser needs:
#   <target>/transformers/  Whisper (transformers.js) and its runtime      ≈ 22.5 MB
#   <target>/sqlite/        SQLite as WebAssembly                          ≈ 1.6 MB
#   <target>/h3/            H3 cells for o_                                ≈ 0.5 MB
#   <target>/mediapipe/     MediaPipe's vision tasks (landmarks :~l)       ≈ 15 MB, its model ≈ 14 MB (see model below)
# The app (signclip/sign, 5-take/whisper-engine.js, 3-index/sqlite.js, 5-take/where.js) asks for exactly these paths.
# With `server` as second word, for the server that computes for atlas (signclip/sign gateway/compute.mjs) – never for
# the web app or the APK, it is far too large for a phone:
#   <target>/litert-lm/     LiteRT-LM (vectors by EmbeddingGemma 2)        ≈ 117 MB, its model beside it (see model below)
#   <target>/litertjs/      its helper, one file                           ≈ 2 KB
#   on the server:  sh native/libs.sh /opt/sign/app/lib server
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
get https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.3.tgz \
  'sxJyfhbN+EamexhaaCmUlw7v8vWWMum7VDsORe6d4c8Dk/xlI4qiIgoSw9cE9hpvYhVRRVLIA8y605FbqWkNeQ==' mediapipe \
  vision_bundle.mjs wasm/vision_wasm_module_internal.js wasm/vision_wasm_module_internal.wasm

tree() { # tree <tarball address> <sha512, Base64> <folder> <folders of the package…>: whole folders, as they are
  url=$1; want=$2; dir=$3; shift 3
  curl -fsSL --retry 3 -o "$tmp/p.tgz" "$url"
  got=$(openssl dgst -sha512 -binary "$tmp/p.tgz" | openssl base64 -A)
  if [ "$got" != "$want" ]; then echo "libs: $url is not the file expected"; echo "  got  sha512-$got"; echo "  want sha512-$want"; exit 1; fi
  rm -rf "$tmp/x" && mkdir -p "$tmp/x" "$out/$dir"
  tar -xzf "$tmp/p.tgz" -C "$tmp/x"
  for d in "$@"; do rm -rf "$out/$dir/$d"; cp -R "$tmp/x/package/$d" "$out/$dir/$d"; done
  echo "libs: $dir ← $(basename "$url")"
}
if [ "${2:-}" = server ]; then
  tree https://registry.npmjs.org/@litert-lm/core/-/core-0.20.0.tgz \
    'F89VykxY1aIGeB5TzkASMwaYPGgOd8AFxURPHvnnz4CoRm9yLn/IMJvtnCxsuBOCsIKClnheJz+NmwtEDXSOBg==' litert-lm dist wasm
  get https://registry.npmjs.org/@litertjs/wasm-utils/-/wasm-utils-2.6.0.tgz \
    'rxARtl8owf+aPV2TsMiAClYDBaEDemML3PjrzBxIpGCvv6POswR7068Kt0sIkrK5XvKkY2Z+JLcm3a9CHmvuUg==' litertjs dist/index.js
fi

# A model is no npm package: it is taken from its maker's address and checked against the SHA-512 a person wrote
# into native/models.txt (one line: <name> <sha512 as Base64>). No line yet, or another file than the line says:
# the model is left out and the run says so with the hash it saw – the app then computes no landmarks, everything
# else works. Nothing unchecked ever goes beside the app.
model() { # model <address> <folder> <name>
  url=$1; dir=$2; name=$3
  want=$(grep "^$name " "$(dirname "$0")/models.txt" 2>/dev/null | cut -d' ' -f2 || true)
  if ! curl -fsSL --retry 3 -o "$tmp/m" "$url"; then echo "::warning::libs: $name could not be fetched, left out"; return 0; fi
  got=$(openssl dgst -sha512 -binary "$tmp/m" | openssl base64 -A)
  if [ -z "$want" ]; then echo "::notice::libs: $name is not in native/models.txt yet, left out. To take it in, add this line there: $name $got"; return 0; fi
  if [ "$got" != "$want" ]; then echo "::warning::libs: $name is not the file native/models.txt names, left out. It is now: $name $got"; return 0; fi
  mkdir -p "$out/$dir" && cp "$tmp/m" "$out/$dir/$name"
  echo "libs: $dir ← $name"
}
model https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task \
  mediapipe holistic_landmarker.task
if [ "${2:-}" = server ]; then
  model https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm/resolve/main/embeddinggemma-2-740m.litertlm \
    litert-lm embeddinggemma-2.litertlm
fi
du -sh "$out" | cut -f1
