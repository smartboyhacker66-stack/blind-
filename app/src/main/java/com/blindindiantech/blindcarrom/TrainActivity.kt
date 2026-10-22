package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale
import kotlin.math.abs
import kotlin.random.Random

class TrainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    companion object {
        const val START_MONEY = 20000
        const val SIGNAL_FINE = 8000
        const val COLLISION_FINE = 15000
        const val REWARD = 1000
    }

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null
    private lateinit var content: LinearLayout
    private var screen = "routes"

    // ---- यात्रा की योजना ----
    private var route: Route = TrainData.routes[0]
    private var idxs: List<Int> = emptyList()
    private var seq: List<Station> = emptyList()
    private var stationPos = FloatArray(0)
    private var stops = BooleanArray(0)
    private var maxKmh = 80
    private var trainNo = ""
    private var trainName = ""
    private var platAnn = IntArray(0)
    private var sigPos = FloatArray(0)
    private var sigRed = BooleanArray(0)

    // ---- खेल की स्थिति ----
    private var phase = 0            // 0 = स्टेशन पर, 1 = चल रही है, 2 = ख़त्म
    private var pos = 0f
    private var speed = 0f
    private var targetKmh = 0
    private var braking = false
    private var brakeDecel = 0f
    private var curIdx = 0
    private var nextIdx = 1
    private var money = START_MONEY
    private var practice = false
    private var missed = 0
    private var complaints = 0
    private var violations = 0
    private var departing = false
    private var scheduledAt = 0L
    private var lateStage = 0
    private var countdownTold = false
    private var lastAnnounce = ""
    private var lastApproach = 0L
    private var lastJoint = 0L
    private var cueNext = 0
    private var shortTold = false
    private var markTold = false
    private var platNow = 1
    private var sigIdx = 1
    private var sigState = 0
    private var redGreenAt = 0L
    private var redCleared = false
    private var passStarted = false
    private var passActive = false
    private var nextAmbientPass = 0L
    private var engineStream = 0
    private var clackStream = 0
    private var rumbleStream = 0
    private var complaintView: TextView? = null

    private val prefs get() = getSharedPreferences("blindcarrom", Context.MODE_PRIVATE)
    private val fast get() = maxKmh > 100

    private fun rupees(n: Int) = L.tr("$n रुपये", "$n game rupees")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_train)
        Sfx.init(this)
        content = findViewById(R.id.trainContent)
        money = prefs.getInt("train_money_v2", START_MONEY)
        tts = TextToSpeech(this, this)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@TrainActivity, "back")
                if (screen == "routes") finish() else leaveToRoutes()
            }
        })
        screenRoutes()
    }

    // ================= आवाज़ और बोली =================
    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale.ENGLISH)
            ttsReady = true
            pendingSpeech?.let { say(it) }
            pendingSpeech = null
        }
    }

    /** voice: 0 = खेल, 1 = स्टेशन की घोषणा (महिला जैसी), 2 = पुरुष यात्री, 3 = महिला यात्री, 4 = गार्ड या स्टेशन मास्टर. */
    private fun say(text: String, flush: Boolean = true, voice: Int = 0) {
        if (flush) lastAnnounce = text
        if (!ttsReady) { pendingSpeech = text; return }
        val (pitch, rate) = when (voice) {
            1 -> Pair(1.25f, 0.92f)
            2 -> Pair(0.85f, 1.0f)
            3 -> Pair(1.35f, 1.05f)
            4 -> Pair(0.75f, 0.95f)
            else -> Pair(1.0f, 1.0f)
        }
        tts?.setPitch(pitch)
        tts?.setSpeechRate(rate)
        tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "train")
    }

    /** स्टेशन की घोषणा: पहले घंटी, फिर आवाज़. */
    private fun pa(text: String) {
        Sfx.play("train_pa", 0.8f)
        handler.postDelayed({ if (!destroyed) say(text, true, 1) }, 1500)
    }

    private fun digits(s: String) = s.toCharArray().joinToString(" ")

    // ================= स्क्रीन बनाने के औज़ार =================
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun clear() {
        content.removeAllViews()
        handler.removeCallbacks(ticker)
        stopLoops()
    }

    private fun focus(v: View) {
        v.postDelayed({ v.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
    }

    private fun title(text: String): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 24f
        tv.setTypeface(null, android.graphics.Typeface.BOLD)
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        content.addView(tv)
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

    private fun mk(text: String, key: String = "start", onClick: () -> Unit): Button {
        val b = Button(this)
        b.text = text
        b.minimumHeight = dp(64)
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8)
        b.layoutParams = lp
        b.setOnClickListener { Fx.press(this, key); onClick() }
        return b
    }

    private fun add(text: String, key: String = "start", onClick: () -> Unit): Button {
        val b = mk(text, key, onClick)
        content.addView(b)
        return b
    }

    private fun edit(hint: String, type: Int, max: Int): EditText {
        val e = EditText(this)
        e.hint = hint
        e.inputType = type
        e.maxLines = 1
        e.filters = arrayOf(android.text.InputFilter.LengthFilter(max))
        content.addView(e)
        return e
    }

    private fun leaveToRoutes() {
        phase = 2
        screenRoutes()
    }

    // ================= 1. रास्ता चुनना =================
    private fun screenRoutes() {
        screen = "routes"
        clear()
        focus(title(L.tr("ट्रेन गेम", "Train game")))
        info(L.tr(
            "आप मोटरमैन हैं. अपना रास्ता चुनिए. आपके खाते में ${rupees(money)} हैं." +
                (if (money == 0) " पैसे ख़त्म हैं, इसलिए अभी अभ्यास यात्राएँ चलेंगी, जिनमें जुर्माना नहीं लगेगा." else ""),
            "You are the motorman. Choose your route. Your balance is ${rupees(money)}." +
                (if (money == 0) " Your money is finished, so you will get practice journeys with no fines." else "")
        ))
        for (r in TrainData.routes) {
            add(L.tr(
                "${r.title()}, ${r.stations.size} स्टेशन, अधिकतम ${r.maxKmh} किलोमीटर प्रति घंटा",
                "${r.title()}, ${r.stations.size} stations, top speed ${r.maxKmh} kilometres per hour"
            )) { screenMode(r) }
        }
        add(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
    }

    // ================= 2. अपनी पसंद या ड्यूटी =================
    private fun screenMode(r: Route) {
        screen = "mode"
        route = r
        clear()
        focus(title(r.title()))
        info(L.tr("अपनी यात्रा कैसे तय करेंगे?", "How do you want to set up your journey?"))
        add(L.tr("अपनी पसंद के स्टेशन चुनूँगा", "I will choose my own stations")) { pickStart(r) }
        add(L.tr("मुझे ड्यूटी दी जाए", "Assign me a duty")) { assignDuty(r) }
        add(L.tr("वापस", "Back"), "back") { screenRoutes() }
    }

    private fun stationPicker(r: Route, heading: String, exclude: Int, onPick: (Int) -> Unit) {
        clear()
        focus(title(heading))
        val et = edit(L.tr("स्टेशन का नाम खोजिए", "Search station name"), InputType.TYPE_CLASS_TEXT, 30)
        val list = LinearLayout(this)
        list.orientation = LinearLayout.VERTICAL
        content.addView(list)
        fun fill(q: String) {
            list.removeAllViews()
            r.stations.forEachIndexed { i, st ->
                val ok = q.isBlank() || st.hi.contains(q) || st.en.contains(q, true)
                if (i != exclude && ok) list.addView(mk("${i + 1}. ${st.name()}") { onPick(i) })
            }
        }
        fill("")
        et.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { fill(s.toString().trim()) }
        })
        add(L.tr("वापस", "Back"), "back") { screenMode(r) }
    }

    private fun pickStart(r: Route) {
        screen = "pick"
        stationPicker(r, L.tr("शुरू का स्टेशन चुनिए", "Choose your starting station"), -1) { a -> pickEnd(r, a) }
    }

    private fun pickEnd(r: Route, a: Int) {
        screen = "pick"
        stationPicker(
            r,
            L.tr("${r.stations[a].name()} से चलेंगे. आख़िरी स्टेशन चुनिए", "Starting at ${r.stations[a].name()}. Choose your last station"),
            a
        ) { b -> pickPattern(r, a, b) }
    }

    private fun indices(a: Int, b: Int): List<Int> = if (a <= b) (a..b).toList() else (a downTo b).toList()

    // ================= 3. कहाँ-कहाँ रुकेंगे =================
    private fun pickPattern(r: Route, a: Int, b: Int) {
        screen = "pattern"
        clear()
        val ix = indices(a, b)
        val st = ix.map { r.stations[it] }
        focus(title(L.tr("${st.first().name()} से ${st.last().name()}", "${st.first().name()} to ${st.last().name()}")))
        info(L.tr("कितने स्टेशनों पर रुकेंगे? पहला और आख़िरी स्टेशन हमेशा रुकना है.", "How many stations will you stop at? The first and last stations are always stops."))
        add(L.tr("सभी स्टेशन, धीमी गाड़ी", "All stations, slow train")) {
            toTrain(r, ix, BooleanArray(ix.size) { true })
        }
        add(L.tr("सिर्फ़ मुख्य स्टेशन, फ़ास्ट", "Main stations only, fast")) {
            toTrain(r, ix, BooleanArray(ix.size) { i -> i == 0 || i == ix.size - 1 || st[i].main })
        }
        add(L.tr("मैं ख़ुद चुनूँगा", "I will choose myself")) { pickStops(r, ix) }
        add(L.tr("वापस", "Back"), "back") { screenMode(r) }
    }

    private fun pickStops(r: Route, ix: List<Int>) {
        screen = "pattern"
        clear()
        val st = ix.map { r.stations[it] }
        focus(title(L.tr("रुकने के स्टेशन चुनिए", "Choose your stops")))
        info(L.tr("हर स्टेशन पर दबाने से रुकना या न रुकना बदलता है.", "Press a station to switch between stopping and not stopping."))
        val flags = BooleanArray(st.size) { true }
        fun label(i: Int) = if (flags[i]) L.tr("${st[i].name()}: रुकेगी", "${st[i].name()}: stops")
        else L.tr("${st[i].name()}: नहीं रुकेगी", "${st[i].name()}: does not stop")
        for (i in st.indices) {
            if (i == 0 || i == st.size - 1) {
                info(L.tr("${st[i].name()}: हमेशा रुकेगी", "${st[i].name()}: always stops"))
            } else {
                val btn = mk(label(i), "fine") {}
                btn.setOnClickListener {
                    Fx.press(this, "fine")
                    flags[i] = !flags[i]
                    btn.text = label(i)
                    btn.announceForAccessibility(label(i))
                }
                content.addView(btn)
            }
        }
        add(L.tr("चुनाव पूरा हुआ", "Done")) { toTrain(r, ix, flags) }
        add(L.tr("वापस", "Back"), "back") { screenMode(r) }
    }

    private fun assignDuty(r: Route) {
        val n = r.stations.size
        val gap = minOf(5, n - 1)
        var a: Int
        var b: Int
        do {
            a = (0 until n).random()
            b = (0 until n).random()
        } while (abs(a - b) < gap)
        val ix = indices(a, b)
        val st = ix.map { r.stations[it] }
        val all = (0..1).random() == 0
        toTrain(r, ix, BooleanArray(ix.size) { i -> all || i == 0 || i == ix.size - 1 || st[i].main })
    }

    // ================= 4. ट्रेन का नंबर और नाम =================
    private fun toTrain(r: Route, ix: List<Int>, fl: BooleanArray) {
        route = r
        idxs = ix
        stops = fl
        seq = ix.map { r.stations[it] }
        screen = "train"
        clear()
        val stopCount = fl.count { it }
        focus(title(L.tr("आपकी ड्यूटी", "Your duty")))
        info(L.tr(
            "${seq.first().name()} से ${seq.last().name()} तक, कुल ${seq.size} स्टेशन, जिनमें से $stopCount पर रुकना है. अधिकतम रफ़्तार ${r.maxKmh} किलोमीटर प्रति घंटा.",
            "From ${seq.first().name()} to ${seq.last().name()}, ${seq.size} stations in all, with $stopCount stops. Top speed ${r.maxKmh} kilometres per hour."
        ))
        val no = edit(L.tr("ट्रेन का नंबर, अंकों में", "Train number, digits only"), InputType.TYPE_CLASS_NUMBER, 6)
        val nm = edit(L.tr("ट्रेन का नाम", "Train name"), InputType.TYPE_CLASS_TEXT, 24)
        no.setText(r.trainNo)
        nm.setText(r.trainName)
        add(L.tr("यात्रा शुरू करें", "Start the journey")) {
            val n = no.text.toString().filter { it.isDigit() }.take(6)
            val t = nm.text.toString().trim().replace(Regex("[^\\p{L}\\p{M}\\p{N} ]"), "").take(24)
            trainNo = if (n.isNotEmpty()) n else r.trainNo
            trainName = if (t.isNotEmpty()) t else r.trainName
            startJourney()
        }
        add(L.tr("वापस", "Back"), "back") { screenMode(r) }
    }

    // ================= 5. गाड़ी चलाना =================
    private fun startJourney() {
        screen = "drive"
        clear()
        maxKmh = route.maxKmh
        practice = money == 0
        // स्टेशनों की जगह (मीटर)
        stationPos = FloatArray(seq.size)
        for (k in 1 until seq.size) stationPos[k] = stationPos[k - 1] + route.hopM(idxs[k - 1], idxs[k])
        // सिग्नल: हर स्टेशन से थोड़ा पहले, कुछ लाल
        val gapBase = if (fast) 1800f else 500f
        sigPos = FloatArray(seq.size) { k -> if (k == 0) -1f else stationPos[k] - minOf(gapBase, (stationPos[k] - stationPos[k - 1]) * 0.55f) }
        sigRed = BooleanArray(seq.size) { k -> k > 0 && Random.nextFloat() < 0.35f }
        platAnn = IntArray(seq.size) { Random.nextInt(1, 5) }
        phase = 0
        pos = 0f
        speed = 0f
        targetKmh = 0
        braking = false
        curIdx = 0
        nextIdx = 1
        missed = 0
        complaints = 0
        violations = 0
        departing = false
        lateStage = 0
        countdownTold = false
        sigIdx = 1
        sigState = 0
        passActive = false
        passStarted = false
        resetCues()
        val now = SystemClock.uptimeMillis()
        scheduledAt = now + dwellMs() + 12000
        nextAmbientPass = now + 60000

        val head = title("${seq.first().name()} → ${seq.last().name()}")
        val status = info(L.tr("गाड़ी ${seq.first().name()} स्टेशन पर खड़ी है.", "The train is standing at ${seq.first().name()}."))
        complaintView = info("")
        focus(head)
        add(L.tr("स्थिति सुनें", "Hear status"), "info") { status.text = statusText(); say(statusText()) }
        add(L.tr("रफ़्तार बढ़ाएँ, ब्रेक छोड़ें", "Speed up, release the brake"), "power_up") {
            if (phase == 1) {
                val wasBraking = braking
                braking = false
                targetKmh = minOf(maxKmh, targetKmh + step())
                say(
                    (if (wasBraking) L.tr("ब्रेक छोड़ा. ", "Brake released. ") else "") +
                        L.tr("रफ़्तार का लक्ष्य $targetKmh किलोमीटर प्रति घंटा", "Target speed $targetKmh kilometres per hour"),
                    false
                )
            } else say(L.tr("पहले चलने को तैयार बटन दबाइए.", "First press the Ready to depart button."), false)
        }
        add(L.tr("रफ़्तार घटाएँ", "Slow down"), "power_down") {
            if (phase != 1) return@add
            targetKmh = maxOf(0, targetKmh - step())
            say(L.tr("रफ़्तार का लक्ष्य $targetKmh किलोमीटर प्रति घंटा", "Target speed $targetKmh kilometres per hour"), false)
        }
        add(L.tr("हल्का ब्रेक", "Light brake"), "aim_left") { brake(0.5f) }
        add(L.tr("मध्यम ब्रेक", "Medium brake"), "aim_right") { brake(0.9f) }
        add(L.tr("तेज़ ब्रेक", "Heavy brake"), "exit") { brake(1.4f) }
        add(L.tr("हॉर्न", "Horn"), "shoot") { Sfx.play("train_horn", 0.9f) }
        add(L.tr("पटरी बदलें", "Change track"), "center") { changeTrack() }
        add(L.tr("चलने को तैयार", "Ready to depart"), "start") { depart() }
        add(L.tr("आख़िरी घोषणा दोहराएँ", "Repeat last announcement"), "score") { say(lastAnnounce) }
        add(L.tr("यात्रा छोड़ें", "End the journey"), "back") { finish(false, abandoned = true) }

        startLoops()
        handler.postDelayed(ticker, 100)
        handler.postDelayed({
            pa(
                L.tr(
                    "यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ${digits(trainNo)}, $trainName, ${seq.first().name()} से ${seq.last().name()} के लिए प्लेटफ़ॉर्म नंबर ${platAnn[0]} पर खड़ी है.",
                    "Attention please. Train number ${digits(trainNo)}, $trainName, for ${seq.last().name()}, is standing on platform ${platAnn[0]} at ${seq.first().name()}."
                )
            )
            handler.postDelayed({
                say(
                    L.tr(
                        "आप ${seq.first().name()} स्टेशन पर हैं. आपको ${seq.last().name()} तक जाना है, और ${stops.count { it }} स्टेशनों पर रुकना है. " +
                            "अगला रुकने का स्टेशन ${seq[nextStop(0)].name()}. चलने का समय ${dwellMs() / 1000 + 12} सेकंड बाद है. तैयार होने पर चलने को तैयार बटन दबाइए." +
                            (if (practice) " यह अभ्यास यात्रा है, जुर्माना नहीं लगेगा." else ""),
                        "You are at ${seq.first().name()}. You must reach ${seq.last().name()} and stop at ${stops.count { it }} stations. " +
                            "The next stop is ${seq[nextStop(0)].name()}. Departure time is in ${dwellMs() / 1000 + 12} seconds. When you are ready, press Ready to depart." +
                            (if (practice) " This is a practice journey, so there are no fines." else "")
                    ),
                    false
                )
            }, 6500)
        }, 600)
    }

    private fun step() = if (fast) 20 else 10
    private fun dwellMs() = if (fast) 40000L else 30000L
    private fun cues() = if (fast) floatArrayOf(5000f, 2000f, 1000f, 500f, 300f) else floatArrayOf(1000f, 300f)

    private fun resetCues() {
        cueNext = 0
        shortTold = false
        markTold = false
        platNow = platAnn.getOrElse(nextIdx) { 1 }
    }

    private fun nextStop(from: Int): Int {
        for (i in from + 1 until seq.size) if (stops[i]) return i
        return seq.size - 1
    }

    private fun statusText(): String {
        val kmh = (speed * 3.6f).toInt()
        if (phase == 0) {
            val wait = ((scheduledAt - SystemClock.uptimeMillis()) / 1000).coerceAtLeast(0)
            return L.tr(
                "गाड़ी ${seq[curIdx].name()} स्टेशन पर खड़ी है. अगला रुकने का स्टेशन ${seq[nextStop(curIdx)].name()}. चलने का समय $wait सेकंड बाद. खाते में ${rupees(money)}.",
                "The train is standing at ${seq[curIdx].name()}. The next stop is ${seq[nextStop(curIdx)].name()}. Departure in $wait seconds. Balance ${rupees(money)}."
            )
        }
        if (nextIdx >= seq.size) return ""
        val d = (stationPos[nextIdx] - pos).toInt().coerceAtLeast(0)
        val st = seq[nextIdx].name()
        val ds = (sigPos[nextIdx] - pos).toInt()
        val sig = if (sigIdx == nextIdx && ds > 0) L.tr(
            " अगला सिग्नल $ds मीटर आगे, " + (if (sigRed[nextIdx] && !redCleared) "लाल." else "हरा."),
            " Next signal $ds metres ahead, " + (if (sigRed[nextIdx] && !redCleared) "red." else "green.")
        ) else ""
        return L.tr(
            "रफ़्तार $kmh किलोमीटर प्रति घंटा, लक्ष्य $targetKmh. अगला स्टेशन $st, $d मीटर आगे, प्लेटफ़ॉर्म $platNow. " +
                (if (stops[nextIdx]) "यहाँ रुकना है." else "यहाँ नहीं रुकना.") + sig + " खाते में ${rupees(money)}.",
            "Speed $kmh kilometres per hour, target $targetKmh. Next station $st, $d metres ahead, platform $platNow. " +
                (if (stops[nextIdx]) "You must stop here." else "No stop here.") + sig + " Balance ${rupees(money)}."
        )
    }

    private fun brake(decel: Float) {
        if (phase != 1) return
        targetKmh = 0
        braking = true
        brakeDecel = decel
        Sfx.play("train_brake", 0.7f)
        say(
            when {
                decel < 0.6f -> L.tr("हल्का ब्रेक लगा.", "Light brake on.")
                decel < 1.0f -> L.tr("मध्यम ब्रेक लगा.", "Medium brake on.")
                else -> L.tr("तेज़ ब्रेक लगा.", "Heavy brake on.")
            },
            false
        )
    }

    // ---- पटरी (प्लेटफ़ॉर्म) बदलना ----
    private fun changeTrack() {
        if (phase != 1 || nextIdx >= seq.size) {
            say(L.tr("अभी पटरी नहीं बदली जा सकती.", "You cannot change track now."), false)
            return
        }
        val ns = (nextIdx until seq.size).firstOrNull { stops[it] } ?: seq.size - 1
        val d = stationPos[ns] - pos
        val limit = if (fast) 3000f else 600f
        if (d > limit || d < 150f || speed * 3.6f > (if (fast) 120f else 60f)) {
            say(
                L.tr(
                    "पटरी तभी बदली जा सकती है जब स्टेशन $limit मीटर के भीतर हो, 150 मीटर से दूर हो, और रफ़्तार धीमी हो.",
                    "You can change track only when the station is within ${limit.toInt()} metres, more than 150 metres away, and your speed is low."
                ),
                false
            )
            return
        }
        platNow = platNow % 4 + 1
        Sfx.play("train_points", 0.9f)
        Fx.buzz(this, "shoot")
        say(L.tr("पटरी बदली. अब गाड़ी प्लेटफ़ॉर्म नंबर $platNow पर जाएगी.", "Track changed. The train will now go to platform $platNow."), false)
    }

    // ---- चलने की तैयारी ----
    private fun depart() {
        if (phase != 0 || departing) return
        departing = true
        val now = SystemClock.uptimeMillis()
        val early = now < scheduledAt - 1500
        if (early) giveComplaints(2, early = true)
        val delay = if (early) 4500L else 0L
        handler.postDelayed({
            if (destroyed || screen != "drive") return@postDelayed
            pa(
                L.tr(
                    "ट्रेन नंबर ${digits(trainNo)}, $trainName, चलने को तैयार है.",
                    "Train number ${digits(trainNo)}, $trainName, is ready to depart."
                )
            )
            handler.postDelayed({ Sfx.play("train_whistle", 0.9f) }, 4000)
            handler.postDelayed({ Sfx.play("train_door_close", 0.8f) }, 4800)
            handler.postDelayed({
                if (!destroyed && screen == "drive") {
                    pos = stationPos[curIdx]
                    nextIdx = curIdx + 1
                    sigIdx = nextIdx
                    sigState = 0
                    redCleared = false
                    passStarted = false
                    resetCues()
                    braking = false
                    departing = false
                    phase = 1
                    Sfx.play("train_depart", 0.45f)
                    say(L.tr("दरवाज़े बंद. गाड़ी चलाइए.", "Doors closed. You may move."), false)
                }
            }, 5800)
        }, delay)
    }

    // ---- यात्रियों की शिकायतें (जुर्माना नहीं) ----
    private fun giveComplaints(n: Int, early: Boolean) {
        val earlyHi = listOf(
            Pair("जयंत", "मेरा बेटा अभी चढ़ा नहीं, गाड़ी इतनी जल्दी क्यों निकाल दी?"),
            Pair("सुनीता", "अरे रुको! मेरा सामान प्लेटफ़ॉर्म पर रह गया!"),
            Pair("एक बुज़ुर्ग यात्री", "दरवाज़े पर भीड़ थी, कुछ लोग चढ़ ही नहीं पाए."),
            Pair("रमेश", "घोषणा में तो और समय बताया था, इतनी जल्दी क्यों?"),
            Pair("एक महिला", "मेरे पति स्टेशन पर ही छूट गए, गाड़ी रोकिए!"),
            Pair("गार्ड साहब", "मोटरमैन, तय समय से पहले गाड़ी क्यों चलाई?")
        )
        val earlyEn = listOf(
            Pair("Jayant", "My son has not boarded yet, why did you start the train so early?"),
            Pair("Sunita", "Wait! My luggage is still on the platform!"),
            Pair("An elderly passenger", "The door was crowded, some people could not board."),
            Pair("Ramesh", "The announcement gave a later time, why so early?"),
            Pair("A woman", "My husband was left behind on the station, stop the train!"),
            Pair("The guard", "Motorman, why did you start before the scheduled time?")
        )
        val missHi = listOf(
            Pair("मीना", "हमें इसी स्टेशन पर उतरना था, गाड़ी रुकी ही नहीं!"),
            Pair("किशोर", "अरे भाई, हमारा स्टेशन निकल गया!"),
            Pair("एक यात्री", "इतनी बड़ी गाड़ी और हमारे स्टेशन पर नहीं रुकी, यह कैसे हुआ?")
        )
        val missEn = listOf(
            Pair("Meena", "We had to get off at this station, the train did not stop!"),
            Pair("Kishore", "Hey, our station has gone past!"),
            Pair("A passenger", "Such a big train and it did not stop at our station, how?")
        )
        val pool = if (early) (if (L.isHindi()) earlyHi else earlyEn) else (if (L.isHindi()) missHi else missEn)
        val picks = pool.shuffled().take(n)
        complaints += picks.size
        val text = picks.joinToString("\n") { "${it.first}: ${it.second}" }
        complaintView?.text = L.tr("यात्रियों की शिकायतें:\n$text", "Passenger complaints:\n$text")
        Sfx.play("train_crowd", 0.5f)
        picks.forEachIndexed { i, (who, what) ->
            handler.postDelayed({
                if (!destroyed) say("$who: $what", i == 0, if (who.contains("साहब") || who.contains("guard", true)) 4 else if (i % 2 == 0) 2 else 3)
            }, i * 4200L)
        }
    }

    // ================= हर 0.1 सेकंड का हिसाब =================
    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed || screen != "drive" || phase == 2) return
            tick(0.1f)
            handler.postDelayed(this, 100)
        }
    }

    private fun tick(dt: Float) {
        val now = SystemClock.uptimeMillis()
        if (phase == 0) {
            speed = 0f
            boardingTick(now)
            updateLoops()
            return
        }
        val target = targetKmh / 3.6f
        var v = speed
        if (braking) v -= brakeDecel * dt
        else if (v < target) v += 0.8f * dt
        else if (v > target) v -= 0.25f * dt
        v = v.coerceIn(0f, maxKmh / 3.6f)
        if (v < 0.15f && (targetKmh == 0 || braking)) v = 0f
        speed = v
        pos += v * dt
        updateLoops()
        ambient(now)
        signalLogic(now)
        if (phase == 1) stationLogic(now)
    }

    private fun boardingTick(now: Long) {
        if (departing) return
        val toGo = scheduledAt - now
        if (toGo in 1..15000 && !countdownTold) {
            countdownTold = true
            say(L.tr("गाड़ी चलने में पंद्रह सेकंड बाक़ी हैं.", "Fifteen seconds to departure."), false, 4)
        }
        val late = now - scheduledAt
        if (late > 25000 && lateStage == 0) {
            lateStage = 1
            Sfx.play("train_whistle", 0.8f)
            say(L.tr("घोषणा: गाड़ी के चलने का समय हो चुका है. मोटरमैन कृपया गाड़ी चलाएँ.", "Announcement: it is time for the train to depart. Motorman, please start the train."), true, 1)
        } else if (late > 50000 && lateStage == 1) {
            lateStage = 2
            Sfx.play("train_phone", 0.9f)
            handler.postDelayed({
                say(L.tr("स्टेशन मास्टर का फ़ोन: मोटरमैन साहब, गाड़ी का समय हो चुका है, कृपया गाड़ी चलाइए.", "Station master on the phone: Motorman, your departure time has passed. Please start the train."), true, 4)
            }, 2800)
        } else if (late > 75000 && lateStage == 2) {
            lateStage = 3
            complaints++
            say(L.tr("एक यात्री: अरे भाई, गाड़ी कब चलेगी? हमें देर हो रही है.", "A passenger: Hey, when will this train leave? We are getting late."), true, 2)
        } else if (late > 100000 && lateStage == 3) {
            lateStage = 2
            scheduledAt = now - 50000
        }
    }

    // ---- सिग्नल ----
    private fun signalLogic(now: Long) {
        if (sigIdx >= seq.size) return
        val dS = sigPos[sigIdx] - pos
        val red = sigRed[sigIdx]
        val vis = if (fast) 3500f else 800f
        if (sigState == 0 && dS < vis) {
            sigState = 1
            redCleared = !red
            passStarted = false
            if (red) {
                redGreenAt = now + 24000 + Random.nextLong(0, 8000)
                Sfx.play("train_signal_red", 0.9f)
                say(L.tr("आगे लाल सिग्नल. गाड़ी रोकिए.", "Red signal ahead. Stop the train."), true, 4)
            } else {
                Sfx.play("train_signal_green", 0.7f)
                say(L.tr("आगे हरा सिग्नल. रास्ता साफ़ है.", "Green signal ahead. The line is clear."), false, 4)
            }
        }
        if (sigState == 1 && red && !redCleared) {
            if (!passStarted && now >= redGreenAt - 10000) {
                passStarted = true
                startPassingTrain(true)
            }
            if (now >= redGreenAt) {
                redCleared = true
                Sfx.play("train_signal_green", 0.8f)
                say(L.tr("सिग्नल हरा हो गया. गाड़ी चला सकते हैं.", "The signal has turned green. You may proceed."), true, 4)
            }
            if (dS in 0f..700f && now - lastApproach > 500) {
                lastApproach = now
                Sfx.playRate("train_approach", 0.7f, 0.55f)
            }
        }
        if (dS <= 0f) {
            if (red && !redCleared && speed > 1f) {
                redCleared = true
                violations++
                if (passActive) {
                    Sfx.play("train_horn", 1f)
                    fine(COLLISION_FINE, L.tr("आप लाल सिग्नल तोड़कर आती हुई ट्रेन से टकरा गए", "You passed a red signal and collided with an oncoming train"))
                    finish(false, collision = true)
                    return
                }
                fine(SIGNAL_FINE, L.tr("आपने लाल सिग्नल तोड़ा", "You passed a signal at danger"))
            }
            sigIdx++
            sigState = 0
            redCleared = false
            passStarted = false
        }
    }

    // ---- बगल से गुज़रती ट्रेनें ----
    private var passTicks = 0
    private fun startPassingTrain(redWait: Boolean) {
        if (passActive) return
        passActive = true
        passTicks = 0
        val side = if (Random.nextBoolean()) -1 else 1
        val total = 140
        val horn = Random.nextBoolean()
        val stream = Sfx.playLR("train_pass", if (side < 0) 1f else 0.3f, if (side > 0) 1f else 0.3f, 1.1f)
        if (horn) handler.postDelayed({ Sfx.play("train_horn", 0.5f) }, 1500)
        val step = object : Runnable {
            override fun run() {
                if (destroyed) return
                passTicks++
                val f = passTicks / total.toFloat()
                val rate = 1.12f - 0.25f * f                 // पास आते हुए ऊँची, जाते हुए नीची आवाज़
                val near = 1f
                val far = 0.3f
                Sfx.tuneLR(stream, if (side < 0) near else far, if (side > 0) near else far, rate)
                if (passTicks < total) handler.postDelayed(this, 100) else { passActive = false; Sfx.stop(stream) }
            }
        }
        handler.postDelayed(step, 100)
        if (redWait) say(L.tr("बगल की पटरी से एक गाड़ी गुज़र रही है.", "A train is passing on the neighbouring track."), false)
    }

    private fun ambient(now: Long) {
        if (speed * 3.6f > 20f && now > nextAmbientPass && !passActive) {
            nextAmbientPass = now + 70000 + Random.nextLong(0, 70000)
            startPassingTrain(false)
        }
        if (speed > 8f && now - lastJoint > (4200 - speed * 45).toLong().coerceAtLeast(700)) {
            lastJoint = now
            val n = Random.nextInt(1, 4)
            Sfx.playRate("train_joint$n", 0.35f, 0.8f + 0.5f * (speed / (maxKmh / 3.6f)))
        }
    }

    // ---- स्टेशन ----
    private fun stationLogic(now: Long) {
        val last = seq.size - 1
        if (nextIdx > last) return
        val name = seq[nextIdx].name()
        val d = stationPos[nextIdx] - pos
        if (!stops[nextIdx]) {
            if (d <= 0f) {
                say(L.tr("$name स्टेशन से गाड़ी निकल रही है, यहाँ नहीं रुकना.", "Passing $name, no stop here."), false)
                Sfx.playRate("train_approach", 0.5f, 1.2f)
                nextIdx++
                resetCues()
            }
            return
        }
        val cs = cues()
        if (cueNext < cs.size && d < cs[cueNext]) {
            val first = cueNext == 0
            var k = cueNext
            while (k + 1 < cs.size && d < cs[k + 1]) k++     // छोटी दूरी में शुरू हो तो पुरानी सूचनाएँ छोड़ दो
            val dist = cs[k].toInt()
            cueNext = k + 1
            if (first) {
                pa(
                    L.tr(
                        "यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ${digits(trainNo)}, $trainName, $name स्टेशन के प्लेटफ़ॉर्म नंबर $platNow पर आने वाली है.",
                        "Attention please. Train number ${digits(trainNo)}, $trainName, will shortly arrive at $name on platform $platNow."
                    )
                )
            }
            val msg = if (dist >= 1000) L.tr("$name ${dist / 1000} किलोमीटर आगे. यहाँ रुकना है.", "$name is ${dist / 1000} kilometres ahead. You must stop here.")
            else L.tr("$name $dist मीटर आगे. ब्रेक लगाना शुरू कीजिए.", "$name is $dist metres ahead. Start braking.")
            handler.postDelayed({ if (!destroyed && phase == 1) say(msg, false) }, if (first) 7000 else 0)
        }
        val range = if (fast) 1500f else 600f
        if (d in 0f..range && now - lastApproach > (150 + d * (if (fast) 0.6f else 1.5f)).toLong()) {
            lastApproach = now
            Sfx.playRate("train_approach", 0.7f, 0.6f + (1f - d / range) * 1.4f)
        }
        if (d <= 0f && !markTold) {
            markTold = true
            Sfx.playRate("train_approach", 0.9f, 2f)
        }
        if (d < 0f && d > -100f && speed > 0.5f && now - lastApproach > 400) {
            lastApproach = now
            Sfx.playRate("train_approach", 0.8f, 0.5f)
        }
        val waitingAtSignal = sigIdx == nextIdx && sigState == 1 && sigRed[nextIdx] && !redCleared
        if (speed == 0f) {
            if (abs(d) <= 30f) { arrive(false); return }
            if (d < -30f && d >= -100f) { arrive(true); return }
            if (d > 30f && d < 400f && !shortTold && !waitingAtSignal) {
                shortTold = true
                say(L.tr("प्लेटफ़ॉर्म से पहले रुक गए हैं. थोड़ा आगे बढ़ाइए.", "You have stopped short of the platform. Move forward a little."), false)
            }
        } else {
            shortTold = false
        }
        if (d < -100f) {
            missed++
            say(L.tr("आप $name पर नहीं रुके.", "You did not stop at $name."), true)
            giveComplaints(1, early = false)
            nextIdx++
            resetCues()
            if (nextIdx > last) finish(false)
        }
    }

    private fun arrive(overshoot: Boolean) {
        speed = 0f
        targetKmh = 0
        braking = false
        curIdx = nextIdx
        val name = seq[curIdx].name()
        val changed = platNow != platAnn[curIdx]
        Sfx.play("train_arrive", 0.9f)
        handler.postDelayed({ Sfx.play("train_bell", 0.6f) }, 800)
        handler.postDelayed({ Sfx.play("train_door_open", 0.8f) }, 2400)
        handler.postDelayed({ Sfx.play("train_crowd", 0.5f) }, 3200)
        if (curIdx == seq.size - 1) { finish(true); return }
        phase = 0
        departing = false
        lateStage = 0
        countdownTold = false
        scheduledAt = SystemClock.uptimeMillis() + dwellMs()
        val nxt = seq[nextStop(curIdx)].name()
        if (changed) {
            handler.postDelayed({ Sfx.play("train_rush", 0.8f) }, 1800)
            handler.postDelayed({
                pa(
                    L.tr(
                        "यात्रीगण कृपया ध्यान दें. ट्रेन नंबर ${digits(trainNo)}, $trainName, जो प्लेटफ़ॉर्म नंबर ${platAnn[curIdx]} पर आने वाली थी, अब प्लेटफ़ॉर्म नंबर $platNow पर आ रही है. असुविधा के लिए खेद है.",
                        "Attention please. Train number ${digits(trainNo)}, $trainName, which was scheduled on platform ${platAnn[curIdx]}, is now arriving on platform $platNow. We regret the inconvenience."
                    )
                )
            }, 1200)
            handler.postDelayed({
                say(L.tr("एक यात्री: प्लेटफ़ॉर्म बदल गया! सामान उठाओ, जल्दी चलो!", "A passenger: The platform has changed! Grab the luggage, hurry!"), false, 2)
            }, 8500)
        } else {
            handler.postDelayed({
                pa(
                    L.tr(
                        "ट्रेन नंबर ${digits(trainNo)}, $trainName, $name स्टेशन के प्लेटफ़ॉर्म नंबर $platNow पर आ गई है.",
                        "Train number ${digits(trainNo)}, $trainName, has arrived at $name on platform $platNow."
                    )
                )
            }, 1200)
        }
        handler.postDelayed({
            say(
                L.tr(
                    "$name स्टेशन. यात्री उतर और चढ़ रहे हैं. अगला रुकने का स्टेशन $nxt. चलने का समय ${dwellMs() / 1000} सेकंड बाद. तैयार होने पर चलने को तैयार बटन दबाइए.",
                    "$name station. Passengers are getting off and on. The next stop is $nxt. Departure in ${dwellMs() / 1000} seconds. When you are ready, press Ready to depart."
                ),
                false
            )
        }, if (changed) 13000 else 7500)
    }

    private fun fine(amount: Int, why: String) {
        Sfx.play("train_penalty", 0.9f)
        Fx.buzz(this, "exit")
        if (practice) {
            say(L.tr("$why. यह अभ्यास यात्रा है, इसलिए जुर्माना नहीं लगा.", "$why. This is a practice journey, so there is no fine."))
            return
        }
        money = maxOf(0, money - amount)
        prefs.edit().putInt("train_money_v2", money).apply()
        say(L.tr("$why. जुर्माना ${rupees(amount)}. खाते में ${rupees(money)} बचे.", "$why. Fine ${rupees(amount)}. You have ${rupees(money)} left."))
    }

    private fun finish(success: Boolean, abandoned: Boolean = false, collision: Boolean = false) {
        phase = 2
        handler.removeCallbacks(ticker)
        stopLoops()
        var earned = 0
        if (success && violations == 0 && !practice) {
            earned = REWARD
            money += earned
            prefs.edit().putInt("train_money_v2", money).apply()
        }
        val comp = L.tr(" यात्रियों की शिकायतें: $complaints.", " Passenger complaints: $complaints.")
        val text = when {
            collision -> L.tr("यात्रा ख़त्म. टक्कर हो गई. खाते में ${rupees(money)}.", "Journey over. A collision happened. Balance ${rupees(money)}.")
            abandoned -> L.tr("यात्रा बीच में छोड़ दी गई. खाते में ${rupees(money)}.", "The journey was abandoned. Balance ${rupees(money)}.")
            success && violations == 0 -> L.tr(
                "बधाई हो, आप ${seq.last().name()} सुरक्षित पहुँच गए. इनाम ${rupees(earned)}. खाते में अब ${rupees(money)}.",
                "Congratulations, you reached ${seq.last().name()} safely. Reward ${rupees(earned)}. Your balance is now ${rupees(money)}."
            ) + (if (practice) L.tr(" यह अभ्यास यात्रा थी, इसलिए इनाम नहीं मिला.", " This was a practice journey, so there is no reward.") else "") + comp
            success -> L.tr(
                "आप ${seq.last().name()} पहुँच गए, पर सिग्नल तोड़ने की वजह से इनाम नहीं मिला. खाते में ${rupees(money)}.",
                "You reached ${seq.last().name()}, but there is no reward because you broke a signal. Balance ${rupees(money)}."
            ) + comp
            else -> L.tr(
                "यात्रा विफल रही, क्योंकि आख़िरी स्टेशन पर नहीं रुके. खाते में ${rupees(money)}.",
                "The journey failed because you did not stop at the last station. Balance ${rupees(money)}."
            ) + comp
        }
        handler.postDelayed({
            if (destroyed) return@postDelayed
            screen = "end"
            content.removeAllViews()
            focus(title(L.tr("यात्रा समाप्त", "Journey over")))
            info(text)
            say(text)
            add(L.tr("दोबारा यात्रा चुनें", "Choose another journey")) { phase = 2; screenRoutes() }
            add(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
        }, if (abandoned) 100 else if (collision) 2500 else 3500)
    }

    // ================= इंजन, पटरी और गूँज की आवाज़ =================
    private fun startLoops() {
        stopLoops()
        engineStream = Sfx.playLoopRate("train_engine", 0.1f, 0.6f)
        clackStream = Sfx.playLoopRate("train_clack", 0f, 0.5f)
        rumbleStream = Sfx.playLoopRate("train_rumble", 0f, 0.8f)
    }

    private fun stopLoops() {
        Sfx.stop(engineStream)
        Sfx.stop(clackStream)
        Sfx.stop(rumbleStream)
        engineStream = 0
        clackStream = 0
        rumbleStream = 0
    }

    private fun updateLoops() {
        if (engineStream == 0 || clackStream == 0 || rumbleStream == 0) {
            if (Fx.soundOn) startLoops()
            return
        }
        val f = (speed / (maxKmh / 3.6f)).coerceIn(0f, 1f)
        Sfx.tune(engineStream, 0.1f + 0.45f * f, 0.6f + 1.4f * f)
        Sfx.tune(clackStream, if (speed < 0.3f) 0f else 0.5f, 0.5f + 1.5f * f)
        Sfx.tune(rumbleStream, if (speed < 0.5f) 0f else 0.15f + 0.65f * f, 0.8f + 0.9f * f)
    }

    override fun onPause() {
        stopLoops()
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (screen == "drive" && phase != 2) {
            startLoops()
            handler.postDelayed(ticker, 100)
        }
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        stopLoops()
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
