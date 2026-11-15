package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlin.random.Random

/** होटल चलाओ: आप ख़ुद का होटल चलाते हैं. मेहमान आते हैं, आप तुरंत फ़ैसले लेते हैं. सब कुछ बोलकर बताया जाता है. */
class HotelActivity : AppCompatActivity() {

    private class Opt(val hi: String, val en: String, val apply: () -> Pair<String, String>)
    private class Ev(val hi: String, val en: String, val opts: List<Opt>)

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private lateinit var content: LinearLayout
    private val prefs by lazy { getSharedPreferences("blindcarrom", Context.MODE_PRIVATE) }

    private var day = 1
    private var cash = 5000
    private var rep = 50
    private var rooms = 3
    private var staff = 0
    private var price = 800
    private var occupied = 0
    private var done = 0
    private val perDay = 6
    private var pending: Ev? = null
    private var deadline = 0L
    private var phase = "start"      // start, event, wait, shop, over
    private var statusView: TextView? = null
    private var lastLine = ""

    private fun speak(text: String, announce: Boolean = false) {
        lastLine = text
        TtsRouter.speak(if (announce) "announce" else "game", text, true)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Sfx.init(this)
        TtsRouter.init(this)
        content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        content.setPadding(pad, pad, pad, pad)
        val sv = ScrollView(this)
        sv.addView(content)
        setContentView(sv)
        render()
    }

    private fun tv(text: String, size: Float = 18f): TextView {
        val t = TextView(this)
        t.text = text
        t.textSize = size
        t.isFocusable = true
        t.setPadding(0, 8, 0, 8)
        content.addView(t)
        return t
    }

    private fun btn(text: String, key: String = "start", click: () -> Unit) {
        val b = Button(this)
        b.text = text
        b.minimumHeight = (64 * resources.displayMetrics.density).toInt()
        b.setOnClickListener { Fx.press(this, key); click() }
        content.addView(b)
    }

    private fun statusText(): String = L.tr(
        "दिन $day, ${done} में से $perDay मेहमान निपटे. नक़दी ₹$cash, साख $rep, कमरे $rooms (भरे $occupied), स्टाफ़ $staff, किराया ₹$price.",
        "Day $day, $done of $perDay guests served. Cash ₹$cash, reputation $rep, rooms $rooms ($occupied occupied), staff $staff, room price ₹$price."
    )

    private fun render() {
        handler.removeCallbacksAndMessages(null)
        content.removeAllViews()
        val head = tv(L.tr("होटल चलाओ", "Run the hotel"), 24f)
        head.postDelayed({ head.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
        statusView = tv(statusText())
        when (phase) {
            "start" -> {
                tv(L.tr("आपका अपना छोटा होटल है, तीन कमरों का. हर दिन छह मेहमान आएँगे और हर मेहमान के लिए आपको तुरंत फ़ैसला लेना है. पैसा और साख बचाइए, और होटल बढ़ाइए. सबसे अच्छा दिन ${prefs.getInt("hotel_best_day", 0)}.", "You own a small three room hotel. Six guests arrive each day and you decide quickly for each one. Protect your money and reputation, and grow the hotel. Best day so far ${prefs.getInt("hotel_best_day", 0)}."))
                btn(L.tr("दिन शुरू करें", "Start the day")) { startDay() }
            }
            "event" -> {
                val e = pending
                if (e != null) {
                    tv(L.tr(e.hi, e.en))
                    for (o in e.opts) btn(L.tr(o.hi, o.en)) { choose(o) }
                }
            }
            "wait" -> tv(L.tr("अगले मेहमान का इंतज़ार...", "Waiting for the next guest..."))
            "shop" -> {
                tv(L.tr("दिन पूरा हुआ. होटल के लिए क्या करें?", "The day is over. What do you want to do for the hotel?"))
                btn(L.tr("एक कमरा बढ़ाएँ, ₹3000", "Add a room, ₹3000")) { buy("room") }
                btn(L.tr("स्टाफ़ रखें, ₹1500 (अधिकतम 3)", "Hire staff, ₹1500 (maximum 3)")) { buy("staff") }
                btn(L.tr("होटल की मरम्मत और सजावट, ₹2000, साख बढ़ेगी", "Renovate the hotel, ₹2000, raises reputation")) { buy("reno") }
                btn(L.tr("किराया ₹100 बढ़ाएँ", "Raise the price by ₹100")) { price += 100; speak(L.tr("किराया अब ₹$price है.", "The price is now ₹$price.")); render() }
                btn(L.tr("किराया ₹100 घटाएँ", "Lower the price by ₹100")) { if (price > 300) price -= 100; speak(L.tr("किराया अब ₹$price है.", "The price is now ₹$price.")); render() }
                btn(L.tr("अगला दिन शुरू करें", "Start the next day")) { day += 1; startDay() }
            }
            "over" -> {
                tv(L.tr("होटल बंद हो गया क्योंकि साख ख़त्म हो गई. आप $day दिन चले.", "The hotel closed because the reputation ran out. You lasted $day days."))
                btn(L.tr("नया होटल शुरू करें", "Start a new hotel")) { day = 1; cash = 5000; rep = 50; rooms = 3; staff = 0; price = 800; phase = "start"; render() }
            }
        }
        btn(L.tr("स्थिति सुनें", "Hear status"), "info") { speak(statusText()) }
        btn(L.tr("आख़िरी बात दोहराएँ", "Repeat the last message"), "score") { speak(lastLine) }
        btn(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
    }

    private fun buy(what: String) {
        val msg = when (what) {
            "room" -> if (cash >= 3000) { cash -= 3000; rooms += 1; Sfx.play("train_arrive", 0.8f); L.tr("नया कमरा जुड़ गया. अब $rooms कमरे हैं.", "A new room was added. You have $rooms rooms now.") } else L.tr("नक़दी कम है.", "Not enough cash.")
            "staff" -> if (staff >= 3) L.tr("स्टाफ़ पहले से पूरा है.", "The staff is already full.") else if (cash >= 1500) { cash -= 1500; staff += 1; Sfx.play("train_arrive", 0.8f); L.tr("नया कर्मचारी रखा. अब $staff कर्मचारी हैं.", "Hired a new staff member. You have $staff now.") } else L.tr("नक़दी कम है.", "Not enough cash.")
            else -> if (cash >= 2000) { cash -= 2000; rep = minOf(100, rep + 8); Sfx.play("train_arrive", 0.8f); L.tr("मरम्मत हो गई. साख बढ़कर $rep हुई.", "Renovation done. Reputation is now $rep.") } else L.tr("नक़दी कम है.", "Not enough cash.")
        }
        speak(msg)
        render()
    }

    private fun startDay() {
        done = 0; occupied = 0
        speak(L.tr("दिन $day शुरू. होटल खुल गया.", "Day $day begins. The hotel is open."), true)
        phase = "wait"
        render()
        handler.postDelayed({ nextEvent() }, 4000)
    }

    private fun nextEvent() {
        if (destroyed) return
        if (done >= perDay) { endDay(); return }
        pending = makeEvent()
        phase = "event"
        deadline = System.currentTimeMillis() + (if (staff > 0) 40000L else 25000L)
        Sfx.play("train_bell", 0.8f)
        render()
        val e = pending
        if (e != null) speak(L.tr(e.hi, e.en) + " " + L.tr("विकल्प: ", "Options: ") + e.opts.joinToString(". ") { L.tr(it.hi, it.en) })
        tick()
    }

    private fun tick() {
        if (destroyed || phase != "event") return
        val left = ((deadline - System.currentTimeMillis()) / 1000).toInt()
        if (left <= 0) { timeout(); return }
        if (left == 10) speak(L.tr("दस सेकंड बाक़ी.", "Ten seconds left."))
        handler.postDelayed({ tick() }, 1000)
    }

    private fun timeout() {
        val loss = if (staff > 0) 1 else 3
        rep = maxOf(0, rep - loss)
        Sfx.play("train_penalty", 0.7f)
        finishEvent(L.tr("आपने जवाब नहीं दिया, मेहमान चला गया. साख $loss घटी.", "You did not answer and the guest left. Reputation dropped by $loss."))
    }

    private fun choose(o: Opt) {
        val r = o.apply()
        val msg = L.tr(r.first, r.second)
        finishEvent(msg)
    }

    private fun finishEvent(msg: String) {
        pending = null
        done += 1
        cash = maxOf(0, cash)
        rep = rep.coerceIn(0, 100)
        speak(msg + " " + L.tr("नक़दी ₹$cash, साख $rep.", "Cash ₹$cash, reputation $rep."))
        if (rep <= 0) { phase = "over"; render(); return }
        phase = "wait"
        render()
        handler.postDelayed({ nextEvent() }, 6000)
    }

    private fun endDay() {
        val best = prefs.getInt("hotel_best_day", 0)
        if (day > best) prefs.edit().putInt("hotel_best_day", day).apply()
        phase = "shop"
        Sfx.play("win", 0.7f)
        render()
        speak(L.tr("दिन $day पूरा. नक़दी ₹$cash, साख $rep. होटल के लिए कुछ ख़रीद सकते हैं.", "Day $day is over. Cash ₹$cash, reputation $rep. You can spend on the hotel now."), true)
    }

    private fun free(): Boolean = occupied < rooms

    private fun makeEvent(): Ev {
        return when (Random.nextInt(5)) {
            0 -> Ev("एक मेहमान कमरा माँग रहा है.", "A guest asks for a room.", listOf(
                Opt("कमरा दें, ₹$price", "Give a room, ₹$price") {
                    if (free()) { occupied++; cash += price; rep += 1; Sfx.play("train_arrive", 0.7f); Pair("कमरा दे दिया. ₹$price मिले.", "Room given. You earned ₹$price.") }
                    else { rep -= 2; Pair("कोई कमरा ख़ाली नहीं है. मेहमान नाराज़ हुआ.", "No room is free. The guest is upset.") }
                },
                Opt("बीस प्रतिशत छूट पर दें", "Give it at twenty percent off") {
                    if (free()) { occupied++; val p = price * 8 / 10; cash += p; rep += 3; Sfx.play("train_arrive", 0.7f); Pair("छूट पर कमरा दिया. ₹$p मिले, मेहमान ख़ुश.", "Room given with a discount. You earned ₹$p and the guest is happy.") }
                    else { rep -= 2; Pair("कोई कमरा ख़ाली नहीं है.", "No room is free.") }
                },
                Opt("मना करें", "Say no") { rep -= 1; Pair("आपने मना कर दिया.", "You said no.") }
            ))
            1 -> Ev("एक मेहमान खाना मँगवा रहा है.", "A guest orders food.", listOf(
                Opt("अच्छा खाना बनवाएँ, ₹150 ख़र्च", "Cook a good meal, ₹150 cost") { cash += 250; rep += 2; Sfx.play("train_arrive", 0.7f); Pair("अच्छा खाना गया. ₹250 का फ़ायदा.", "A good meal was served. You gained ₹250.") },
                Opt("ठंडा नाश्ता दें", "Give a cold snack") { cash += 150; rep -= 1; Pair("ठंडा नाश्ता दिया. ₹150 मिले, मेहमान ज़्यादा ख़ुश नहीं.", "A cold snack was given. You got ₹150 but the guest is not very happy.") },
                Opt("मना करें", "Decline") { rep -= 1; Pair("आपने मना कर दिया.", "You declined.") }
            ))
            2 -> Ev("एक मेहमान की शिकायत है कि कमरे का AC ख़राब है.", "A guest complains that the room AC is broken.", listOf(
                Opt("AC ठीक करवाएँ, ₹300", "Get the AC fixed, ₹300") { cash -= 300; rep += 3; Pair("AC ठीक हुआ. मेहमान ख़ुश.", "The AC was fixed. The guest is happy.") },
                Opt("माफ़ी माँगें", "Apologise") { val g = if (staff > 0) 2 else 1; rep += g; Pair("माफ़ी माँगी. साख $g बढ़ी.", "You apologised. Reputation rose by $g.") },
                Opt("अनदेखा करें", "Ignore it") { rep -= 4; Sfx.play("train_penalty", 0.7f); Pair("शिकायत अनदेखी की. साख चार घटी.", "You ignored the complaint. Reputation dropped by four.") }
            ))
            3 -> Ev("एक ख़ास मेहमान आए हैं, वे सबसे अच्छा इंतज़ाम चाहते हैं.", "A VIP guest has arrived and wants the best arrangements.", listOf(
                Opt("सबसे अच्छा कमरा और स्वागत, ₹500 ख़र्च", "Best room and welcome, ₹500 cost") {
                    if (free()) { occupied++; cash += 2000; rep += 5; Sfx.play("train_arrive", 0.8f); Pair("ख़ास मेहमान ख़ुश. ₹2000 का फ़ायदा.", "The VIP is delighted. You gained ₹2000.") }
                    else { rep -= 2; Pair("कोई कमरा ख़ाली नहीं है.", "No room is free.") }
                },
                Opt("सामान्य कमरा दें", "Give a normal room") {
                    if (free()) { occupied++; cash += price * 2; rep += 1; Pair("सामान्य कमरा दिया. ₹${price * 2} मिले.", "A normal room was given. You earned ₹${price * 2}.") }
                    else { rep -= 2; Pair("कोई कमरा ख़ाली नहीं है.", "No room is free.") }
                },
                Opt("मना करें", "Say no") { rep -= 2; Pair("ख़ास मेहमान लौट गए.", "The VIP left.") }
            ))
            else -> Ev("एक मेहमान की कमरे की चाबी खो गई है.", "A guest has lost the room key.", listOf(
                Opt("दूसरी चाबी दें, ₹50", "Give a spare key, ₹50") { cash -= 50; rep += 1; Pair("दूसरी चाबी दी.", "A spare key was given.") },
                Opt("दरवाज़े का ताला बदलवाएँ, ₹250", "Change the door lock, ₹250") { cash -= 250; rep += 2; Pair("ताला बदला. मेहमान सुरक्षित महसूस कर रहे हैं.", "The lock was changed. The guest feels safe.") },
                Opt("कुछ न करें", "Do nothing") { rep -= 2; Pair("मेहमान परेशान रहे.", "The guest was left upset.") }
            ))
        }
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
