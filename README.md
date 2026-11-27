# sign.app

Veröffentlicht die Sign-App: **Web-App** über GitHub Pages und **Android-App** (APK) über Capacitor.
Der Code entsteht in [signclip/sign](https://github.com/signclip/sign) im Ordner `app/`; hier liegt nur eine Kopie in `web/` (Stand in `web/VERSION`).

| Was | Wie |
| --- | --- |
| Kopie aktualisieren | `./sync.sh ../signclip/app`, dann committen |
| Web-App | jeder Push auf `main` → GitHub Pages, Adresse `https://signclip.github.io/sign.app/` (einmalig: Settings → Pages → Source: GitHub Actions) |
| Android-APK | jeder Push auf `main` → Actions → Lauf → Artifacts → `sign-debug-apk` |
| Bau-Art und Schlüssel | Standard: Debug-Bau mit Secret `DEBUG_KEYSTORE`. Variable `APK_BUILD` = `release` → Release-Bau (nicht debugbar). Secrets `RELEASE_KEYSTORE` (Base64), `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_PASSWORD` → eigener Schlüssel; neuer Schlüssel = neue App, installiert sich nicht über die alte |
| Bibliotheken | Whisper, SQLite, h3 und MediaPipe holt jeder Bau aus der npm-Registry, prüft sie gegen ihre SHA-512 und legt sie nach `web/lib/` (`native/libs.sh`, ≈ 39 MB, nicht im Repo). Kein Gerät lädt Code von einem anderen Server. Für den Server, der für atlas rechnet: `sh native/libs.sh /opt/sign/app/lib server` legt zusätzlich LiteRT-LM dazu (≈ 117 MB, nie in Web-App oder APK) |
| Modell für landmarks | `holistic_landmarker.task` (≈ 14 MB, von Google) kommt erst mit, wenn seine SHA-512 in `native/models.txt` steht. Der Lauf nennt die Zeile zum Eintragen (Actions → Lauf → Hinweise) |
| Vor `main` | jeder Push auf einen Branch baut beide Arten mit einem Schlüssel nur für diesen Lauf (`check`) |

App-Icon: `native/icon.py` zeichnet es einmal (Web-Größen nach signclip/sign `app/icons/`, Android nach `native/android/res`); die APK übernimmt `native/android/res` bei jedem Bau.

Keine Zugangsdaten in diesem Repo: Passwörter und Schlüssel liegen nur im Schlüsselbund des Geräts.
