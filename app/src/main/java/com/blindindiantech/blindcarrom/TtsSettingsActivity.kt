package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** आवाज़ सेटिंग: घोषणा और खेल की आवाज़ के लिए अलग TTS इंजन चुनें. पहली बार कोई सेटअप स्क्रीन नहीं. */
class TtsSettingsActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences(TtsRouter.PREFS, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        root.setPadding(pad, pad, pad, pad)
        val engines = TtsRouter.installedEngines(this)
        addTitle(root, L.tr("आवाज़ की सेटिंग", "Voice settings"))
        addInfo(root, L.tr("यहाँ दो अलग आवाज़ें चुनी जा सकती हैं: घोषणाओं के लिए और खेल की बाक़ी आवाज़ों के लिए. फ़ोन पर इंस्टॉल सारे आवाज़ इंजन नीचे दिखते हैं.",
            "Choose two different voices here: one for announcements and one for the rest of the game. All voice engines installed on your phone are listed below."))
        addTitle(root, L.tr("घोषणाओं के लिए", "For announcements"))
        addChoice(root, engines, TtsRouter.KEY_ANN)
        addTitle(root, L.tr("खेल की बाक़ी आवाज़ों के लिए", "For the rest of the game"))
        addChoice(root, engines, TtsRouter.KEY_GAME)
        if (engines.isEmpty()) addInfo(root, L.tr("फ़ोन पर कोई आवाज़ इंजन नहीं मिला. फ़ोन का डिफ़ॉल्ट इस्तेमाल होगा.", "No voice engine was found on the phone. The default will be used."))
        val back = Button(this)
        back.text = L.tr("वापस", "Back")
        back.setOnClickListener { finish() }
        root.addView(back)
        val sv = ScrollView(this)
        sv.addView(root)
        setContentView(sv)
    }

    private fun addTitle(root: LinearLayout, text: String) {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 22f
        tv.isFocusable = true
        tv.setPadding(0, 24, 0, 8)
        root.addView(tv)
        tv.postDelayed({ tv.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 250)
    }

    private fun addInfo(root: LinearLayout, text: String) {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 17f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, 12)
        root.addView(tv)
    }

    private fun addChoice(root: LinearLayout, engines: List<Pair<String, String>>, key: String) {
        val current = prefs.getString(key, "") ?: ""
        val marked = { label: String, name: String -> if (name == current) "✓ $label" else label }
        val def = Button(this)
        def.text = marked(L.tr("फ़ोन का डिफ़ॉल्ट", "Phone default"), "")
        def.minimumHeight = (56 * resources.displayMetrics.density).toInt()
        def.setOnClickListener { choose(key, "") }
        root.addView(def)
        for ((name, label) in engines) {
            val b = Button(this)
            b.text = marked(label, name)
            b.minimumHeight = (56 * resources.displayMetrics.density).toInt()
            b.setOnClickListener { choose(key, name) }
            root.addView(b)
        }
    }

    private fun choose(key: String, name: String) {
        prefs.edit().putString(key, name).apply()
        TtsRouter.shutdownAll()
        recreate()
    }
}
