Blind Hub v2.0
- Android: Kotlin (app/), package ID unchanged. Windows: Electron (electron/), `cd electron && npm install && npm start` / `npm run dist`.

- Server: server/ (Firestore balance, Telegram bot: Allot Money / Reset Balance, /allot, /resetbalance, /balance).
- Run push_to_github.bat: creates upload.jks if missing, copies its Base64 to the clipboard, pushes. GitHub Actions then builds BlindHub-playstore-signed-yes.aab (Play Store), BlindHub-release-signed-yes.apk (install) and the Windows .exe. Files named "-no" mean the signing secrets are missing.
- Removed: Aeroplane Simulator. No Titanic module exists in this project.
