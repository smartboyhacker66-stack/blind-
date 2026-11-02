package com.blindindiantech.blindcarrom

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/** पहाड़ी सफ़र: स्तर 1. भारी हॉलर ट्रक, 2000 मीटर का रास्ता. */
class RoadActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    companion object {
        const val ROAD_M = 2000f
        const val BRIDGE_M = 1200f
        const val SIGNAL_M = 1600f
        const val SUMMIT_M = 1800f
        const val MAX_KMH = 180f
        const val BIKE_MAX_KMH = 140f
        const val BRIDGE_NAME = "Weak Bridge"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private lateinit var content: LinearLayout
    private lateinit var status: TextView
    private lateinit var gasBtn: Button
    private lateinit var brakeBtn: Button

    private var pos = 0f
    private var kmh = 0f
    private var gas = false
    private var brakeOn = false
    private var tilt = 0f            // + नाक नीचे, - नाक ऊपर
    private var fuel = 100f
    private var coinsGot = 0
    private var gems = 0
    private var damage = 0
    private var lastMeter = 0
    private val fuelDone = HashSet<Int>()
    private var bridgeDone = false
    private var signalWindowMin = -1f
    private var signalDone = false
    private var done = false
    private var engine = 0
    private var lastTick = 0L
    private var lastBump = 0f
    private var fuelWarned = false
    private var engineLvl = 0
    private var tankLvl = 0
    private var suspLvl = 0
    private var totalCoins = 0
    private var totalGems = 0
    private var running = false
    private var nextSnake = 0f
    private var snakeDeadline = 0L
    private var snakes = 0
    private var snakesAvoided = 0
    private var vehicle = 0
    private var bridgeWarned = false
    private var bridgeMax = 0f
    private var creaked = false
    private var runSaved = false
    private val prefs get() = getSharedPreferences("blindcarrom", MODE_PRIVATE)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Sfx.init(this)
        content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.setPadding(dp(20), dp(20), dp(20), dp(20))
        val scroll = ScrollView(this)
        scroll.addView(content)
        setContentView(scroll)
        tts = TextToSpeech(this, this)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@RoadActivity, "back")
                finish()
            }
        })
        showGarage()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun title(text: String) {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 24f
        tv.setTypeface(null, android.graphics.Typeface.BOLD)
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        content.addView(tv)
        tv.postDelayed({ tv.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
    }

    private fun button(text: String, key: String, onClick: () -> Unit): Button {
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

    private fun info(text: String): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 18f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        content.addView(tv)
        return tv
    }

    private fun maxKmh(): Float = if (vehicle == 1) BIKE_MAX_KMH else MAX_KMH
    private fun vehicleName(): String = if (vehicle == 1) "Smart Runner" else "Shark"
    private fun bridgeLimit(): Float = if (vehicle == 1) 35f else 20f

    private fun loadGarage() {
        vehicle = prefs.getInt("road_vehicle", 0)
        engineLvl = prefs.getInt("road_engine", 0)
        tankLvl = prefs.getInt("road_tank", 0)
        suspLvl = prefs.getInt("road_susp", 0)
        totalCoins = prefs.getInt("road_coins", 0)
        totalGems = prefs.getInt("road_gems", 0)
    }

    private fun saveGarage() {
        prefs.edit().putInt("road_engine", engineLvl).putInt("road_tank", tankLvl).putInt("road_susp", suspLvl)
            .putInt("road_coins", totalCoins).putInt("road_gems", totalGems).apply()
    }

    private fun engineCost() = 300 * (engineLvl + 1)
    private fun tankCost() = 250 * (tankLvl + 1)
    private fun suspCost() = 2 * (suspLvl + 1)

    private fun showGarage() {
        running = false
        handler.removeCallbacks(ticker)
        Sfx.stop(engine); engine = 0
        loadGarage()
        content.removeAllViews()
        title(L.tr("गैराज: SL Road", "Garage: SL Road"))
        info(L.tr(
            "आपके पास $totalCoins सिक्के और $totalGems रत्न हैं. इंजन स्तर $engineLvl, टंकी स्तर $tankLvl, सस्पेंशन स्तर $suspLvl. " +
                "इंजन से गाड़ी तेज़ पकड़ती है, टंकी से ईंधन कम ख़र्च होता है, और सस्पेंशन से झटके कम लगते हैं.",
            "You have $totalCoins coins and $totalGems gems. Engine level $engineLvl, tank level $tankLvl, suspension level $suspLvl. " +
                "The engine speeds you up faster, the tank saves fuel, and the suspension softens jolts."
        ))
        button(L.tr("गाड़ी: ${vehicleName()} (बदलने के लिए दबाएँ)", "Vehicle: ${vehicleName()} (press to change)"), "fx") {
            vehicle = 1 - vehicle
            prefs.edit().putInt("road_vehicle", vehicle).apply()
            showGarage()
            say(L.tr("अब आपकी गाड़ी ${vehicleName()} है.", "Your vehicle is now ${vehicleName()}."), false)
        }
        button(L.tr("दौड़ शुरू करें", "Start the run"), "start") { startRun() }
        button(L.tr("इंजन सुधारें, ${engineCost()} सिक्के", "Upgrade the engine, ${engineCost()} coins"), "power_up") {
            if (totalCoins >= engineCost()) { totalCoins -= engineCost(); engineLvl++; saveGarage(); showGarage(); say(L.tr("इंजन सुधर गया.", "Engine upgraded."), false) }
            else say(L.tr("सिक्के कम हैं.", "Not enough coins."), false)
        }
        button(L.tr("टंकी सुधारें, ${tankCost()} सिक्के", "Upgrade the fuel tank, ${tankCost()} coins"), "power_up") {
            if (totalCoins >= tankCost()) { totalCoins -= tankCost(); tankLvl++; saveGarage(); showGarage(); say(L.tr("टंकी सुधर गई.", "Tank upgraded."), false) }
            else say(L.tr("सिक्के कम हैं.", "Not enough coins."), false)
        }
        button(L.tr("सस्पेंशन सुधारें, ${suspCost()} रत्न", "Upgrade the suspension, ${suspCost()} gems"), "power_up") {
            if (totalGems >= suspCost()) { totalGems -= suspCost(); suspLvl++; saveGarage(); showGarage(); say(L.tr("सस्पेंशन सुधर गया.", "Suspension upgraded."), false) }
            else say(L.tr("रत्न कम हैं.", "Not enough gems."), false)
        }
        button(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
    }

    private fun startRun() {
        loadGarage()
        pos = 0f; kmh = 0f; gas = false; brakeOn = false; tilt = 0f; fuel = 100f
        coinsGot = 0; gems = 0; damage = 0; lastMeter = 0
        fuelDone.clear(); bridgeDone = false; signalWindowMin = -1f; signalDone = false
        done = false; fuelWarned = false; lastBump = 0f; snakes = 0; snakesAvoided = 0; runSaved = false
        bridgeWarned = false; bridgeMax = 0f; creaked = false
        nextSnake = SUMMIT_M + 60f; snakeDeadline = 0L
        buildScreen()
        lastTick = SystemClock.uptimeMillis()
        Sfx.stop(engine)
        engine = Sfx.playLoopRate("train_motor", 0f, 0.5f)
        running = true
        handler.postDelayed(ticker, 100)
        say(L.tr(
            "आप SL Road पर ${vehicleName()} चला रहे हैं. दो किलोमीटर का रास्ता है. गैस और ब्रेक के बटन दबाकर चलाइए, नाक ऊपर या नीचे करके संतुलन रखिए. आगे $BRIDGE_NAME है, उस पर ${bridgeLimit().toInt()} किमी प्रति घंटा से धीमे चलिए. सिग्नल के खंभे के पास धीमा ब्रेक लगाइए. चोटी पर सांप मिलेंगे, ब्रेक से बचिए.",
            "You are running on SL Road with the ${vehicleName()}. over two kilometres. Use the gas and brake buttons, and keep the nose up or down to stay balanced. The $BRIDGE_NAME is ahead, stay below ${bridgeLimit().toInt()} km per hour on it. Brake gently near the signal marker. There are snakes on the summit, brake to avoid them."
        ))
    }

    private fun endRun() {
        if (!runSaved) {
            runSaved = true
            totalCoins += coinsGot
            totalGems += gems
            saveGarage()
        }
    }

    private fun buildScreen() {
        content.removeAllViews()
        title(L.tr("पहाड़ी सफ़र: स्तर 1", "Hill trail: level 1"))
        status = TextView(this)
        status.textSize = 18f
        status.isFocusable = true
        status.setPadding(0, 0, 0, dp(12))
        content.addView(status)
        gasBtn = button(gasText(), "start") { gas = !gas; gasBtn.text = gasText(); say(if (gas) L.tr("गैस चालू", "Gas on") else L.tr("गैस बंद", "Gas off"), false) }
        brakeBtn = button(brakeText(), "fine") { brakeOn = !brakeOn; brakeBtn.text = brakeText(); say(if (brakeOn) L.tr("ब्रेक लगा", "Brake on") else L.tr("ब्रेक छूटा", "Brake released"), false) }
        button(L.tr("नाक ऊपर करें", "Nose up"), "aim_left") { tilt -= 20f; say(L.tr("नाक ऊपर", "Nose up"), false) }
        button(L.tr("नाक नीचे करें", "Nose down"), "aim_right") { tilt += 20f; say(L.tr("नाक नीचे", "Nose down"), false) }
        button(L.tr("स्थिति सुनें", "Hear status"), "info") { say(statusText()) }
        button(L.tr("गैराज में वापस", "Back to the garage"), "back") { endRun(); showGarage() }
        button(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { endRun(); finish() }
    }

    private fun gasText() = if (gas) L.tr("गैस बंद करें", "Gas off") else L.tr("गैस चालू करें", "Gas on")
    private fun brakeText() = if (brakeOn) L.tr("ब्रेक छोड़ें", "Release the brake") else L.tr("ब्रेक लगाएँ", "Apply the brake")

    private fun statusText(): String {
        val bal = when {
            tilt > 30f -> L.tr("नाक नीचे की ओर झुकी", "nose tilting down")
            tilt < -30f -> L.tr("नाक ऊपर की ओर झुकी", "nose tilting up")
            else -> L.tr("संतुलन ठीक", "balanced")
        }
        return L.tr(
            "SL Road, ${vehicleName()}. दूरी ${pos.toInt()} मीटर, गति ${kmh.toInt()} किलोमीटर प्रति घंटा, ईंधन ${fuel.toInt()} प्रतिशत, $bal, सिक्के $coinsGot, रत्न $gems, नुकसान $damage.",
            "Distance ${pos.toInt()} metres, speed ${kmh.toInt()} km per hour, fuel ${fuel.toInt()} percent, $bal, coins $coinsGot, gems $gems, damage $damage."
        )
    }

    private fun say(text: String, flush: Boolean = true) {
        if (!ttsReady) return
        tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "road")
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale.ENGLISH)
            ttsReady = true
        }
    }

    private fun slope(): Float = if (pos >= SUMMIT_M) 1f else 0f

    private fun crash(msg: String) {
        damage++
        kmh = 0f
        tilt = 0f
        pos = max(0f, pos - 100f)
        Sfx.play("train_brake_clunk", 0.9f)
        say(msg)
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed || done || !running) return
            val now = SystemClock.uptimeMillis()
            val dt = min(200L, now - lastTick) / 1000f
            lastTick = now
            step(dt)
            refresh()
            handler.postDelayed(this, 100)
        }
    }

    private fun step(dt: Float) {
        // गति: गैस बढ़ाती है, ब्रेक घटाता है, चढ़ाई और हवा रोकती है
        if (gas && fuel > 0f) kmh += (30f * (1f - kmh / maxKmh()) + 4f) * (1f + 0.1f * engineLvl) * (if (vehicle == 1) 1.3f else 1f) * dt
        if (brakeOn) kmh -= 60f * dt
        kmh -= (slope() * 14f + 2f + kmh / MAX_KMH * 12f) * dt
        kmh = kmh.coerceIn(0f, maxKmh())
        if (kmh > 0f) fuel = max(0f, fuel - kmh * 0.004f * max(0.3f, 1f - 0.1f * tankLvl) * (if (vehicle == 1) 0.8f else 1f) * dt)
        if (fuel <= 0f && !fuelWarned) { fuelWarned = true; say(L.tr("ईंधन ख़त्म!", "Out of fuel!")) }
        pos += kmh / 3.6f * dt

        // संतुलन: चढ़ाई पर नाक नीचे झुकती है, और सड़क हिलाती है
        tilt += (slope() * 25f + (Random.nextFloat() - 0.5f) * 10f * (if (vehicle == 1) 1.6f else 1f)) * dt
        if (pos >= SUMMIT_M && pos - lastBump > 150f) {
            lastBump = pos
            tilt += (Random.nextFloat() - 0.5f) * 80f * max(0.3f, 1f - 0.15f * suspLvl)
            Sfx.playRate("train_jerk${1 + Random.nextInt(5)}", 0.5f, 1f)
            say(L.tr("सांपों वाली चोटी पर झटका!", "A jolt on the serpent summit!"), false)
        }
        if (abs(tilt) >= 100f) { crash(L.tr("गाड़ी संतुलन खोकर पलट गई", "The truck lost balance and flipped")); return }

        // सिक्के: हर मीटर पर एक, आवाज़ हर 50 मीटर पर
        val m = pos.toInt()
        while (lastMeter < m) {
            lastMeter++
            coinsGot++
            if (lastMeter % 50 == 0) Sfx.play("ui_info", 0.5f)
        }

        // ईंधन स्टेशन: हर 200 मीटर
        val fs = (pos / 200f).toInt()
        if (fs > 0 && fs !in fuelDone) {
            fuelDone.add(fs)
            fuel = min(100f, fuel + 30f)
            Sfx.play("ui_power_up", 0.6f)
            say(L.tr("ईंधन भरा", "Fuel filled"), false)
        }

        // सांप: चोटी पर हर 80 से 140 मीटर में एक. 6 सेकंड में गति 40 किमी/घंटा से नीचे न करें तो डस लेता है
        if (pos >= nextSnake && snakeDeadline == 0L) {
            snakeDeadline = SystemClock.uptimeMillis() + 6000
            Sfx.play("train_brake_hiss", 0.9f)
            say(L.tr("सामने सांप! ब्रेक लगाइए, गति 40 किमी प्रति घंटा से नीचे कीजिए.", "Snake ahead! Brake and slow below 40 km per hour."))
        }
        if (snakeDeadline != 0L && SystemClock.uptimeMillis() >= snakeDeadline) {
            snakeDeadline = 0L
            snakes++
            nextSnake = pos + 80f + Random.nextFloat() * 60f
            if (kmh <= 40f) {
                snakesAvoided++
                say(L.tr("सांप से बचे, शाबाश!", "You avoided the snake, well done!"), false)
            } else {
                damage++
                kmh = kmh * 0.5f
                Sfx.play("train_jerk3", 0.8f)
                say(L.tr("सांप ने डस लिया! गति आधी हो गई.", "The snake bit! Your speed was halved."))
            }
        }

        // कमज़ोर पुल: पार करने पर गाड़ी आगे बढ़ती है; तेज़ गति हो तो उतरते ही पुल टूट जाता है, गाड़ी वापस नहीं आती
        if (!bridgeDone) {
            if (!bridgeWarned && pos >= BRIDGE_M - 150f) {
                bridgeWarned = true
                say(L.tr("आगे $BRIDGE_NAME है. उस पर ${bridgeLimit().toInt()} किमी प्रति घंटा से धीमे चलिए.", "Ahead is the $BRIDGE_NAME. Stay below ${bridgeLimit().toInt()} km per hour on it."), false)
            }
            if (pos >= BRIDGE_M && pos <= BRIDGE_M + 40f) {
                bridgeMax = max(bridgeMax, kmh)
                if (!creaked && kmh > bridgeLimit()) {
                    creaked = true
                    Sfx.play("road_bridge_creak", 0.9f)
                }
            }
            if (pos > BRIDGE_M + 40f) {
                bridgeDone = true
                if (bridgeMax > bridgeLimit()) {
                    Sfx.play("road_bridge_break", 1f)
                    say(L.tr("$BRIDGE_NAME पार हो गया, पर तेज़ गति से उतरते ही पुल टूट गया! आप आगे निकल चुके हैं, पीछे लौटना नहीं है.", "You crossed the $BRIDGE_NAME, but it collapsed behind you under your speed! You are ahead and cannot go back."))
                } else {
                    coinsGot += 50
                    Sfx.play("ui_power_up", 0.8f)
                    say(L.tr("$BRIDGE_NAME धीमे पार हुआ और सुरक्षित रहा. पचास बोनस सिक्के.", "You crossed the $BRIDGE_NAME slowly and it stayed safe. Fifty bonus coins."))
                }
            }
        }

        // सिग्नल का खंभा: 10 मीटर के भीतर धीमी गति पर ब्रेक
        if (!signalDone) {
            if (pos >= SIGNAL_M - 10f && pos <= SIGNAL_M + 10f) {
                signalWindowMin = if (signalWindowMin < 0f) kmh else min(signalWindowMin, kmh)
            }
            if (pos > SIGNAL_M + 10f) {
                signalDone = true
                if (signalWindowMin in 0f..15f) {
                    gems += 3
                    fuel = min(100f, fuel + 15f)
                    say(L.tr("सिग्नल पर सही ब्रेक, तीन रत्न और ईंधन मिला", "Correct braking at the signal. Three gems and fuel earned."))
                } else {
                    say(L.tr("सिग्नल के पास सही ब्रेक नहीं लगा, रत्न नहीं मिले", "No correct braking at the signal, no gems."))
                }
            }
        }

        if (pos >= ROAD_M) {
            done = true
            pos = ROAD_M
            kmh = 0f
            Sfx.play("win", 0.9f)
            endRun()
            say(L.tr("फ़िनिश लाइन पार! सिक्के $coinsGot, रत्न $gems, नुकसान $damage, सांप से बचे $snakesAvoided.", "Finish line crossed! Coins $coinsGot, gems $gems, damage $damage, snakes avoided $snakesAvoided."))
        }
    }

    private fun refresh() {
        status.text = statusText()
        if (engine != 0) Sfx.tune(engine, 0.1f + 0.4f * (kmh / MAX_KMH), 0.6f + 1.2f * (kmh / MAX_KMH))
        if (done) { Sfx.stop(engine); engine = 0 }
    }

    override fun onDestroy() {
        endRun()
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        Sfx.stop(engine)
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
