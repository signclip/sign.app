#!/bin/sh
# signing.sh <keystore> — name the signing key for both build types in the generated android/app/build.gradle.
# Run by both workflows: android.yml with the project's key, check.yml with a key made for that one run, so the way an
# APK is signed is tried on every branch. The passwords come from the environment (KS_PASS, KEY_PASS) and are read by
# Gradle from there; they are never written into a file.
set -eu
ks=$1
alias=$(keytool -list -keystore "$ks" -storepass "$KS_PASS" | grep -m1 PrivateKeyEntry | cut -d, -f1)
test -n "$alias"
echo "alias: $alias"
keytool -list -v -keystore "$ks" -storepass "$KS_PASS" | grep -m1 'SHA256'
# Gradle on the runner did not take ~/.android by itself (each APK had a new key): the key is named explicitly
printf '\nandroid {\n    signingConfigs { sign { storeFile file("%s"); storePassword System.getenv("KS_PASS"); keyAlias "%s"; keyPassword System.getenv("KEY_PASS") } }\n    buildTypes {\n        debug { signingConfig signingConfigs.sign }\n        release { signingConfig signingConfigs.sign }\n    }\n}\n' "$ks" "$alias" >> android/app/build.gradle
tail -8 android/app/build.gradle
