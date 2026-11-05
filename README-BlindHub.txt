Blind Hub v2.0
- Android: Kotlin (app/), package ID unchanged. Windows: Electron (electron/), `cd electron && npm install && npm start` / `npm run dist`.
- Shared Aeroplane Simulator page: shared/aeroplane (used by Electron iframe and Android WebView).
- Server: server/ (Firestore balance, Telegram bot: Allot Money / Reset Balance, /allot, /resetbalance, /balance).
- Run push_to_github.bat: GitHub Actions builds the .exe and the .apk (.github/workflows/build.yml).
