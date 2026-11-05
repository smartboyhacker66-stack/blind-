Blind Hub v2.0
- Android: Kotlin (app/), package ID unchanged. Windows: Electron (electron/), `cd electron && npm install && npm start` / `npm run dist`.
- Shared Aeroplane Simulator page: shared/aeroplane (used by Electron iframe and Android WebView).
- Server: server/ (Firestore balance, Telegram bot: Allot Money / Reset Balance, /allot, /resetbalance, /balance).
- Run push_to_github.bat: GitHub Actions builds the .exe and the .apk (.github/workflows/build.yml).

v3.1 (aeroplane):
- रनवे पर दौड़ और हवा में उड़ान की आवाज़ें अलग हैं (रनवे: भारी गूँज; हवा: हल्की, ऊँची, ज़्यादा सनसनाहट).
- गति की बीप: गति जितनी बढ़े, सुर उतना ऊँचा और बीप उतनी तेज़; हर गति पर सुनाई देती है।

v3.2:
- एरोप्लेन: हवा में धीमी पंखे जैसी आवाज़; रनवे पर टायर की गड़गड़ाहट (गति के साथ); पहिये नीचे पर लैच की खटाक; टच-डाउन पर धड़ाम।
- नया खेल: Titanic: जीवित रहो (फ़ैसलों वाली कहानी, कई रास्ते, जीत या हार)।
