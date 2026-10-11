package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

/** हर बटन की अलग आवाज़ और कंपन. सेटिंग: 0 = दोनों, 1 = सिर्फ़ आवाज़, 2 = सिर्फ़ कंपन, 3 = बंद. */
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
        "fx" to longArrayOf(0, 40, 40, 40)
    )

    fun mode(ctx: Context): Int =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY, 0)

    /** अगली सेटिंग पर जाता है और उसका नया मान लौटाता है. */
    fun nextMode(ctx: Context): Int {
        val m = (mode(ctx) + 1) % 4
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY, m).apply()
        return m
    }

    fun modeText(m: Int): String = when (m) {
        0 -> L.tr("आवाज़ और कंपन: दोनों चालू. बदलने के लिए दबाएँ", "Sound and vibration: both on. Press to change")
        1 -> L.tr("आवाज़ और कंपन: सिर्फ़ आवाज़ चालू. बदलने के लिए दबाएँ", "Sound and vibration: sound only. Press to change")
        2 -> L.tr("आवाज़ और कंपन: सिर्फ़ कंपन चालू. बदलने के लिए दबाएँ", "Sound and vibration: vibration only. Press to change")
        else -> L.tr("आवाज़ और कंपन: दोनों बंद. बदलने के लिए दबाएँ", "Sound and vibration: both off. Press to change")
    }

    /** pan: -1 बाएँ कान, 0 दोनों, 1 दाएँ कान. */
    fun press(ctx: Context, key: String, pan: Float = 0f) {
        val m = mode(ctx)
        if (m == 0 || m == 1) {
            val left = if (pan > 0f) 0.25f else 0.7f
            val right = if (pan < 0f) 0.25f else 0.7f
            Sfx.playPan("ui_$key", left, right)
        }
        if (m == 0 || m == 2) vibrate(ctx, patterns[key])
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
