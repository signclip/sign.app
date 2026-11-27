#!/bin/sh
# harden.sh — what the Capacitor template leaves open, closed in the generated android/ (27.11., audit N4, N3).
# Run by both workflows after "cap add android", so a branch compiles exactly what main ships.
#   no backup: allowBackup off, and rules that keep everything out of cloud backup and device transfer
#   no clear text: usesCleartextTraffic off (the app talks https only)
# Every attribute is set once (replaced where the template has it, added where not) and checked: if the template
# changes so that one is missing or double, the build stops here.
set -eu
m=android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/res/xml
cp native/android/xml/data_extraction_rules.xml android/app/src/main/res/xml/data_extraction_rules.xml
attr() { # attr name value
  if grep -q "android:$1=" "$m"; then sed -i "s#android:$1=\"[^\"]*\"#android:$1=\"$2\"#" "$m"; else sed -i "s#<application#<application android:$1=\"$2\"#" "$m"; fi
  test "$(grep -c "android:$1=\"$2\"" "$m")" = 1
  test "$(grep -c "android:$1=" "$m")" = 1
}
attr allowBackup false
attr fullBackupContent false
attr dataExtractionRules @xml/data_extraction_rules
attr usesCleartextTraffic false
echo "harden: backup off, clear text off"
