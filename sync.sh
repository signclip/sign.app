#!/bin/sh
# sync.sh — copy the app from signclip/sign (the one source) into web/. Run from this folder.
# The code is written in signclip/app; this repo only publishes it (GitHub Pages) and builds the APK.
set -e
SRC="${1:-../signclip/app}"
rm -rf web && mkdir web
cp -R "$SRC"/index.html "$SRC"/confirm.html "$SRC"/manifest.json "$SRC"/sw.js "$SRC"/project.json web/
for d in 0-i18n 1-model 2-storage 3-index 4-save 5-take 7-similar 8-join 9-ui icons; do cp -R "$SRC/$d" web/; done
# the base map under Similar's spots (26.11.): only the tiles and their list, not the script that makes them
mkdir web/basemap && cp "$SRC"/basemap/*.json web/basemap/
git -C "$(dirname "$SRC")" log -1 --format='%H %cs' > web/VERSION
echo "web/ from $(cat web/VERSION)"
