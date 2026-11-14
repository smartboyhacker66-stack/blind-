package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/** दुकान: इंजन खरीदना, प्रोमो कोड, और सिक्के को गेम रुपये में बदलना. दुकान चालू या बंद करना एडमिन के हाथ में है. */
class ShopActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private lateinit var root: LinearLayout
    private val prefs by lazy { getSharedPreferences("blindcarrom", Context.MODE_PRIVATE) }

    private var shopOpen = false
    private var loaded = false
    private var prices: Map<String, Int> = emptyMap()
    private var convOn = false
    private var rate = 5
    private var busy = false

    private val catalog = listOf(
        Triple("engine_fast", Pair("तेज़ इंजन", "Fast engine"), Pair("ट्रेन जल्दी रफ़्तार पकड़ती है.", "The train picks up speed faster.")),
        Triple("engine_heavy", Pair("भारी इंजन", "Heavy engine"), Pair("ब्रेक ज़्यादा असरदार, ट्रेन जल्दी रुकती है.", "Stronger brakes, the train stops sooner.")),
        Triple("engine_super", Pair("सुपर इंजन", "Super engine"), Pair("तेज़ पकड़ और ज़्यादा असरदार ब्रेक, दोनों.", "Faster pickup and stronger brakes, both."))
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Sfx.init(this)
        Net.init(this)
        TtsRouter.init(this)
        root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        root.setPadding(pad, pad, pad, pad)
        val sv = ScrollView(this)
        sv.addView(root)
        setContentView(sv)
        render()
        refresh()
    }

    private fun speak(text: String) = TtsRouter.speak("announce", text, true)

    private fun owned(): Set<String> = (prefs.getString("owned_items", "") ?: "").split(",").filter { it.isNotEmpty() }.toSet()
    private fun coins(): Int = prefs.getInt("road_coins", 0)

    private fun refresh() {
        Net.bg({ Pair(Net.call("GET", "/api/shop"), Net.call("GET", "/api/coins/rate")) }, { (a, b) ->
            if (!destroyed) {
                if (a.ok && a.json != null) {
                    shopOpen = a.json.optBoolean("open")
                    val p = a.json.optJSONObject("prices")
                    val m = HashMap<String, Int>()
                    if (p != null) for (k in p.keys()) m[k] = p.optInt(k)
                    prices = m
                    loaded = true
                }
                if (b.ok && b.json != null) { convOn = b.json.optBoolean("on"); rate = b.json.optInt("rate", 5) }
                if (Net.token != null) Wallet.pull(this) { if (!destroyed) render() } else render()
            }
        })
    }

    private fun add(v: android.view.View) = root.addView(v)

    private fun text(s: String, size: Float = 17f, bold: Boolean = false): TextView {
        val tv = TextView(this)
        tv.text = s
        tv.textSize = size
        if (bold) tv.setTypeface(null, android.graphics.Typeface.BOLD)
        tv.isFocusable = true
        tv.setPadding(0, 8, 0, 8)
        add(tv)
        return tv
    }

    private fun btn(s: String, key: String = "start", click: () -> Unit): Button {
        val b = Button(this)
        b.text = s
        b.minimumHeight = (60 * resources.displayMetrics.density).toInt()
        b.setOnClickListener { Fx.press(this, key); click() }
        add(b)
        return b
    }

    private fun render() {
        root.removeAllViews()
        val head = text(L.tr("दुकान", "Shop"), 24f, true)
        head.postDelayed({ head.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
        text(L.tr("आपके पास ${Wallet.local(this)} गेम रुपये हैं.", "You have ${Wallet.local(this)} game rupees."))
        if (Net.token == null) text(L.tr("खरीदारी के लिए पहले ऑनलाइन मल्टीप्लेयर में लॉगिन कीजिए.", "Sign in under Online multiplayer to shop."))
        if (!loaded) text(L.tr("दुकान की जानकारी आ रही है...", "Loading the shop..."))
        else if (!shopOpen) text(L.tr("दुकान अभी बंद है. यह 12 दिसंबर 2026 को खुलेगी.", "The shop is closed for now. It opens on 12 December 2026."))
        else {
            text(L.tr("इंजन", "Engines"), 20f, true)
            val have = owned()
            for ((id, names, desc) in catalog) {
                val price = prices[id] ?: continue
                val name = L.tr(names.first, names.second)
                text("$name: " + L.tr(desc.first, desc.second))
                if (id in have) btn(L.tr("$name आपके पास है", "You own the $name"), "info") { speak(L.tr("यह इंजन आपके पास पहले से है.", "You already own this engine.")) }
                else btn(L.tr("$name खरीदें, $price गेम रुपये", "Buy the $name, $price game rupees"), "start") { buy(id, name) }
            }
        }
        text(L.tr("प्रोमो कोड", "Promo code"), 20f, true)
        val code = EditText(this)
        code.hint = L.tr("प्रोमो कोड यहाँ लिखिए", "Type the promo code here")
        code.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        code.filters = arrayOf(android.text.InputFilter.LengthFilter(20))
        add(code)
        btn(L.tr("कोड इस्तेमाल करें", "Use the code"), "start") { redeem(code.text.toString().trim()) }

        text(L.tr("बैंक: सिक्के से गेम रुपये", "Bank: coins to game rupees"), 20f, true)
        text(L.tr("आपके पास ${coins()} सिक्के हैं (पहाड़ी सफ़र से कमाए).", "You have ${coins()} coins (earned in the hill trail)."))
        if (!loaded) { /* जानकारी आने तक कुछ नहीं */ }
        else if (!convOn) text(L.tr("सिक्का बदलना अभी बंद है.", "Coin conversion is off for now."))
        else {
            text(L.tr("दर: 1 सिक्का = $rate गेम रुपये.", "Rate: 1 coin = $rate game rupees."))
            btn(L.tr("सिक्के गेम रुपये में बदलें", "Convert coins to game rupees"), "start") { convert() }
        }
        btn(L.tr("वापस", "Back"), "back") { finish() }
    }

    private fun buy(item: String, name: String) {
        if (busy) return
        if (Net.token == null) { speak(L.tr("पहले लॉगिन कीजिए.", "Please sign in first.")); return }
        busy = true
        Sfx.play("train_phone", 0.6f)
        speak(L.tr("भुगतान हो रहा है. कृपया रुकिए.", "Processing the payment. Please wait."))
        Net.bg({ Net.call("POST", "/api/shop/buy", JSONObject().put("item", item)) }, { r ->
            handler.postDelayed({
                busy = false
                if (destroyed) return@postDelayed
                if (r.ok) {
                    Sfx.play("train_arrive", 0.9f)
                    val items = owned().toMutableSet(); items.add(item)
                    prefs.edit().putString("owned_items", items.joinToString(",")).apply()
                    speak(L.tr("भुगतान हो गया. $name अब आपका है. बचे ${r.json?.optInt("balance") ?: 0} गेम रुपये.", "Payment done. The $name is yours now. ${r.json?.optInt("balance") ?: 0} game rupees left."))
                    Wallet.pull(this) { if (!destroyed) render() }
                } else {
                    Sfx.play("train_penalty", 0.8f)
                    speak(
                        when {
                            r.code == 402 -> L.tr("गेम रुपये कम हैं. भुगतान नहीं हुआ.", "Not enough game rupees. Payment failed.")
                            r.error == "shop_closed" -> L.tr("दुकान अभी बंद है.", "The shop is closed right now.")
                            r.error == "already_owned" -> L.tr("यह आपके पास पहले से है.", "You already own this.")
                            else -> L.tr("कुछ गड़बड़ हुई. भुगतान नहीं हुआ.", "Something went wrong. Payment failed.")
                        }
                    )
                }
            }, 1500)
        })
    }

    private fun redeem(code: String) {
        if (busy) return
        if (code.isEmpty()) { speak(L.tr("पहले कोड लिखिए.", "Type a code first.")); return }
        if (Net.token == null) { speak(L.tr("पहले लॉगिन कीजिए.", "Please sign in first.")); return }
        busy = true
        Net.bg({ Net.call("POST", "/api/promo/redeem", JSONObject().put("code", code)) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok) {
                    Sfx.play("train_arrive", 0.9f)
                    speak(L.tr("कोड सही है. ${r.json?.optInt("added") ?: 0} गेम रुपये जुड़ गए.", "Code accepted. ${r.json?.optInt("added") ?: 0} game rupees added."))
                    Wallet.pull(this) { if (!destroyed) render() }
                } else {
                    Sfx.play("train_penalty", 0.8f)
                    speak(if (r.error == "already_used") L.tr("आप यह कोड पहले इस्तेमाल कर चुके हैं.", "You have already used this code.") else L.tr("यह कोड सही नहीं है.", "This code is not valid."))
                }
            }
        })
    }

    private fun convert() {
        if (busy) return
        if (Net.token == null) { speak(L.tr("पहले लॉगिन कीजिए.", "Please sign in first.")); return }
        val n = minOf(coins(), 1000)
        if (n < 1) { speak(L.tr("आपके पास बदलने के लिए सिक्के नहीं हैं.", "You have no coins to convert.")); return }
        busy = true
        Net.bg({ Net.call("POST", "/api/coins/convert", JSONObject().put("coins", n)) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok) {
                    prefs.edit().putInt("road_coins", coins() - n).apply()
                    Sfx.play("ui_power_up", 0.9f)
                    speak(L.tr("$n सिक्के बदले. ${r.json?.optInt("added") ?: 0} गेम रुपये मिले.", "Converted $n coins. You got ${r.json?.optInt("added") ?: 0} game rupees."))
                    Wallet.pull(this) { if (!destroyed) render() }
                } else {
                    Sfx.play("train_penalty", 0.8f)
                    speak(if (r.error == "convert_off") L.tr("सिक्का बदलना अभी बंद है.", "Coin conversion is off right now.") else if (r.code == 429) L.tr("थोड़ी देर बाद कोशिश कीजिए.", "Try again in a little while.") else L.tr("कुछ गड़बड़ हुई.", "Something went wrong."))
                }
            }
        })
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
