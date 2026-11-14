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
- v4.2: ऐप खुलते समय बड़े दरवाज़े के खुलने और मैग्नेट खिंचाव की आवाज़ (app_open_door)। पहली किस्त का पहला हिस्सा।
- v4.3: TTS इंजन चुनना (घोषणा और खेल की आवाज़ अलग); सेटिंग में 'आवाज़ की सेटिंग' बटन; Android पर ट्रेन खेल पहले से जुड़ा। बाक़ी खेलों और Windows/वेब में अगले चरण में।
- v4.4: तेज़ गति पर अपने-आप रुकने वाला स्टॉप बंद (100 किमी/घंटा से ऊपर भी नहीं)। रास्ता मांगने का फ़ीचर रहेगा।

v4.10 (सर्वर):
- बॉट: /shop on|off|status (दुकान चालू/बंद), /price आइटम रकम (कीमत), /promo कोड रकम (प्रोमो कोड, हर खिलाड़ी एक बार), /promooff कोड.
- सर्वर: GET /api/shop (सार्वजनिक: खुली है या नहीं, कीमतें), POST /api/shop/buy (गेम रुपये से खरीद, बैलेंस घटता है), POST /api/promo/redeem (प्रोमो से गेम रुपये जुड़ते हैं).
- ऐप का दुकान स्क्रीन अभी सिर्फ़ जानकारी दिखाती है; खरीदने का बटन अगले चरण में।
- v4.11: बॉट में बटन मेन्यू (/menu): दुकान खोलें/बंद, स्थिति, आँकड़े, सूचनाएँ, कमांड सूची. सारी सर्वर जाँचें पास.

v4.12:
- दुकान (ऐप): इंजन खरीदना (तेज़/भारी/सुपर, गेम रुपये से, भुगतान की आवाज़ और घोषणा), प्रोमो कोड, बैंक (सिक्के से गेम रुपये). दुकान और सिक्का बदलना एडमिन के हाथ में (शुरू में बंद).
- खरीदे इंजन ट्रेन खेल में असर करते हैं: तेज़ (रफ़्तार जल्दी), भारी (ब्रेक ज़्यादा), सुपर (दोनों).
- बॉट: /menu बटन, /shop, /price, /promo, /promooff, /convert, /rate; सहमति की ऑडियो के साथ मंज़ूर/नामंज़ूर बटन.
- कमरे का लिंक (कैरम और बाइक रेस): शेयर करने पर वेबसाइट का join.html लिंक जाता है; खुलने पर ऐप खुलकर सीधे कमरे में जुड़ता है (blindhub://join).
- वेबसाइट: join.html नया पेज (web-2.9.3).
