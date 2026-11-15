# sign.app

Veröffentlicht die Sign-App: **Web-App** über GitHub Pages und **Android-App** (APK) über Capacitor.
Der Code entsteht in [signclip/sign](https://github.com/signclip/sign) im Ordner `app/`; hier liegt nur eine Kopie in `web/` (Stand in `web/VERSION`).

| Was | Wie |
| --- | --- |
| Kopie aktualisieren | `./sync.sh ../signclip/app`, dann committen |
| Web-App | jeder Push auf `main` → GitHub Pages, Adresse `https://signclip.github.io/sign.app/` (einmalig: Settings → Pages → Source: GitHub Actions) |
| Android-APK | jeder Push auf `main` → Actions → Lauf → Artifacts → `sign-debug-apk` |

App-Icon: `native/icon.py` zeichnet es einmal (Web-Größen nach signclip/sign `app/icons/`, Android nach `native/android/res`); die APK übernimmt `native/android/res` bei jedem Bau.

Keine Zugangsdaten in diesem Repo: Passwörter und Schlüssel liegen nur im Schlüsselbund des Geräts.
