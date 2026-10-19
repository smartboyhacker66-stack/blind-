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

class TrainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    companion object {
        const val MAX_KMH = 80
        const val START_MONEY = 10000
        const val MISSED_STOP_FINE = 5000
        const val OVERSHOOT_FINE = 1000
        const val REWARD = 1000
    }

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null
    private lateinit var content: LinearLayout
    private var screen = "routes"

    // यात्रा की योजना
    private var seq: List<Station> = emptyList()
    private var stops: BooleanArray = BooleanArray(0)
    private var trainNo = "98045"
    private var trainName = "Blind Hub Local"
    private var routeTitle = ""

    // खेल की स्थिति
    private var phase = 0            // 0 = स्टेशन पर, 1 = चल रही है, 2 = ख़त्म
    private var pos = 0f             // मीटर
    private var speed = 0f           // मीटर प्रति सेकंड
    private var targetKmh = 0
    private var braking = false
    private var brakeDecel = 0f
    private var markTold = false
    private var curIdx = 0
    private var nextIdx = 1
    private var money = START_MONEY
    private var practice = false
    private var missed = 0
    private var departing = false
    private var boardingSince = 0L
    private var reminders = 0
    private var lastAnnounce = ""
    private var engineStream = 0
    private var clackStream = 0
    private var lastApproach = 0L
    private var told1000 = false
    private var told300 = false
    private var shortTold = false

    private val prefs get() = getSharedPreferences("blindcarrom", Context.MODE_PRIVATE)

    private fun rupees(n: Int) = L.tr("$n रुपये", "$n game rupees")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_train)
        Sfx.init(this)
        content = findViewById(R.id.trainContent)
        money = prefs.getInt("train_money", START_MONEY)
        tts = TextToSpeech(this, this)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@TrainActivity, "back")
                if (screen == "routes") finish() else leaveToRoutes()
            }
        })
        screenRoutes()
    }

    // ================= आवाज़ =================
    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale.ENGLISH)
            ttsReady = true
            pendingSpeech?.let { say(it) }
            pendingSpeech = null
        }
    }

    private fun say(text: String, flush: Boolean = true) {
        if (flush) lastAnnounce = text
        if (!ttsReady) { pendingSpeech = text; return }
        tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "train")
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
        focus(title(L.tr("ट्रेन गेम: मुंबई लोकल, डेमो", "Train game: Mumbai local, demo")))
        info(L.tr(
            "आप मोटरमैन हैं. अपना रास्ता चुनिए. आपके खाते में ${rupees(money)} हैं." +
                (if (money == 0) " पैसे ख़त्म हैं, इसलिए अभी अभ्यास यात्राएँ चलेंगी, जिनमें जुर्माना नहीं लगेगा." else ""),
            "You are the motorman. Choose your route. Your balance is ${rupees(money)}." +
                (if (money == 0) " Your money is finished, so you will get practice journeys with no fines." else "")
        ))
        for (r in TrainData.routes) {
            add(L.tr("${r.title()}, ${r.stations.size} स्टेशन", "${r.title()}, ${r.stations.size} stations")) { screenMode(r) }
        }
        add(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
    }

    // ================= 2. अपनी पसंद या ड्यूटी =================
    private fun screenMode(r: Route) {
        screen = "mode"
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
        edit(L.tr("स्टेशन का नाम खोजिए", "Search station name"), InputType.TYPE_CLASS_TEXT, 30)
            .also { et ->
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
            }
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

    private fun sequence(r: Route, a: Int, b: Int): List<Station> =
        if (a <= b) r.stations.subList(a, b + 1) else r.stations.subList(b, a + 1).reversed()

    // ================= 3. कहाँ-कहाँ रुकेंगे =================
    private fun pickPattern(r: Route, a: Int, b: Int) {
        screen = "pattern"
        clear()
        val seqLocal = sequence(r, a, b)
        focus(title(L.tr("${seqLocal.first().name()} से ${seqLocal.last().name()}", "${seqLocal.first().name()} to ${seqLocal.last().name()}")))
        info(L.tr("कितने स्टेशनों पर रुकेंगे? पहला और आख़िरी स्टेशन हमेशा रुकना है.", "How many stations will you stop at? The first and last stations are always stops."))
        add(L.tr("सभी स्टेशन, धीमी लोकल", "All stations, slow local")) {
            toTrain(r, seqLocal, BooleanArray(seqLocal.size) { true })
        }
        add(L.tr("सिर्फ़ मुख्य स्टेशन, फ़ास्ट", "Main stations only, fast")) {
            toTrain(r, seqLocal, BooleanArray(seqLocal.size) { i -> i == 0 || i == seqLocal.size - 1 || seqLocal[i].main })
        }
        add(L.tr("मैं ख़ुद चुनूँगा", "I will choose myself")) { pickStops(r, seqLocal) }
        add(L.tr("वापस", "Back"), "back") { screenMode(r) }
    }

    private fun pickStops(r: Route, seqLocal: List<Station>) {
        screen = "pattern"
        clear()
        focus(title(L.tr("रुकने के स्टेशन चुनिए", "Choose your stops")))
        info(L.tr("हर स्टेशन पर दबाने से रुकना या न रुकना बदलता है.", "Press a station to switch between stopping and not stopping."))
        val flags = BooleanArray(seqLocal.size) { true }
        fun label(i: Int) = if (flags[i]) L.tr("${seqLocal[i].name()}: रुकेगी", "${seqLocal[i].name()}: stops")
        else L.tr("${seqLocal[i].name()}: नहीं रुकेगी", "${seqLocal[i].name()}: does not stop")
        for (i in seqLocal.indices) {
            if (i == 0 || i == seqLocal.size - 1) {
                info(L.tr("${seqLocal[i].name()}: हमेशा रुकेगी", "${seqLocal[i].name()}: always stops"))
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
        add(L.tr("चुनाव पूरा हुआ", "Done")) { toTrain(r, seqLocal, flags) }
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
        val s = sequence(r, a, b)
        val all = (0..1).random() == 0
        val fl = BooleanArray(s.size) { i -> all || i == 0 || i == s.size - 1 || s[i].main }
        toTrain(r, s, fl, duty = true)
    }

    // ================= 4. ट्रेन का नंबर और नाम =================
    private fun toTrain(r: Route, s: List<Station>, fl: BooleanArray, duty: Boolean = false) {
        seq = s
        stops = fl
        routeTitle = r.title()
        screen = "train"
        clear()
        val stopCount = fl.count { it }
        focus(title(L.tr("आपकी ड्यूटी", "Your duty")))
        info(L.tr(
            "${s.first().name()} से ${s.last().name()} तक, कुल ${s.size} स्टेशन, जिनमें से $stopCount पर रुकना है.",
            "From ${s.first().name()} to ${s.last().name()}, ${s.size} stations in all, with $stopCount stops."
        ))
        val no = edit(L.tr("ट्रेन का नंबर, अंकों में", "Train number, digits only"), InputType.TYPE_CLASS_NUMBER, 6)
        val nm = edit(L.tr("ट्रेन का नाम", "Train name"), InputType.TYPE_CLASS_TEXT, 24)
        no.setText(trainNo)
        nm.setText(trainName)
        add(L.tr("यात्रा शुरू करें", "Start the journey")) {
            val n = no.text.toString().filter { it.isDigit() }.take(6)
            val t = nm.text.toString().trim().replace(Regex("[^\\p{L}\\p{M}\\p{N} ]"), "").take(24)
            trainNo = if (n.isNotEmpty()) n else "98045"
            trainName = if (t.isNotEmpty()) t else "Blind Hub Local"
            startJourney()
        }
        add(L.tr("वापस", "Back"), "back") { screenMode(TrainData.routes.first { it.title() == routeTitle }) }
    }

    // ================= 5. गाड़ी चलाना =================
    private fun startJourney() {
        screen = "drive"
        clear()
        practice = money == 0
        phase = 0
        pos = 0f
        speed = 0f
        targetKmh = 0
        braking = false
        markTold = false
        curIdx = 0
        nextIdx = 1
        missed = 0
        departing = false
        reminders = 0
        told1000 = false
        told300 = false
        shortTold = false
        boardingSince = SystemClock.uptimeMillis()

        val head = title("${seq.first().name()} → ${seq.last().name()}")
        val status = info(L.tr("गाड़ी ${seq.first().name()} स्टेशन पर खड़ी है.", "The train is standing at ${seq.first().name()}."))
        focus(head)
        add(L.tr("स्थिति सुनें", "Hear status"), "info") { status.text = statusText(); say(statusText()) }
        add(L.tr("रफ़्तार बढ़ाएँ, ब्रेक छोड़ें", "Speed up, release the brake"), "power_up") {
            if (phase == 1) {
                val wasBraking = braking
                braking = false
                targetKmh = minOf(MAX_KMH, targetKmh + 10)
                say(
                    (if (wasBraking) L.tr("ब्रेक छोड़ा. ", "Brake released. ") else "") +
                        L.tr("रफ़्तार का लक्ष्य $targetKmh किलोमीटर प्रति घंटा", "Target speed $targetKmh kilometres per hour"),
                    false
                )
            } else say(L.tr("पहले चलने को तैयार बटन दबाइए.", "First press the Ready to depart button."), false)
        }
        add(L.tr("रफ़्तार घटाएँ", "Slow down"), "power_down") {
            if (phase != 1) return@add
            targetKmh = maxOf(0, targetKmh - 10)
            say(L.tr("रफ़्तार का लक्ष्य $targetKmh किलोमीटर प्रति घंटा", "Target speed $targetKmh kilometres per hour"), false)
        }
        add(L.tr("हल्का ब्रेक", "Light brake"), "aim_left") { brake(0.5f) }
        add(L.tr("मध्यम ब्रेक", "Medium brake"), "aim_right") { brake(0.9f) }
        add(L.tr("तेज़ ब्रेक", "Heavy brake"), "exit") { brake(1.4f) }
        add(L.tr("हॉर्न", "Horn"), "shoot") { Sfx.play("train_horn", 0.9f) }
        add(L.tr("चलने को तैयार", "Ready to depart"), "start") { depart() }
        add(L.tr("आख़िरी घोषणा दोहराएँ", "Repeat last announcement"), "score") { say(lastAnnounce) }
        add(L.tr("यात्रा छोड़ें", "End the journey"), "back") { finish(false, abandoned = true) }

        startLoops()
        handler.postDelayed(ticker, 100)
        handler.postDelayed({
            say(
                L.tr(
                    "आप $routeTitle पर ${seq.first().name()} स्टेशन पर हैं. ट्रेन नंबर ${digits(trainNo)}, $trainName. " +
                        "आपको ${seq.last().name()} तक जाना है, और ${stops.count { it }} स्टेशनों पर रुकना है. " +
                        "अगला रुकने का स्टेशन ${seq[nextStop(0)].name()}. तैयार होने पर चलने को तैयार बटन दबाइए." +
                        (if (practice) " यह अभ्यास यात्रा है, जुर्माना नहीं लगेगा." else ""),
                    "You are at ${seq.first().name()} on the $routeTitle. Train number ${digits(trainNo)}, $trainName. " +
                        "You must reach ${seq.last().name()} and stop at ${stops.count { it }} stations. " +
                        "The next stop is ${seq[nextStop(0)].name()}. When you are ready, press the Ready to depart button." +
                        (if (practice) " This is a practice journey, so there are no fines." else "")
                )
            )
        }, 600)
    }

    private fun nextStop(from: Int): Int {
        for (i in from + 1 until seq.size) if (stops[i]) return i
        return seq.size - 1
    }

    private fun statusText(): String {
        val kmh = (speed * 3.6f).toInt()
        if (phase == 0) return L.tr(
            "गाड़ी ${seq[curIdx].name()} स्टेशन पर खड़ी है. अगला रुकने का स्टेशन ${seq[nextStop(curIdx)].name()}. खाते में ${rupees(money)}.",
            "The train is standing at ${seq[curIdx].name()}. The next stop is ${seq[nextStop(curIdx)].name()}. Balance ${rupees(money)}."
        )
        if (nextIdx >= seq.size) return ""
        val d = (nextIdx * TrainData.HOP_M - pos).toInt().coerceAtLeast(0)
        val st = seq[nextIdx].name()
        val stop = stops[nextIdx]
        return L.tr(
            "रफ़्तार $kmh किलोमीटर प्रति घंटा, लक्ष्य $targetKmh. अगला स्टेशन $st, $d मीटर आगे. " +
                (if (stop) "यहाँ रुकना है." else "यहाँ नहीं रुकना.") + " खाते में ${rupees(money)}.",
            "Speed $kmh kilometres per hour, target $targetKmh. Next station $st, $d metres ahead. " +
                (if (stop) "You must stop here." else "No stop here.") + " Balance ${rupees(money)}."
        )
    }

    /** ब्रेक की लीवर की तरह: एक बार दबाने पर लगा रहता है, जब तक रफ़्तार बढ़ाएँ बटन न दबाएँ. */
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

    private fun depart() {
        if (phase != 0 || departing) return
        departing = true
        say(
            L.tr(
                "ट्रेन नंबर ${digits(trainNo)}, $trainName, चलने को तैयार है.",
                "Train number ${digits(trainNo)}, $trainName, is ready to depart."
            )
        )
        handler.postDelayed({ Sfx.play("train_whistle", 0.9f) }, 2600)
        handler.postDelayed({ Sfx.play("train_door_close", 0.8f) }, 3400)
        handler.postDelayed({
            if (!destroyed && screen == "drive") {
                pos = curIdx * TrainData.HOP_M
                nextIdx = curIdx + 1
                told1000 = false
                told300 = false
                shortTold = false
                markTold = false
                braking = false
                departing = false
                phase = 1
                say(L.tr("दरवाज़े बंद. गाड़ी चलाइए.", "Doors closed. You may move."), false)
            }
        }, 4500)
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
        v = v.coerceIn(0f, MAX_KMH / 3.6f)
        if (v < 0.15f && (targetKmh == 0 || braking)) v = 0f
        speed = v
        pos += v * dt
        updateLoops()
        stationLogic(now)
    }

    private fun boardingTick(now: Long) {
        if (departing) return
        val e = now - boardingSince
        if (e > 25000 && reminders == 0) {
            reminders = 1
            Sfx.play("train_whistle", 0.8f)
            say(L.tr("घोषणा: गाड़ी के चलने का समय हो चुका है. मोटरमैन कृपया गाड़ी चलाएँ.", "Announcement: it is time for the train to depart. Motorman, please start the train."))
        } else if (e > 50000 && reminders == 1) {
            reminders = 2
            Sfx.play("train_phone", 0.9f)
            handler.postDelayed({
                say(L.tr("स्टेशन मास्टर का फ़ोन: मोटरमैन साहब, गाड़ी का समय हो चुका है, कृपया गाड़ी चलाइए.", "Station master on the phone: Motorman, your departure time has passed. Please start the train."))
            }, 2800)
        } else if (e > 75000 && reminders == 2) {
            reminders = 3
            say(L.tr("एक यात्री: अरे भाई, गाड़ी कब चलेगी? हमें देर हो रही है.", "A passenger: Hey, when will this train leave? We are getting late."))
        } else if (e > 100000 && reminders == 3) {
            reminders = 2
            boardingSince = now - 50000
        }
    }

    private fun stationLogic(now: Long) {
        val last = seq.size - 1
        if (nextIdx > last) return
        val name = seq[nextIdx].name()
        val d = nextIdx * TrainData.HOP_M - pos
        if (!stops[nextIdx]) {
            if (d <= 0f) {
                say(L.tr("$name स्टेशन से गाड़ी निकल रही है, यहाँ नहीं रुकना.", "Passing $name, no stop here."), false)
                Sfx.playRate("train_approach", 0.5f, 1.2f)
                nextIdx++
                markTold = false
            }
            return
        }
        if (d < 1000f && !told1000) {
            told1000 = true
            say(L.tr("अगला स्टेशन $name, एक किलोमीटर आगे. यहाँ रुकना है.", "Next station $name, one kilometre ahead. You must stop here."), false)
        }
        if (d < 300f && !told300) {
            told300 = true
            say(L.tr("$name तीन सौ मीटर आगे. ब्रेक लगाना शुरू कीजिए.", "$name is three hundred metres ahead. Start braking."), false)
        }
        if (d in 0f..600f && now - lastApproach > (150 + d * 1.5f).toLong()) {
            lastApproach = now
            Sfx.playRate("train_approach", 0.7f, 0.6f + (1f - d / 600f) * 1.4f)
        }
        if (d <= 0f && !markTold) {
            markTold = true
            Sfx.playRate("train_approach", 0.9f, 2f)
        }
        if (d < 0f && d > -100f && speed > 0.5f && now - lastApproach > 400) {
            lastApproach = now
            Sfx.playRate("train_approach", 0.8f, 0.5f)
        }
        if (speed == 0f) {
            if (abs(d) <= 30f) { arrive(0); return }
            if (d < -30f && d >= -100f) { arrive(OVERSHOOT_FINE); return }
            if (d > 30f && d < 400f && !shortTold) {
                shortTold = true
                say(L.tr("प्लेटफ़ॉर्म से पहले रुक गए हैं. थोड़ा आगे बढ़ाइए.", "You have stopped short of the platform. Move forward a little."), false)
            }
        } else {
            shortTold = false
        }
        if (d < -100f) {
            missed++
            fine(MISSED_STOP_FINE, L.tr("आप $name पर नहीं रुके", "You did not stop at $name"))
            nextIdx++
            told1000 = false
            told300 = false
            shortTold = false
            markTold = false
            if (nextIdx > last) finish(false)
        }
    }

    private fun arrive(extraFine: Int) {
        speed = 0f
        targetKmh = 0
        braking = false
        curIdx = nextIdx
        val name = seq[curIdx].name()
        Sfx.play("train_arrive", 0.9f)
        handler.postDelayed({ Sfx.play("train_bell", 0.7f) }, 800)
        handler.postDelayed({ Sfx.play("train_door_open", 0.8f) }, 2400)
        if (extraFine > 0) fine(extraFine, L.tr("आप प्लेटफ़ॉर्म के निशान से आगे निकल गए", "You overshot the platform mark"))
        if (curIdx == seq.size - 1) { finish(true); return }
        phase = 0
        boardingSince = SystemClock.uptimeMillis()
        reminders = 0
        departing = false
        val nxt = seq[nextStop(curIdx)].name()
        handler.postDelayed({
            say(
                L.tr(
                    "$name स्टेशन आ गया. यात्री उतर और चढ़ रहे हैं. अगला रुकने का स्टेशन $nxt. तैयार होने पर चलने को तैयार बटन दबाइए.",
                    "$name station has arrived. Passengers are getting off and on. The next stop is $nxt. When you are ready, press Ready to depart."
                )
            )
        }, 1200)
    }

    private fun fine(amount: Int, why: String) {
        Sfx.play("train_penalty", 0.9f)
        Fx.buzz(this, "exit")
        if (practice) {
            say(L.tr("$why. यह अभ्यास यात्रा है, इसलिए जुर्माना नहीं लगा.", "$why. This is a practice journey, so there is no fine."))
            return
        }
        money = maxOf(0, money - amount)
        prefs.edit().putInt("train_money", money).apply()
        say(L.tr("$why. जुर्माना ${rupees(amount)}. खाते में ${rupees(money)} बचे.", "$why. Fine ${rupees(amount)}. You have ${rupees(money)} left."))
    }

    private fun finish(success: Boolean, abandoned: Boolean = false) {
        phase = 2
        handler.removeCallbacks(ticker)
        stopLoops()
        var earned = 0
        if (success && missed == 0 && !practice) {
            earned = REWARD
            money += earned
            prefs.edit().putInt("train_money", money).apply()
        }
        val text = when {
            abandoned -> L.tr("यात्रा बीच में छोड़ दी गई. खाते में ${rupees(money)}.", "The journey was abandoned. Balance ${rupees(money)}.")
            success && missed == 0 -> L.tr(
                "बधाई हो, आप ${seq.last().name()} सुरक्षित पहुँच गए. इनाम ${rupees(earned)}. खाते में अब ${rupees(money)}.",
                "Congratulations, you reached ${seq.last().name()} safely. Reward ${rupees(earned)}. Your balance is now ${rupees(money)}."
            ) + (if (practice) L.tr(" यह अभ्यास यात्रा थी, इसलिए इनाम नहीं मिला.", " This was a practice journey, so there is no reward.") else "")
            success -> L.tr(
                "आप ${seq.last().name()} पहुँच गए, पर $missed स्टेशन पर नहीं रुके, इसलिए इनाम नहीं मिला. खाते में ${rupees(money)}.",
                "You reached ${seq.last().name()}, but missed $missed stops, so there is no reward. Balance ${rupees(money)}."
            )
            else -> L.tr(
                "यात्रा विफल रही, क्योंकि आख़िरी स्टेशन पर नहीं रुके. खाते में ${rupees(money)}.",
                "The journey failed because you did not stop at the last station. Balance ${rupees(money)}."
            )
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
        }, if (abandoned) 100 else 3500)
    }

    // ================= इंजन और पटरी की आवाज़ =================
    private fun startLoops() {
        stopLoops()
        engineStream = Sfx.playLoopRate("train_engine", 0.12f, 0.6f)
        clackStream = Sfx.playLoopRate("train_clack", 0f, 0.5f)
    }

    private fun stopLoops() {
        Sfx.stop(engineStream)
        Sfx.stop(clackStream)
        engineStream = 0
        clackStream = 0
    }

    private fun updateLoops() {
        if (engineStream == 0 || clackStream == 0) {
            if (Fx.soundOn) startLoops()
            return
        }
        val f = (speed / (MAX_KMH / 3.6f)).coerceIn(0f, 1f)
        Sfx.tune(engineStream, 0.12f + 0.5f * f, 0.6f + 1.4f * f)
        Sfx.tune(clackStream, if (speed < 0.3f) 0f else 0.55f, 0.5f + 1.5f * f)
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
