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

    fun init(context: Context) {
        if (pool != null) return
        val app = context.applicationContext
        val p = SoundPool.Builder()
            .setMaxStreams(8)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .build()
        ids["coin_hit"] = p.load(app, R.raw.coin_hit, 1)
        ids["striker_hit"] = p.load(app, R.raw.striker_hit, 1)
        ids["wall_hit"] = p.load(app, R.raw.wall_hit, 1)
        ids["pocket"] = p.load(app, R.raw.pocket, 1)
        ids["queen_pocket"] = p.load(app, R.raw.queen_pocket, 1)
        ids["queen_cover"] = p.load(app, R.raw.queen_cover, 1)
        ids["win"] = p.load(app, R.raw.win, 1)
        ids["coin_return"] = p.load(app, R.raw.coin_return, 1)
        ids["turn_change"] = p.load(app, R.raw.turn_change, 1)
        pool = p
    }

    fun play(name: String, volume: Float = 1f) {
        val id = ids[name] ?: return
        try {
            pool?.play(id, volume, volume, 1, 0, 1f)
        } catch (e: Exception) {
        }
    }
}
