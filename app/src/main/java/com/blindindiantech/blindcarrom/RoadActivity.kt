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
        buildScreen()
        lastTick = SystemClock.uptimeMillis()
        engine = Sfx.playLoopRate("train_motor", 0f, 0.5f)
        handler.postDelayed(ticker, 100)
        say(L.tr(
            "पहाड़ी सफ़र. आप भारी हॉलर ट्रक चलाते हैं. दो किलोमीटर का रास्ता है. गैस और ब्रेक के बटन दबाकर चलाइए, नाक ऊपर या नीचे करके संतुलन रखिए. कमज़ोर पुल पर 20 किमी प्रति घंटा से धीमे चलिए. सिग्नल के खंभे के पास सही ब्रेक लगाइए.",
            "Hill trail. You drive a heavy hauler truck over two kilometres. Use the gas and brake buttons, and keep the nose up or down to stay balanced. On the weak bridge stay below 20 km per hour. Brake properly near the signal marker."
        ))
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
        button(L.tr("मुख्य मेनू पर वापस", "Back to main menu"), "back") { finish() }
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
            "दूरी ${pos.toInt()} मीटर, गति ${kmh.toInt()} किलोमीटर प्रति घंटा, ईंधन ${fuel.toInt()} प्रतिशत, $bal, सिक्के $coinsGot, रत्न $gems, नुकसान $damage.",
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
            if (destroyed || done) return
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
        if (gas && fuel > 0f) kmh += (30f * (1f - kmh / MAX_KMH) + 4f) * dt
        if (brakeOn) kmh -= 60f * dt
        kmh -= (slope() * 14f + 2f + kmh / MAX_KMH * 12f) * dt
        kmh = kmh.coerceIn(0f, MAX_KMH)
        if (kmh > 0f) fuel = max(0f, fuel - kmh * 0.004f * dt)
        if (fuel <= 0f && !fuelWarned) { fuelWarned = true; say(L.tr("ईंधन ख़त्म!", "Out of fuel!")) }
        pos += kmh / 3.6f * dt

        // संतुलन: चढ़ाई पर नाक नीचे झुकती है, और सड़क हिलाती है
        tilt += (slope() * 25f + (Random.nextFloat() - 0.5f) * 10f) * dt
        if (pos >= SUMMIT_M && pos - lastBump > 150f) {
            lastBump = pos
            tilt += (Random.nextFloat() - 0.5f) * 80f
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

        // कमज़ोर पुल: 1200 से 1240 मीटर के बीच 20 किमी/घंटा से तेज़ जाने पर पुल टूट जाता है
        if (!bridgeDone && pos >= BRIDGE_M && pos <= BRIDGE_M + 40f && kmh > 20f) {
            pos = BRIDGE_M - 150f
            crash(L.tr("कमज़ोर पुल तेज़ गति से टूट गया! गाड़ी वापस भेजी गई, इस बार धीमे पार कीजिए.", "The weak bridge broke under the speed! The truck was sent back. Cross slowly this time."))
            return
        }
        if (!bridgeDone && pos > BRIDGE_M + 40f) {
            bridgeDone = true
            say(L.tr("कमज़ोर पुल धीमी गति से पार हो गया.", "You crossed the weak bridge slowly."), false)
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
            say(L.tr("फ़िनिश लाइन पार! सिक्के $coinsGot, रत्न $gems, नुकसान $damage.", "Finish line crossed! Coins $coinsGot, gems $gems, damage $damage."))
        }
    }

    private fun refresh() {
        status.text = statusText()
        if (engine != 0) Sfx.tune(engine, 0.1f + 0.4f * (kmh / MAX_KMH), 0.6f + 1.2f * (kmh / MAX_KMH))
        if (done) { Sfx.stop(engine); engine = 0 }
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        Sfx.stop(engine)
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
