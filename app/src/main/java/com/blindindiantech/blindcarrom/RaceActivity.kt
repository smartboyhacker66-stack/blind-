package com.blindindiantech.blindcarrom

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.Locale

/** ऑनलाइन बाइक रेस: दो दोस्त आमने-सामने. गति का हिसाब सर्वर पर होता है. */
class RaceActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private lateinit var content: LinearLayout
    private var screen = "menu"
    private var polling = false
    private var failCount = 0
    private var lastSeq = 0
    private var gas = false
    private var brake = false
    private var engine = 0
    private var statusView: TextView? = null
    private var gasBtn: Button? = null
    private var brakeBtn: Button? = null
    private var lastGap = 0L
    private var lastCount = 99
    private var finished = false
    private val told = HashSet<String>()
    private var curves: List<Int> = listOf(300, 600, 900, 1200)
    private var length = 1500

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Sfx.init(this)
        Net.init(this)
        content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.setPadding(dp(20), dp(20), dp(20), dp(20))
        val sv = ScrollView(this)
        sv.addView(content)
        setContentView(sv)
        tts = TextToSpeech(this, this)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@RaceActivity, "back")
                leaveAndClose()
            }
        })
        screenMenu()
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale.ENGLISH)
            ttsReady = true
        }
    }

    private fun say(text: String, flush: Boolean = true) {
        if (!ttsReady) return
        tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "race")
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun clear() {
        content.removeAllViews()
        handler.removeCallbacksAndMessages(null)
        stopEngine()
    }

    private fun title(text: String): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 24f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        content.addView(tv)
        tv.postDelayed({ tv.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
        return tv
    }

    private fun info(text: String): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 18f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        content.addView(tv)
        return tv
    }

    private fun button(text: String, key: String = "start", onClick: () -> Unit): Button {
        val b = Button(this)
        b.text = text
        b.minimumHeight = dp(64)
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8)
        b.layoutParams = lp
        b.setOnClickListener { Fx.press(this, key); onClick() }
        content.addView(b)
        return b
    }

    private fun leaveAndClose() {
        if (Net.token != null) Net.bg({ Net.call("POST", "/api/race/leave", JSONObject()) }, { })
        finish()
    }

    // ---------- मेन्यू ----------
    private fun screenMenu() {
        screen = "menu"
        clear()
        title(L.tr("ऑनलाइन बाइक रेस", "Online bike race"))
        if (Net.token == null) {
            info(L.tr("रेस के लिए पहले लॉगिन कीजिए: मुख्य मेनू में ऑनलाइन मल्टीप्लेयर खोलकर लॉगिन करें, फिर यहाँ आइए.", "Sign in first: open Online multiplayer from the main menu, sign in, then come back here."))
            button(L.tr("वापस", "Back"), "back") { finish() }
            return
        }
        info(L.tr(
            "दो दोस्तों की 1500 मीटर की रेस. गैस से तेज़ भागिए, मोड़ से पहले गति 90 किमी प्रति घंटा से कम कीजिए, वरना फिसलकर आधी गति रह जाएगी. बूस्ट हर 12 सेकंड में एक बार. जो पहले पहुँचे वह जीतता है.",
            "A 1500 metre race between two friends. Use the gas to speed up, slow below 90 km per hour before each curve or you will skid and lose half your speed. Boost once every 12 seconds. First to the finish wins."
        ))
        button(L.tr("रेस का कमरा बनाएँ", "Create a race room")) {
            Net.bg({ Net.call("POST", "/api/race/create", JSONObject()) }, { r ->
                if (!destroyed) {
                    if (r.ok && r.json != null) screenWaiting(r.json.optString("code"))
                    else say(errText(r), false)
                }
            })
        }
        val code = EditText(this)
        code.hint = L.tr("दोस्त के कमरे का कोड, छह अंक", "Your friend's room code, six digits")
        code.inputType = InputType.TYPE_CLASS_NUMBER
        code.filters = arrayOf(android.text.InputFilter.LengthFilter(6))
        content.addView(code)
        button(L.tr("कोड से जुड़ें", "Join with the code")) {
            val c = code.text.toString().trim()
            if (c.length != 6) { say(L.tr("छह अंकों का कोड डालिए.", "Enter the six digit code."), false); return@button }
            Net.bg({ Net.call("POST", "/api/race/join", JSONObject().put("code", c)) }, { r ->
                if (!destroyed) {
                    if (r.ok) screenRace()
                    else say(if (r.error == "not_found") L.tr("यह कमरा नहीं मिला या रेस शुरू हो चुकी है.", "That room was not found or the race has started.") else errText(r), false)
                }
            })
        }
        button(L.tr("वापस", "Back"), "back") { finish() }
    }

    private fun errText(r: Net.Result): String = when {
        r.code == 403 && r.error == "consent_needed" -> L.tr("पहले अभिभावक की सहमति भेजिए: ऑनलाइन मल्टीप्लेयर में.", "Send the parent consent first, in Online multiplayer.")
        r.code == 401 -> L.tr("पहले लॉगिन कीजिए.", "Please sign in first.")
        r.code == -1 -> L.tr("सर्वर से बात नहीं हो पाई. इंटरनेट जाँचिए.", "Could not reach the server. Check your internet.")
        else -> L.tr("कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.", "Something went wrong. Please try again.")
    }

    // ---------- इंतज़ार ----------
    private fun screenWaiting(code: String) {
        screen = "wait"
        clear()
        title(L.tr("दोस्त का इंतज़ार", "Waiting for your friend"))
        info(L.tr("कमरे का कोड: ${code.toCharArray().joinToString(" ")}. यह कोड दोस्त को भेजिए. दोस्त के जुड़ते ही पाँच सेकंड की गिनती शुरू होगी.", "Room code: ${code.toCharArray().joinToString(" ")}. Send this code to your friend. A five second countdown starts when they join."))
        button(L.tr("कोड शेयर करें", "Share the code"), "fx") {
            val i = Intent(Intent.ACTION_SEND)
            i.type = "text/plain"
            i.putExtra(Intent.EXTRA_TEXT, L.tr("Blind Hub बाइक रेस में आइए. कमरे का कोड: $code", "Join me in the Blind Hub bike race. Room code: $code"))
            startActivity(Intent.createChooser(i, null))
        }
        button(L.tr("कमरा छोड़ें", "Leave the room"), "exit") { leaveAndClose() }
        pollLoop()
    }

    // ---------- रेस ----------
    private fun screenRace() {
        screen = "race"
        clear()
        gas = false; brake = false; finished = false; lastSeq = 0; lastCount = 99; told.clear()
        title(L.tr("बाइक रेस", "Bike race"))
        statusView = info(L.tr("रेस शुरू होने वाली है.", "The race is about to start."))
        gasBtn = button(L.tr("गैस चालू करें", "Gas on"), "power_up") { gas = !gas; gasBtn?.text = if (gas) L.tr("गैस बंद करें", "Gas off") else L.tr("गैस चालू करें", "Gas on"); sendInput(false) }
        brakeBtn = button(L.tr("ब्रेक लगाएँ", "Apply brake"), "fine") { brake = !brake; brakeBtn?.text = if (brake) L.tr("ब्रेक छोड़ें", "Release brake") else L.tr("ब्रेक लगाएँ", "Apply brake"); sendInput(false) }
        button(L.tr("बूस्ट", "Boost"), "shoot") { sendInput(true) }
        button(L.tr("स्थिति सुनें", "Hear status"), "info") { say(statusView?.text?.toString() ?: "", true) }
        button(L.tr("रेस छोड़ें", "Leave the race"), "exit") { leaveAndClose() }
        engine = Sfx.playLoopRate("train_motor", 0f, 0.6f)
        pollLoop()
    }

    private fun stopEngine() {
        Sfx.stop(engine)
        engine = 0
    }

    private fun sendInput(boost: Boolean) {
        val b = JSONObject().put("gas", gas).put("brake", brake).put("boost", boost)
        Net.bg({ Net.call("POST", "/api/race/input", b) }, { })
    }

    private fun pollLoop() {
        if (destroyed || (screen != "wait" && screen != "race")) return
        if (!polling) {
            polling = true
            Net.bg({ Net.call("GET", "/api/race/state") }, { r ->
                polling = false
                if (!destroyed) handleState(r)
            })
        }
        handler.postDelayed({ pollLoop() }, if (screen == "race") 600L else 1000L)
    }

    private fun handleState(r: Net.Result) {
        val j = r.json
        if (r.code == 404 || (r.error == "not_found")) {
            if (screen != "menu") { say(L.tr("रेस का कमरा बंद हो चुका है.", "The race room has closed."), true); screenMenu() }
            return
        }
        if (!r.ok || j == null) {
            failCount++
            if (failCount == 6) say(L.tr("कनेक्शन में दिक़्क़त है.", "Connection problem."), false)
            return
        }
        failCount = 0
        curves = (0 until j.optJSONArray("curves")!!.length()).map { j.getJSONArray("curves").getInt(it) }
        length = j.optInt("length", 1500)
        val status = j.optString("status")
        if (screen == "wait" && status != "waiting") { screenRace(); return }
        if (screen != "race") return
        val you = j.getJSONObject("you")
        val opp = j.optJSONObject("opp")
        val pos = you.optDouble("pos")
        val kmh = you.optInt("kmh")
        if (engine != 0) Sfx.tune(engine, 0.1f + 0.5f * (kmh / 140f), 0.6f + 1.4f * (kmh / 140f))

        if (status == "countdown") {
            val sec = (j.optLong("countdown") / 1000L).toInt() + 1
            statusView?.text = L.tr("गिनती: $sec", "Countdown: $sec")
            if (sec < lastCount && sec <= 5) { lastCount = sec; say("$sec", true); Sfx.play("train_approach", 0.7f) }
            return
        }
        if (lastCount != 0 && status == "racing") { lastCount = 0; say(L.tr("चलो!", "Go!"), true); Sfx.play("train_horn", 0.7f) }

        // घटनाएँ: फिसलना, बूस्ट, फ़िनिश
        val ev = j.optJSONArray("events")
        if (ev != null) for (i in 0 until ev.length()) {
            val e = ev.getJSONObject(i)
            val n = e.optInt("n")
            if (n <= lastSeq) continue
            lastSeq = n
            val mine = e.optString("who") == "you"
            val oname = opp?.optString("name") ?: ""
            when (e.optString("type")) {
                "skid" -> { Sfx.play("train_brake_clunk", 0.8f); say(if (mine) L.tr("आप मोड़ पर फिसल गए! गति आधी रह गई.", "You skidded on the curve! Your speed was halved.") else L.tr("$oname मोड़ पर फिसल गया!", "$oname skidded on the curve!"), false) }
                "boost" -> { Sfx.play("train_horn", 0.5f); say(if (mine) L.tr("बूस्ट चालू!", "Boost on!") else L.tr("$oname ने बूस्ट लिया!", "$oname used boost!"), false) }
                "finish" -> say(if (mine) L.tr("आप पहले फ़िनिश पर पहुँचे!", "You reached the finish first!") else L.tr("$oname पहले पहुँच गया.", "$oname reached the finish first."), false)
                "left" -> say(L.tr("दोस्त रेस छोड़कर चला गया.", "Your friend left the race."), false)
            }
        }

        // मोड़ की चेतावनी
        for ((idx, c) in curves.withIndex()) {
            val d = c - pos
            if (d in 0.0..150.0 && told.add("c${idx}a")) say(L.tr("आगे मोड़, डेढ़ सौ मीटर. गति 90 से कम कीजिए.", "Curve ahead, 150 metres. Slow below 90."), true)
            if (d in 0.0..60.0 && told.add("c${idx}b")) { Sfx.play("train_penalty", 0.8f); say(L.tr("मोड़! ब्रेक!", "Curve! Brake!"), true) }
        }

        // आगे या पीछे, हर 7 सेकंड में
        val now = System.currentTimeMillis()
        val gap = if (opp != null) pos - opp.optDouble("pos") else 0.0
        val line = L.tr(
            "दूरी ${pos.toInt()} मीटर, गति $kmh किलोमीटर प्रति घंटा. " + (if (gap >= 0) "आप ${gap.toInt()} मीटर आगे हैं." else "आप ${(-gap).toInt()} मीटर पीछे हैं.") + " बूस्ट " + (if (you.optBoolean("boostReady")) "तैयार." else "तैयार नहीं."),
            "Distance ${pos.toInt()} metres, speed $kmh km per hour. " + (if (gap >= 0) "You lead by ${gap.toInt()} metres." else "You trail by ${(-gap).toInt()} metres.") + " Boost " + (if (you.optBoolean("boostReady")) "ready." else "not ready.")
        )
        statusView?.text = line
        if (status == "racing" && now - lastGap > 7000) { lastGap = now; say(line, false) }

        if (status == "done" && !finished) {
            finished = true
            handler.removeCallbacksAndMessages(null)
            stopEngine()
            val won = j.optString("winner") == "you"
            Sfx.play(if (won) "win" else "train_penalty", 0.9f)
            val txt = if (won) L.tr("बधाई हो, आप जीत गए!", "Congratulations, you won!") else L.tr("इस बार दोस्त जीता. अगली बार!", "Your friend won this time. Better luck next time!")
            say(txt, true)
            content.removeAllViews()
            title(L.tr("रेस ख़त्म", "Race over"))
            info(txt)
            button(L.tr("मेन्यू पर वापस", "Back to the menu"), "back") { leaveAndClose() }
        }
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        stopEngine()
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
