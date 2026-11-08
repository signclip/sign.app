# signapp

Veröffentlicht die Sign-App: **Web-App** über GitHub Pages und **Android-App** (APK) über Capacitor.
Der Code entsteht in [signclip/signclip](https://github.com/signclip/signclip) im Ordner `app/`; hier liegt nur eine Kopie in `web/` (Stand in `web/VERSION`).

| Was | Wie |
| --- | --- |
| Kopie aktualisieren | `./sync.sh ../signclip/app`, dann committen |
| Web-App | jeder Push auf `main` → GitHub Pages (einmalig: Settings → Pages → Source: GitHub Actions) |
| Android-APK | jeder Push auf `main` → Actions → Lauf → Artifacts → `sign-debug-apk` |

Keine Zugangsdaten in diesem Repo: Passwörter und Schlüssel liegen nur im Schlüsselbund des Geräts.
