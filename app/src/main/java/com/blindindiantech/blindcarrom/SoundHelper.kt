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
        if (!Fx.soundOn) return
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
        "ui_straight", "ui_center", "ui_fine", "ui_next_coin", "ui_skip", "ui_fx", "ui_settings",
        "ui_coach", "ui_hint", "ui_apply", "ui_tutorial", "ui_demo",
        "net_wait", "net_connected",
        "train_motor", "train_hum", "train_cruise", "train_cruise_hi", "train_accel", "train_decel",
        "train_brake_loop", "train_brake_clunk", "train_brake_hiss", "train_start",
        "train_jerk1", "train_jerk2", "train_jerk3", "train_jerk4", "train_jerk5",
        "train_horn", "train_whistle", "train_bell", "train_door_open", "train_door_close",
        "train_approach", "train_arrive", "train_penalty", "train_phone", "train_pass",
        "train_pa", "train_signal_green", "train_signal_red", "train_points", "train_rush", "train_crowd"
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

    /** लगातार दोहराई जाने वाली आवाज़. लौटाया गया मान stop() में देना है. */
    fun playLoop(name: String, volume: Float = 0.6f): Int {
        if (!Fx.soundOn) return 0
        val id = ids[name] ?: return 0
        return try { pool?.play(id, volume, volume, 1, -1, 1f) ?: 0 } catch (e: Exception) { 0 }
    }

    /** चाल के हिसाब से ऊँचाई बदलकर एक बार चलाना. */
    fun playRate(name: String, volume: Float, rate: Float) {
        if (!Fx.soundOn) return
        val id = ids[name] ?: return
        try { pool?.play(id, volume, volume, 1, 0, rate.coerceIn(0.5f, 2f)) } catch (e: Exception) { }
    }

    fun playLoopRate(name: String, volume: Float, rate: Float): Int {
        if (!Fx.soundOn) return 0
        val id = ids[name] ?: return 0
        return try { pool?.play(id, volume, volume, 1, -1, rate.coerceIn(0.5f, 2f)) ?: 0 } catch (e: Exception) { 0 }
    }

    fun playLR(name: String, left: Float, right: Float, rate: Float): Int {
        if (!Fx.soundOn) return 0
        val id = ids[name] ?: return 0
        return try { pool?.play(id, left, right, 1, 0, rate.coerceIn(0.5f, 2f)) ?: 0 } catch (e: Exception) { 0 }
    }

    fun tuneLR(streamId: Int, left: Float, right: Float, rate: Float) {
        if (streamId == 0) return
        try {
            pool?.setVolume(streamId, left, right)
            pool?.setRate(streamId, rate.coerceIn(0.5f, 2f))
        } catch (e: Exception) { }
    }

    fun tune(streamId: Int, volume: Float, rate: Float) {
        if (streamId == 0) return
        try {
            pool?.setVolume(streamId, volume, volume)
            pool?.setRate(streamId, rate.coerceIn(0.5f, 2f))
        } catch (e: Exception) { }
    }

    fun stop(streamId: Int) {
        if (streamId != 0) try { pool?.stop(streamId) } catch (e: Exception) { }
    }

    /** बाएँ और दाएँ कान की आवाज़ अलग-अलग रखने के लिए. */
    fun playPan(name: String, left: Float, right: Float) {
        if (!Fx.soundOn) return
        val id = ids[name] ?: return
        try {
            pool?.play(id, left, right, 1, 0, 1f)
        } catch (e: Exception) {
        }
    }
}
