package com.blindindiantech.blindcarrom

import android.accessibilityservice.AccessibilityServiceInfo
import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.accessibility.AccessibilityManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

/**
 * Base for the games that live in shared/ web pages (Aeroplane Simulator, Titanic).
 * Speech: when TalkBack (or another spoken-feedback service) is on, the page's live region is read by
 * the screen reader and the built-in TTS stays silent, so nothing is spoken twice. Otherwise the
 * page speaks through Android TTS. TTS start/stop is reported to the page so its sound effects duck.
 */
abstract class WebGameActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    protected lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    protected abstract fun pageUrl(): String

    protected fun screenReaderOn(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
        if (!am.isEnabled) return false
        return am.isTouchExplorationEnabled ||
            am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_SPOKEN).isNotEmpty()
    }

    protected fun baseQuery(): String {
        val sound = if (Fx.soundOn) 1 else 0
        val sr = if (screenReaderOn()) 1 else 0
        return "lang=${L.code()}&sound=$sound&voice=0&host=android&sr=$sr"
    }

    inner class Bridge {
        @JavascriptInterface
        fun speak(text: String, flush: Boolean) {
            if (!ttsReady || screenReaderOn()) return
            tts?.speak(
                text,
                if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD,
                null,
                "u" + System.nanoTime()
            )
        }

        @JavascriptInterface
        fun back() {
            runOnUiThread { finish() }
        }

        @JavascriptInterface
        fun walletBalance(): Int = Wallet.local(this@WebGameActivity)

        /** Only the two amounts Titanic is allowed to move: +1000 reward, -100 penalty. */
        @JavascriptInterface
        fun walletApply(kind: String, amount: Int): Int {
            val allowed = (kind == "reward" && amount == 1000) || (kind == "fine" && amount == 100)
            if (allowed) Wallet.apply(this@WebGameActivity, kind, amount)
            return Wallet.local(this@WebGameActivity)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this, this)
        web = WebView(this)
        web.setBackgroundColor(0xFF101418.toInt())
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.addJavascriptInterface(Bridge(), "AndroidHub")
        setContentView(web)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@WebGameActivity, "back")
                finish()
            }
        })
        web.loadUrl(pageUrl())
    }

    private fun reportSpeech(on: Boolean) {
        runOnUiThread {
            if (!isDestroyed) web.evaluateJavascript("window.__nativeSpeech&&window.__nativeSpeech($on)", null)
        }
    }

    override fun onInit(code: Int) {
        if (code != TextToSpeech.SUCCESS) return
        val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale.ENGLISH)
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = reportSpeech(true)
            override fun onDone(utteranceId: String?) = reportSpeech(false)

            @Suppress("OVERRIDE_DEPRECATION")
            override fun onError(utteranceId: String?) = reportSpeech(false)
        })
        ttsReady = true
    }

    override fun onPause() {
        web.onPause()
        tts?.stop()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
