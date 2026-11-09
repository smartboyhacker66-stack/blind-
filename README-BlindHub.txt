Blind Hub v2.0
- Android: Kotlin (app/), package ID unchanged. Windows: Electron (electron/), `cd electron && npm install && npm start` / `npm run dist`.

- Server: server/ (Firestore balance, Telegram bot: Allot Money / Reset Balance, /allot, /resetbalance, /balance).
- Run push_to_github.bat: creates upload.jks if missing, copies its Base64 to the clipboard, pushes. GitHub Actions then builds BlindHub-playstore-signed-yes.aab (Play Store), BlindHub-release-signed-yes.apk (install) and the Windows .exe. Files named "-no" mean the signing secrets are missing.
- Removed: Aeroplane Simulator. No Titanic module exists in this project.

v4.1:
- लॉगिन अब यूज़रनेम और पासवर्ड से (पुरानी आईडी भी चलती है); हर यूज़रनेम अनोखा।
- Telegram जोड़ना और पासवर्ड भूलने पर Telegram कोड से रीसेट।
- 13 से कम उम्र: अभिभावक की आवाज़ की ऑडियो फ़ाइल अपलोड (माइक्रोफ़ोन की अनुमति नहीं), एडमिन बॉट को फ़ाइल जाती है, भेजते ही खाता चालू; एडमिन /suspend नाम से रोक सकता है।
- एडमिन: /notifyuser नाम पाठ (निजी सूचना), /suspend, /unsuspend; ban/allot/balance अब यूज़रनेम से भी।
- ऑनलाइन बाइक रेस (दो दोस्त): कोड से कमरा, 5 सेकंड की गिनती, गैस, ब्रेक, बूस्ट, मोड़ पर फिसलना, आगे-पीछे की घोषणा।
- एक्सप्रेस और लोकल के साइड के नियम; खाता मिटाना; दुकान (12 दिसंबर); गोपनीयता नीति का लिंक।
- सर्वर जाँचें: test/run.js, admin.js, account.js, features.js सब पास।

MSIX (Microsoft Store):
- msix/ holds the Store manifest template, logos and store-identity.txt. Game code is not touched.
- Open msix/store-identity.txt and paste the three values from Partner Center (Product identity). Then run push_to_github.bat.
- GitHub Actions workflow msix.yml packs the Electron app into BlindHub.msix. The script waits for it and saves it to Desktop\Packages.
- The MSIX is unsigned: upload it to Partner Center, which signs it for the Store. To test locally you must sign it yourself.
