package com.blindindiantech.blindcarrom

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

class TutorialActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var index = 0
    private lateinit var title: TextView
    private lateinit var body: TextView
    private lateinit var chapters: List<Pair<String, String>>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_tutorial)
        Sfx.init(this)
        chapters = buildChapters()
        title = findViewById(R.id.tutTitle)
        body = findViewById(R.id.tutBody)
        tts = TextToSpeech(this, this)

        findViewById<Button>(R.id.btnTutRead).setOnClickListener {
            Fx.press(this, "info")
            read()
        }
        findViewById<Button>(R.id.btnTutNext).setOnClickListener {
            Fx.press(this, "next_coin")
            if (index < chapters.size - 1) show(index + 1) else announce(L.tr("यह आख़िरी अध्याय है.", "This is the last chapter."))
        }
        findViewById<Button>(R.id.btnTutPrev).setOnClickListener {
            Fx.press(this, "back")
            if (index > 0) show(index - 1) else announce(L.tr("यह पहला अध्याय है.", "This is the first chapter."))
        }
        findViewById<Button>(R.id.btnTutDemo).setOnClickListener {
            Fx.press(this, "demo")
            tts?.stop()
            val i = Intent(this, GameActivity::class.java)
            i.putExtra("mode", "demo")
            i.putExtra("rules", "icf")
            startActivity(i)
        }
        findViewById<Button>(R.id.btnTutBack).setOnClickListener {
            Fx.press(this, "back")
            finish()
        }
        show(0)
    }

    private fun talkBackOn(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        return am.isEnabled && am.isTouchExplorationEnabled
    }

    private fun announce(text: String) {
        if (talkBackOn()) title.announceForAccessibility(text) else if (ttsReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tut")
        }
    }

    private fun show(i: Int) {
        index = i
        title.text = L.tr(
            "अध्याय ${i + 1} में से ${chapters.size}: ${chapters[i].first}",
            "Chapter ${i + 1} of ${chapters.size}: ${chapters[i].first}"
        )
        body.text = chapters[i].second
        if (talkBackOn()) {
            body.post { title.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }
        } else {
            read()
        }
    }

    private fun read() {
        if (!ttsReady) return
        tts?.speak("${title.text}. ${body.text}", TextToSpeech.QUEUE_FLUSH, null, "tut")
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.setLanguage(Locale.ENGLISH)
            }
            ttsReady = true
            if (!talkBackOn()) read()
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }

    private fun buildChapters(): List<Pair<String, String>> = if (L.isHindi()) listOf(
        "स्वागत" to "Blind Carrom नेत्रहीन खिलाड़ियों के लिए बना कैरम का खेल है, जो पूरी तरह आवाज़ से खेला जाता है. " +
            "आप कंप्यूटर के साथ खेल सकते हैं, या एक ही फ़ोन पर किसी दोस्त के साथ. " +
            "खेल हर चीज़ बोलकर बताता है: क्या हुआ, किसकी बारी है, और कितनी गोटियाँ बाकी हैं. यह ऐप Blind Indian Tech Support की स्वयंसेवी पहल है.",
        "मुख्य मेनू" to "मुख्य मेनू में ये बटन हैं. कंप्यूटर के साथ खेलें. लोकल मल्टीप्लेयर, जिसमें दो खिलाड़ी एक फ़ोन पर बारी-बारी खेलते हैं. " +
            "नियम का बटन, जो असली कैरम के पच्चीस अंक वाले मैच और सादे एक बोर्ड वाले खेल के बीच बदलता है. " +
            "ऑडियो ट्यूटोरियल, जो आप अभी सुन रहे हैं. सेटिंग, जिसमें आवाज़, कंपन और भाषा है. और सहायता, जहाँ से आप हमें ईमेल कर सकते हैं.",
        "अपनी बारी कैसे खेलें" to "बारी में चार काम होते हैं. पहला, स्ट्राइकर को बाएँ या दाएँ बटन से सरकाइए. स्ट्राइकर की पंद्रह स्थितियाँ हैं, और स्थिति आठ बोर्ड का बीच है. " +
            "दूसरा, निशाना बाएँ या दाएँ घुमाइए. हर दबाव पाँच डिग्री का है. तीसरा, ताकत एक से दस के बीच चुनिए, जहाँ दस सबसे तेज़ है. चौथा, शॉट मारें बटन दबाइए. " +
            "विस्तार से सुनें बटन बताता है कि स्ट्राइकर कहाँ है, निशाना किधर है, ताकत कितनी है और सामने क्या है. स्कोर सुनें बटन स्कोर बताता है.",
        "निशाने की आवाज़ें" to "निशाना बदलते ही एक बीप सुनाई देती है, जो बताती है कि सामने क्या है. नीची धीमी बीप का मतलब है कि सामने कोई गोटी नहीं. " +
            "दो तेज़ ऊँची बीप का मतलब है कि गोटी बहुत पास है. हल्की सी एक बीप का मतलब है कि गोटी मध्यम दूरी पर है. पूरी आवाज़ की एक बीप का मतलब है कि गोटी दूर है. " +
            "इसके बाद खेल बोलकर बताता है कि सामने सफ़ेद गोटी है, काली है या रानी, और क्या वह पॉकेट की सीध में है.",
        "निशाने की मदद" to "निशाना सीधा करें बटन निशाने को एक दबाव में सीधा कर देता है. स्ट्राइकर बीच में लाएँ बटन स्ट्राइकर को बीच में ले आता है. " +
            "बारीक मोड बदलें बटन से निशाना एक डिग्री के और स्ट्राइकर दस इकाई के कदम से चलता है, जिससे ठीक सीध बैठाना आसान होता है. फिर वही बटन दबाने पर बड़े कदम लौट आते हैं. " +
            "अगली गोटी पर निशाना बटन हर दबाव में निशाने को सामने की अगली गोटी की ओर घुमाता है, बाएँ से दाएँ.",
        "असली कैरम के नियम" to "एक खिलाड़ी सफ़ेद गोटियाँ खेलता है और दूसरा काली. बीच की लाल गोटी रानी है. " +
            "रानी डालने के बाद उसी बारी में या अगले शॉट में अपनी एक गोटी डालकर उसे कवर करना ज़रूरी है. कवर न हुआ तो रानी बीच में वापस आ जाती है. " +
            "अपनी गोटी डालने पर आपको दोबारा बारी मिलती है. विरोधी की गोटी डालने पर वह वहीं रहती है और बारी बदल जाती है. " +
            "स्ट्राइकर पॉकेट में गया तो फ़ाउल है: उस शॉट की गोटियाँ और दंड की आपकी एक गोटी बोर्ड पर वापस रखी जाती है. " +
            "रानी से पहले आख़िरी गोटी नहीं डाली जा सकती. जब किसी का रंग पूरा ख़त्म हो जाए, तो बोर्ड जीतने वाले को विरोधी की बची हर गोटी का एक अंक मिलता है, और रानी कवर की हो तो तीन अंक और. मैच पच्चीस अंक तक चलता है. सादे खेल में सिर्फ़ एक बोर्ड होता है.",
        "सिखाने वाला मोड" to "खेल की स्क्रीन पर सिखाने वाला मोड बटन इसे चालू या बंद करता है. चालू होने पर हर बारी की शुरुआत में कोच आपको सुझाव बोलता है: स्ट्राइकर कहाँ रखें, निशाना कितना और ताकत कितनी. " +
            "कोच का सुझाव सुनें बटन किसी भी समय सुझाव देता है. सुझाव लागू करें बटन उसे सीधे स्ट्राइकर, निशाने और ताकत में लगा देता है, फिर आपको बस शॉट मारना है.",
        "सेटिंग और संपर्क" to "सेटिंग में आप आवाज़ और कंपन अलग-अलग चालू या बंद कर सकते हैं, और भाषा हिन्दी या अंग्रेज़ी चुन सकते हैं. " +
            "ऐप की भाषा आपके फ़ोन की भाषा से बेअसर रहती है. हर बटन की अपनी आवाज़ और अपना कंपन होता है. " +
            "डेमो मैच देखने के लिए नीचे का बटन दबाइए. शिकायत या सुझाव के लिए सहायता में दिए ईमेल पर लिखिए. धन्यवाद!"
    ) else listOf(
        "Welcome" to "Blind Carrom is a carrom game made for blind players, played completely by sound. " +
            "You can play against the computer, or with a friend on the same phone. " +
            "The game speaks everything: what happened, whose turn it is, and how many coins are left. This app is a volunteer initiative by Blind Indian Tech Support.",
        "The main menu" to "The main menu has these buttons. Play against the computer. Local multiplayer, where two players take turns on one phone. " +
            "The rules button, which switches between real carrom, a match to twenty five points, and a simple one board game. " +
            "The audio tutorial, which you are listening to now. Settings, with sound, vibration and language. And Support, where you can email us.",
        "How to take your turn" to "A turn has four steps. First, slide the striker left or right. The striker has fifteen positions, and position eight is the centre of the board. " +
            "Second, turn your aim left or right. Each press is five degrees. Third, choose the power from one to ten, where ten is the strongest. Fourth, press the Shoot button. " +
            "The Hear details button tells you where the striker is, where you are aiming, the power, and what is ahead. The Hear score button tells you the score.",
        "The aiming sounds" to "Every time you change your aim you hear a beep that tells you what is ahead. A low soft beep means there is no coin ahead. " +
            "Two quick high beeps mean a coin is very close. A single soft beep means a coin at medium distance. A single full beep means a coin far away. " +
            "Then the game says whether the coin ahead is white, black or the queen, and whether it is in line with a pocket.",
        "Aiming help" to "The Aim straight button brings your aim straight in one press. The Bring striker to centre button puts the striker in the middle. " +
            "The Switch fine mode button makes the aim move one degree at a time and the striker ten units at a time, which makes exact aiming easier. Press it again to return to big steps. " +
            "The Aim at next coin button turns your aim towards the next coin ahead, from left to right, with each press.",
        "Real carrom rules" to "One player plays the white coins and the other plays black. The red coin in the middle is the queen. " +
            "After you pocket the queen, you must cover her by pocketing one of your own coins in the same turn or on the next shot. If you do not, the queen goes back to the centre. " +
            "When you pocket your own coin, you get another turn. If you pocket an opponent's coin, it stays down and the turn passes. " +
            "If the striker goes into a pocket, it is a foul: the coins from that shot and one of your own coins as a penalty are put back on the board. " +
            "The last coin of a colour cannot be pocketed before the queen. When someone clears their colour, the board winner gets one point for every coin the opponent still has on the board, plus three more if the queen was covered. A match goes to twenty five points. The simple game has just one board.",
        "Coach mode" to "On the game screen, the Coach mode button turns it on or off. When it is on, at the start of every turn the coach tells you a suggestion: where to put the striker, how much to aim, and how much power. " +
            "The Hear coach suggestion button gives a suggestion at any time. The Apply suggestion button sets it up for you directly, and then you only need to shoot.",
        "Settings and contact" to "In Settings you can turn sound and vibration on or off separately, and choose English or Hindi. " +
            "The app language does not depend on your phone's language. Every button has its own sound and its own vibration. " +
            "Press the button below to watch a demo match. For complaints or suggestions, email the address in Support. Thank you!"
    )
}
