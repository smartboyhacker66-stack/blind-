package com.blindindiantech.blindcarrom

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * दो अलग TTS इंजन: एक घोषणाओं के लिए ("announce"), दूसरा खेल की बाक़ी आवाज़ों के लिए ("game").
 * एक समय में सिर्फ़ दो इंस्टेंस. इंजन न चुना हो तो फ़ोन का डिफ़ॉल्ट इंजन.
 */
object TtsRouter {
    const val PREFS = "blindcarrom"
    const val KEY_ANN = "tts_announce"
    const val KEY_GAME = "tts_game"

    private class Holder(val engine: String, var tts: TextToSpeech?, var ready: Boolean, var pending: String?)
    private val holders = HashMap<String, Holder>()
    private var app: Context? = null

    fun init(c: Context) { app = c.applicationContext }

    /** फ़ोन पर इंस्टॉल सारे TTS इंजन (नाम, दिखने वाला नाम). */
    fun installedEngines(c: Context): List<Pair<String, String>> {
        var probe: TextToSpeech? = null
        return try {
            probe = TextToSpeech(c.applicationContext, null)
            probe.engines.map { Pair(it.name, it.label) }
        } catch (e: Exception) {
            emptyList()
        } finally {
            try { probe?.shutdown() } catch (e: Exception) { }
        }
    }

    fun chosen(role: String): String {
        val c = app ?: return ""
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(if (role == "announce") KEY_ANN else KEY_GAME, "") ?: ""
    }

    fun speak(role: String, text: String, flush: Boolean = true) {
        val c = app ?: return
        val want = chosen(role)
        val h = holders[role]
        if (h == null || h.engine != want) {
            h?.let { try { it.tts?.shutdown() } catch (e: Exception) { } }
            val nh = Holder(want, null, false, text)
            holders[role] = nh
            nh.tts = if (want.isEmpty()) {
                TextToSpeech(c) { status -> onReady(role, nh, status) }
            } else {
                TextToSpeech(c, { status -> onReady(role, nh, status) }, want)
            }
            return
        }
        if (!h.ready) { h.pending = text; return }
        h.tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, role)
    }

    private fun onReady(role: String, h: Holder, status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        val t = h.tts ?: return
        val loc = if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH
        val r = t.setLanguage(loc)
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) t.setLanguage(Locale.ENGLISH)
        h.ready = true
        h.pending?.let { t.speak(it, TextToSpeech.QUEUE_FLUSH, null, role) }
        h.pending = null
    }

    fun shutdownAll() {
        for (h in holders.values) try { h.tts?.stop(); h.tts?.shutdown() } catch (e: Exception) { }
        holders.clear()
    }
}
