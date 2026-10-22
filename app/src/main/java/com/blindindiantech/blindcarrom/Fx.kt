package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

/** हर बटन की अलग आवाज़ और कंपन. आवाज़ और कंपन सेटिंग में अलग-अलग चालू या बंद होते हैं. */
object Fx {
    private const val PREFS = "blindcarrom"
    private const val KEY = "fx_mode"

    private val patterns = mapOf(
        "ai" to longArrayOf(0, 40, 40, 60),
        "local" to longArrayOf(0, 30, 30, 30, 30, 50),
        "support" to longArrayOf(0, 80),
        "rules" to longArrayOf(0, 30, 40, 30),
        "back" to longArrayOf(0, 40, 40, 20),
        "start" to longArrayOf(0, 30, 30, 30, 30, 30, 30, 90),
        "striker_left" to longArrayOf(0, 35),
        "striker_right" to longArrayOf(0, 35, 50, 35),
        "aim_left" to longArrayOf(0, 25),
        "aim_right" to longArrayOf(0, 25, 40, 25),
        "power_up" to longArrayOf(0, 20, 30, 40, 30, 60),
        "power_down" to longArrayOf(0, 60, 30, 40, 30, 20),
        "info" to longArrayOf(0, 25, 60, 25),
        "shoot" to longArrayOf(0, 120, 40, 200),
        "score" to longArrayOf(0, 30, 40, 30, 40, 30),
        "exit" to longArrayOf(0, 60, 40, 40, 40, 20),
        "straight" to longArrayOf(0, 100),
        "center" to longArrayOf(0, 40, 60, 40, 60, 40),
        "fine" to longArrayOf(0, 20, 40, 20, 40, 20),
        "next_coin" to longArrayOf(0, 30, 30, 60),
        "skip" to longArrayOf(0, 30),
        "fx" to longArrayOf(0, 40, 40, 40),
        "settings" to longArrayOf(0, 50, 30, 50),
        "coach" to longArrayOf(0, 30, 30, 30, 30, 60),
        "hint" to longArrayOf(0, 40, 50, 40),
        "apply" to longArrayOf(0, 90),
        "tutorial" to longArrayOf(0, 40, 40, 80),
        "demo" to longArrayOf(0, 60, 30, 60)
    )

    var soundOn = true
        private set
    var vibeOn = true
        private set

    var coachOn = false
        private set

    fun load(ctx: Context) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        soundOn = p.getBoolean("fx_sound", true)
        vibeOn = p.getBoolean("fx_vibe", true)
        coachOn = p.getBoolean("coach", false)
    }

    fun toggleCoach(ctx: Context): Boolean {
        coachOn = !coachOn
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("coach", coachOn).apply()
        return coachOn
    }

    fun toggleSound(ctx: Context): Boolean {
        soundOn = !soundOn
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("fx_sound", soundOn).apply()
        return soundOn
    }

    fun toggleVibe(ctx: Context): Boolean {
        vibeOn = !vibeOn
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("fx_vibe", vibeOn).apply()
        return vibeOn
    }

    /** pan: -1 बाएँ कान, 0 दोनों, 1 दाएँ कान. */
    fun press(ctx: Context, key: String, pan: Float = 0f) {
        if (soundOn) {
            val left = if (pan > 0f) 0.25f else 0.7f
            val right = if (pan < 0f) 0.25f else 0.7f
            Sfx.playPan("ui_$key", left, right)
        }
        if (vibeOn) vibrate(ctx, patterns[key])
    }

    /** सिर्फ़ कंपन (जब आवाज़ अलग से चल रही हो). */
    fun buzz(ctx: Context, key: String) {
        if (vibeOn) vibrate(ctx, patterns[key])
    }

    private fun vibrate(ctx: Context, pattern: LongArray?) {
        if (pattern == null) return
        try {
            val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
        }
    }
}
