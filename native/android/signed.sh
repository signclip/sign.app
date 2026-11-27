#!/bin/sh
# signed.sh <apk> <keystore> — is this APK signed with this key? Stops the build if not: an APK with another key
# would conflict with the installed app.
set -eu
got=$("$(ls -d "$ANDROID_HOME"/build-tools/* | tail -1)/apksigner" verify --print-certs "$1" | grep -m1 'SHA-256' | awk '{print $NF}')
want=$(keytool -list -v -keystore "$2" -storepass "$KS_PASS" | grep -m1 'SHA256' | awk '{print $NF}' | tr -d ':' | tr 'A-F' 'a-f')
echo "apk $got · key $want"
test "$got" = "$want"
