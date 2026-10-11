package com.blindindiantech.blindcarrom

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.SoundPool
import kotlin.math.PI
import kotlin.math.sin

data class Tone(val freq: Double, val ms: Int, val vol: Float = 1f)

object SoundHelper {
    private const val RATE = 22050

    fun play(vararg tones: Tone) {
        Thread {
            for (t in tones) playOne(t)
        }.start()
    }

    private fun playOne(t: Tone) {
        try {
            val n = RATE * t.ms / 1000
            val buf = ShortArray(n)
            val fade = RATE / 200
            for (i in 0 until n) {
                var env = 1.0
                if (i < fade) env = i.toDouble() / fade
                if (i > n - fade) env = (n - i).toDouble() / fade
                val v = sin(2 * PI * t.freq * i / RATE) * env * t.vol * 0.8
                buf[i] = (v * Short.MAX_VALUE).toInt().toShort()
            }
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(n * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
            track.write(buf, 0, n)
            track.play()
            Thread.sleep(t.ms.toLong() + 40)
            track.release()
        } catch (e: Exception) {
        }
    }
}


/** res/raw की आवाज़ें चलाने के लिए. */
object Sfx {
    private var pool: SoundPool? = null
    private val ids = HashMap<String, Int>()

    private val names = listOf(
        "coin_hit", "striker_hit", "wall_hit", "pocket", "queen_pocket", "queen_cover",
        "win", "coin_return", "turn_change", "startup",
        "ui_ai", "ui_local", "ui_support", "ui_rules", "ui_back", "ui_start",
        "ui_striker_left", "ui_striker_right", "ui_aim_left", "ui_aim_right",
        "ui_power_up", "ui_power_down", "ui_info", "ui_shoot", "ui_score", "ui_exit",
        "ui_straight", "ui_center", "ui_fine", "ui_next_coin", "ui_skip", "ui_fx"
    )

    fun init(context: Context) {
        if (pool != null) return
        val app = context.applicationContext
        val p = SoundPool.Builder()
            .setMaxStreams(10)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .build()
        for (n in names) {
            val res = app.resources.getIdentifier(n, "raw", app.packageName)
            if (res != 0) ids[n] = p.load(app, res, 1)
        }
        pool = p
    }

    fun play(name: String, volume: Float = 1f) = playPan(name, volume, volume)

    /** बाएँ और दाएँ कान की आवाज़ अलग-अलग रखने के लिए. */
    fun playPan(name: String, left: Float, right: Float) {
        val id = ids[name] ?: return
        try {
            pool?.play(id, left, right, 1, 0, 1f)
        } catch (e: Exception) {
        }
    }
}
