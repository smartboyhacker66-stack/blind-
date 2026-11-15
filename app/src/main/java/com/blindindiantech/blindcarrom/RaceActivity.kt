package com.blindindiantech.blindcarrom

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.text.InputType
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

/** ऑनलाइन रेस: बाइक और कार, 2 या 3 खिलाड़ी, खुली लॉबी. गति का हिसाब सर्वर पर होता है. */
class RaceActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private class Veh(val id: String, val hi: String, val en: String, val traitHi: String, val traitEn: String)

    private val vehicles = listOf(
        Veh("bike_sprint", "स्प्रिंट बाइक", "Sprint bike", "तेज़ पकड़, हल्की", "quick pickup, light"),
        Veh("bike_cruiser", "क्रूज़र बाइक", "Cruiser bike", "ऊँची रफ़्तार, धीमी पकड़", "high top speed, slow pickup"),
        Veh("bike_nimble", "निम्बल बाइक", "Nimble bike", "मोड़ पर टिकाऊ, कम रफ़्तार", "steady in curves, lower speed"),
        Veh("car_sedan", "सेडान कार", "Sedan car", "संतुलित", "balanced"),
        Veh("car_sport", "स्पोर्ट कार", "Sport car", "सबसे तेज़, मोड़ पर फिसलती", "fastest, slides in curves"),
        Veh("car_heavy", "भारी कार", "Heavy car", "धीमी, पर मोड़ और ब्रेक में मज़बूत", "slower, strong in curves and braking")
    )
    private val lengths = listOf(500, 1000, 1500, 3000)

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private lateinit var content: LinearLayout
    private val prefs by lazy { getSharedPreferences("blindcarrom", Context.MODE_PRIVATE) }
    private var screen = "menu"
    private var polling = false
    private var failCount = 0
    private var lastSeq = 0
    private var gas = false
    private var brake = false
    private var engine = 0
    private var engineVeh = ""
    private var statusView: TextView? = null
    private var gasBtn: Button? = null
    private var brakeBtn: Button? = null
    private var lastGap = 0L
    private var lastCount = 99
    private var finished = false
    private val told = HashSet<String>()
    private var curves: List<Int> = listOf(300, 600, 900, 1200)
    private var waitInfo: TextView? = null
    private var startBtn: Button? = null
    private var roomCode = ""

    private fun vehIndex(): Int = vehicles.indexOfFirst { it.id == prefs.getString("race_vehicle", "bike_sprint") }.let { if (it < 0) 0 else it }
    private fun veh(): Veh = vehicles[vehIndex()]
    private fun maxP(): Int = if (prefs.getInt("race_max", 2) == 3) 3 else 2
    private fun lenM(): Int = prefs.getInt("race_len", 1500).let { if (it in lengths) it else 1500 }
    private fun vehName(id: String): String = vehicles.firstOrNull { it.id == id }?.let { L.tr(it.hi, it.en) } ?: id

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
                if (screen == "menu") leaveAndClose() else if (screen == "lobby") screenMenu() else leaveAndClose()
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

    private fun errText(r: Net.Result): String = when {
        r.code == 403 && r.error == "consent_needed" -> L.tr("पहले अभिभावक की सहमति भेजिए: ऑनलाइन मल्टीप्लेयर में.", "Send the parent consent first, in Online multiplayer.")
        r.code == 401 -> L.tr("पहले लॉगिन कीजिए.", "Please sign in first.")
        r.code == -1 -> L.tr("सर्वर से बात नहीं हो पाई. इंटरनेट जाँचिए.", "Could not reach the server. Check your internet.")
        r.error == "full" -> L.tr("यह कमरा भर चुका है.", "That room is full.")
        r.error == "not_found" -> L.tr("यह कमरा नहीं मिला या रेस शुरू हो चुकी है.", "That room was not found or the race has started.")
        else -> L.tr("कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.", "Something went wrong. Please try again.")
    }

    // ---------- मेन्यू ----------
    private fun screenMenu() {
        screen = "menu"
        clear()
        title(L.tr("ऑनलाइन रेस", "Online race"))
        if (Net.token == null) {
            info(L.tr("रेस के लिए पहले लॉगिन कीजिए: मुख्य मेनू में ऑनलाइन मल्टीप्लेयर खोलकर लॉगिन करें, फिर यहाँ आइए.", "Sign in first: open Online multiplayer from the main menu, sign in, then come back here."))
            button(L.tr("वापस", "Back"), "back") { finish() }
            return
        }
        val pj = getSharedPreferences("blindcarrom", Context.MODE_PRIVATE)
        val pv = pj.getString("pending_join", "") ?: ""
        if (pv.startsWith("race:")) {
            pj.edit().remove("pending_join").apply()
            doJoin(pv.substring(5))
            return
        }
        info(L.tr(
            "दो या तीन खिलाड़ियों की रेस. अपनी गाड़ी चुनिए, गैस से तेज़ भागिए, मोड़ से पहले गति कम कीजिए, वरना फिसलेंगे. बूस्ट हर 12 सेकंड में एक बार. जो पहले पहुँचे वह जीतता है.",
            "A race for two or three players. Pick your vehicle, use the gas to speed up, slow down before curves or you will skid. Boost once every 12 seconds. First to the finish wins."
        ))
        button(L.tr("गाड़ी: ${vehName(veh().id)}, ${L.tr(veh().traitHi, veh().traitEn)}. बदलने के लिए दबाएँ", "Vehicle: ${vehName(veh().id)}, ${veh().traitEn}. Press to change"), "fx") {
            val next = vehicles[(vehIndex() + 1) % vehicles.size]
            prefs.edit().putString("race_vehicle", next.id).apply()
            Sfx.play("veh_${next.id}", 0.6f)
            screenMenu()
        }
        button(L.tr("खिलाड़ी: ${maxP()}. बदलने के लिए दबाएँ", "Players: ${maxP()}. Press to change"), "fx") {
            prefs.edit().putInt("race_max", if (maxP() == 2) 3 else 2).apply()
            screenMenu()
        }
        button(L.tr("दूरी: ${lenM()} मीटर. बदलने के लिए दबाएँ", "Distance: ${lenM()} metres. Press to change"), "fx") {
            prefs.edit().putInt("race_len", lengths[(lengths.indexOf(lenM()) + 1) % lengths.size]).apply()
            screenMenu()
        }
        button(L.tr("खुला कमरा बनाएँ", "Create an open room")) {
            val b = JSONObject().put("vehicle", veh().id).put("max", maxP()).put("length", lenM())
            Net.bg({ Net.call("POST", "/api/race/create", b) }, { r ->
                if (!destroyed) {
                    if (r.ok && r.json != null) screenWaiting(r.json.optString("code"))
                    else say(errText(r), false)
                }
            })
        }
        button(L.tr("खुली लॉबी: सारे खुले कमरे देखें", "Open lobby: see all open rooms")) { screenLobby() }
        val code = EditText(this)
        code.hint = L.tr("कोड से जुड़ें: कमरे का कोड, छह अंक", "Join with a code: six digit room code")
        code.inputType = InputType.TYPE_CLASS_NUMBER
        code.filters = arrayOf(android.text.InputFilter.LengthFilter(6))
        content.addView(code)
        button(L.tr("कोड से जुड़ें", "Join with the code")) {
            val c = code.text.toString().trim()
            if (c.length != 6) { say(L.tr("छह अंकों का कोड डालिए.", "Enter the six digit code."), false); return@button }
            doJoin(c)
        }
        button(L.tr("वापस", "Back"), "back") { leaveAndClose() }
    }

    private fun doJoin(c: String) {
        Net.bg({ Net.call("POST", "/api/race/join", JSONObject().put("code", c).put("vehicle", veh().id)) }, { r ->
            if (!destroyed) {
                if (r.ok) screenWaiting(c) else say(errText(r), false)
            }
        })
    }

    // ---------- खुली लॉबी ----------
    private fun screenLobby() {
        screen = "lobby"
        clear()
        title(L.tr("खुली लॉबी", "Open lobby"))
        val status = info(L.tr("कमरे ढूँढ रहा हूँ...", "Looking for rooms..."))
        val list = LinearLayout(this)
        list.orientation = LinearLayout.VERTICAL
        content.addView(list)
        button(L.tr("ताज़ा करें", "Refresh"), "info") { screenLobby() }
        button(L.tr("वापस", "Back"), "back") { screenMenu() }
        Net.bg({ Net.call("GET", "/api/race/lobby") }, { r ->
            if (destroyed || screen != "lobby") return@bg
            if (!r.ok || r.json == null) { status.text = errText(r); return@bg }
            val arr = r.json.optJSONArray("rooms")
            val n = arr?.length() ?: 0
            status.text = if (n == 0) L.tr("अभी कोई खुला कमरा नहीं है. आप एक कमरा बना सकते हैं.", "No open room right now. You can create one.")
            else L.tr("$n खुले कमरे. जिसमें जुड़ना हो उसे दबाइए.", "$n open rooms. Press the one you want to join.")
            for (i in 0 until n) {
                val o = arr!!.getJSONObject(i)
                val code = o.optString("code")
                val b = Button(this)
                b.text = L.tr(
                    "${o.optString("host")} की रेस, ${vehName(o.optString("vehicle"))}, ${o.optInt("players")} में से ${o.optInt("max")}, ${o.optInt("length")} मीटर",
                    "${o.optString("host")}'s race, ${vehName(o.optString("vehicle"))}, ${o.optInt("players")} of ${o.optInt("max")}, ${o.optInt("length")} metres"
                )
                b.minimumHeight = dp(64)
                b.setOnClickListener { Fx.press(this, "start"); doJoin(code) }
                list.addView(b)
            }
        })
        handler.postDelayed({ if (!destroyed && screen == "lobby") screenLobby() }, 8000)
    }

    // ---------- इंतज़ार ----------
    private fun screenWaiting(code: String) {
        screen = "wait"
        roomCode = code
        clear()
        title(L.tr("दोस्तों का इंतज़ार", "Waiting for players"))
        waitInfo = info(L.tr("कमरे का कोड: ${code.toCharArray().joinToString(" ")}. कमरा खुली लॉबी में सबको दिख रहा है.", "Room code: ${code.toCharArray().joinToString(" ")}. The room is visible to everyone in the open lobby."))
        startBtn = button(L.tr("अभी शुरू करें (कम से कम दो खिलाड़ी)", "Start now (at least two players)"), "start") {
            Net.bg({ Net.call("POST", "/api/race/start", JSONObject()) }, { r -> if (!destroyed && !r.ok) say(L.tr("अभी शुरू नहीं हो सकता. दूसरे खिलाड़ी का इंतज़ार कीजिए.", "Cannot start yet. Wait for a second player."), false) })
        }
        startBtn?.isEnabled = false
        button(L.tr("कोड शेयर करें", "Share the code"), "fx") {
            val i = Intent(Intent.ACTION_SEND)
            i.type = "text/plain"
            i.putExtra(Intent.EXTRA_TEXT, L.tr("Blind Hub रेस में आइए: https://blind-indian-tech-support.web.app/join.html?game=race&code=$code कमरे का कोड: $code", "Join me in the Blind Hub race: https://blind-indian-tech-support.web.app/join.html?game=race&code=$code Room code: $code"))
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
        title(L.tr("रेस", "Race"))
        statusView = info(L.tr("रेस शुरू होने वाली है.", "The race is about to start."))
        gasBtn = button(L.tr("गैस चालू करें", "Gas on"), "power_up") { gas = !gas; gasBtn?.text = if (gas) L.tr("गैस बंद करें", "Gas off") else L.tr("गैस चालू करें", "Gas on"); sendInput(false) }
        brakeBtn = button(L.tr("ब्रेक लगाएँ", "Apply brake"), "fine") { brake = !brake; brakeBtn?.text = if (brake) L.tr("ब्रेक छोड़ें", "Release brake") else L.tr("ब्रेक लगाएँ", "Apply brake"); sendInput(false) }
        button(L.tr("बूस्ट", "Boost"), "shoot") { sendInput(true) }
        button(L.tr("स्थिति सुनें", "Hear status"), "info") { say(statusView?.text?.toString() ?: "", true) }
        button(L.tr("रेस छोड़ें", "Leave the race"), "exit") { leaveAndClose() }
        pollLoop()
    }

    private fun startEngineFor(vehId: String) {
        if (vehId == engineVeh && engine != 0) return
        Sfx.stop(engine)
        engineVeh = vehId
        engine = Sfx.playLoopRate("veh_$vehId", 0f, 0.6f)
    }

    private fun stopEngine() {
        Sfx.stop(engine)
        engine = 0
        engineVeh = ""
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
        if (r.code == 404 || r.error == "not_found") {
            if (screen != "menu") { say(L.tr("रेस का कमरा बंद हो चुका है.", "The race room has closed."), true); screenMenu() }
            return
        }
        if (!r.ok || j == null) {
            failCount++
            if (failCount == 6) say(L.tr("कनेक्शन में दिक़्क़त है.", "Connection problem."), false)
            return
        }
        failCount = 0
        val status = j.optString("status")
        if (screen == "wait") {
            if (status != "waiting") { screenRace(); return }
            val pl = j.optInt("players")
            val mx = j.optInt("max")
            waitInfo?.text = L.tr("कमरे का कोड: ${roomCode.toCharArray().joinToString(" ")}. खिलाड़ी: $pl में से $mx. कमरा खुली लॉबी में सबको दिख रहा है.", "Room code: ${roomCode.toCharArray().joinToString(" ")}. Players: $pl of $mx. The room is visible to everyone in the open lobby.")
            startBtn?.isEnabled = j.optBoolean("host") && pl >= 2
            return
        }
        if (screen != "race") return
        val cArr = j.optJSONArray("curves")
        if (cArr != null) curves = (0 until cArr.length()).map { cArr.getInt(it) }
        val you = j.getJSONObject("you")
        val others = j.optJSONArray("others")
        val pos = you.optDouble("pos")
        val kmh = you.optInt("kmh")
        val myVeh = you.optString("vehicle")
        if (myVeh.isNotEmpty()) startEngineFor(myVeh)
        if (engine != 0) Sfx.tune(engine, 0.1f + 0.5f * (kmh / 170f), 0.6f + 1.4f * (kmh / 170f))

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
            val who = e.optString("name")
            when (e.optString("type")) {
                "skid" -> { Sfx.play("train_brake_clunk", 0.8f); say(if (mine) L.tr("आप मोड़ पर फिसल गए! गति आधी रह गई.", "You skidded on the curve! Your speed was halved.") else L.tr("$who मोड़ पर फिसल गया!", "$who skidded on the curve!"), false) }
                "boost" -> { Sfx.play("train_horn", 0.5f); say(if (mine) L.tr("बूस्ट चालू!", "Boost on!") else L.tr("$who ने बूस्ट लिया!", "$who used boost!"), false) }
                "finish" -> say(if (mine) L.tr("आप पहले फ़िनिश पर पहुँचे!", "You reached the finish first!") else L.tr("$who पहले पहुँच गया.", "$who reached the finish first."), false)
                "left" -> if (!mine) say(L.tr("$who रेस छोड़कर चला गया.", "$who left the race."), false)
            }
        }

        // मोड़ की चेतावनी
        for ((idx, c) in curves.withIndex()) {
            val d = c - pos
            if (d in 0.0..150.0 && told.add("c${idx}a")) say(L.tr("आगे मोड़, डेढ़ सौ मीटर. गति कम कीजिए.", "Curve ahead, 150 metres. Slow down."), true)
            if (d in 0.0..60.0 && told.add("c${idx}b")) { Sfx.play("train_penalty", 0.8f); say(L.tr("मोड़! ब्रेक!", "Curve! Brake!"), true) }
        }

        // स्थान और आगे-पीछे, हर 7 सेकंड में
        val now = System.currentTimeMillis()
        val total = 1 + (others?.length() ?: 0)
        var lead = 0.0
        var hasOther = false
        if (others != null) for (i in 0 until others.length()) {
            val p = others.getJSONObject(i).optDouble("pos")
            if (!hasOther || p > lead) { lead = p; hasOther = true }
        }
        val gap = if (hasOther) pos - lead else 0.0
        val line = L.tr(
            "दूरी ${pos.toInt()} मीटर, गति $kmh किलोमीटर प्रति घंटा. आप $total में से ${j.optInt("rank")} स्थान पर हैं. " + (if (!hasOther) "" else if (gap >= 0) "आप सबसे आगे ${gap.toInt()} मीटर की बढ़त पर हैं." else "आगे वाले से ${(-gap).toInt()} मीटर पीछे हैं.") + " बूस्ट " + (if (you.optBoolean("boostReady")) "तैयार." else "तैयार नहीं."),
            "Distance ${pos.toInt()} metres, speed $kmh km per hour. You are number ${j.optInt("rank")} of $total. " + (if (!hasOther) "" else if (gap >= 0) "You lead by ${gap.toInt()} metres." else "You trail the leader by ${(-gap).toInt()} metres.") + " Boost " + (if (you.optBoolean("boostReady")) "ready." else "not ready.")
        )
        statusView?.text = line
        if (status == "racing" && now - lastGap > 7000) { lastGap = now; say(line, false) }

        if (status == "done" && !finished) {
            finished = true
            handler.removeCallbacksAndMessages(null)
            stopEngine()
            val won = j.optString("winner") == "you"
            Sfx.play(if (won) "win" else "train_penalty", 0.9f)
            val res = j.optJSONArray("results")
            val sb = StringBuilder()
            if (res != null) for (i in 0 until res.length()) {
                val o = res.getJSONObject(i)
                val tm = if (o.optBoolean("finished")) L.tr("${o.optDouble("time")} सेकंड", "${o.optDouble("time")} seconds") else L.tr("पूरी नहीं की", "did not finish")
                sb.append("${i + 1}. ${o.optString("name")}: $tm\n")
            }
            val txt = (if (won) L.tr("बधाई हो, आप जीत गए!", "Congratulations, you won!") else L.tr("इस बार ${j.optString("winnerName")} जीता. अगली बार!", "${j.optString("winnerName")} won this time. Better luck next time!")) + "\n" + sb.toString()
            say(txt.replace("\n", ". "), true)
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
