package com.blindindiantech.blindcarrom

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import org.json.JSONArray

class MainActivity : AppCompatActivity() {

    private lateinit var splash: View
    private lateinit var menu: View
    private lateinit var local: View
    private lateinit var support: View
    private lateinit var settings: View
    private lateinit var more: View
    private lateinit var notifsPanel: View
    private lateinit var panels: List<View>
    private var notifList: JSONArray? = null
    private var announced = false
    private val prefs get() = getSharedPreferences("blindcarrom", MODE_PRIVATE)
    private var current: View? = null
    private var icf = true
    private val handler = Handler(Looper.getMainLooper())
    private val toMenu = Runnable { showPanel(menu, R.id.titleMenu) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        Sfx.init(this)
        Net.init(this)
        splash = findViewById(R.id.panelSplash)
        menu = findViewById(R.id.panelMenu)
        local = findViewById(R.id.panelLocal)
        support = findViewById(R.id.panelSupport)
        settings = findViewById(R.id.panelSettings)
        more = findViewById(R.id.panelMore)
        notifsPanel = findViewById(R.id.panelNotifs)
        panels = listOf(splash, menu, local, support, settings, more, notifsPanel)
        refreshIdentity()
        Net.refreshHome(this) { list ->
            if (!isDestroyed) {
                notifList = list
                updateNotifButton()
                refreshIdentity()
                if (current === notifsPanel) renderNotifs()
                announceNew()
            }
        }
        findViewById<Button>(R.id.btnMore).setOnClickListener {
            Fx.press(this, "settings")
            showPanel(more, R.id.titleMore)
        }
        findViewById<Button>(R.id.btnBackMore).setOnClickListener {
            Fx.press(this, "back")
            showPanel(menu, R.id.titleMenu)
        }
        findViewById<Button>(R.id.btnNotifs).setOnClickListener {
            Fx.press(this, "info")
            showNotifs()
        }
        findViewById<Button>(R.id.btnBackNotifs).setOnClickListener {
            Fx.press(this, "back")
            showPanel(menu, R.id.titleMenu)
        }

        findViewById<Button>(R.id.btnSkip).setOnClickListener {
            Fx.press(this, "skip")
            handler.removeCallbacks(toMenu)
            showPanel(menu, R.id.titleMenu)
        }
        refreshSettings()
        findViewById<Button>(R.id.btnOnline).setOnClickListener {
            Fx.press(this, "local")
            val i = Intent(this, OnlineActivity::class.java)
            i.putExtra("rules", if (icf) "icf" else "simple")
            startActivity(i)
        }
        findViewById<Button>(R.id.btnTutorial).setOnClickListener {
            Fx.press(this, "tutorial")
            startActivity(Intent(this, TutorialActivity::class.java))
        }
        findViewById<Button>(R.id.btnSettings).setOnClickListener {
            Fx.press(this, "settings")
            showPanel(settings, R.id.titleSettings)
        }
        findViewById<Button>(R.id.btnSound).setOnClickListener { v ->
            val on = Fx.toggleSound(this)
            if (on) Fx.press(this, "fx")
            refreshSettings()
            v.announceForAccessibility(soundText(on))
        }
        findViewById<Button>(R.id.btnVibe).setOnClickListener { v ->
            val on = Fx.toggleVibe(this)
            if (on) Fx.press(this, "fx")
            refreshSettings()
            v.announceForAccessibility(vibeText(on))
        }
        findViewById<Button>(R.id.btnLangEn).setOnClickListener { setLanguage("en") }
        findViewById<Button>(R.id.btnLangHi).setOnClickListener { setLanguage("hi") }
        findViewById<Button>(R.id.btnBackSettings).setOnClickListener {
            Fx.press(this, "back")
            showPanel(more, R.id.titleMore)
        }
        findViewById<Button>(R.id.btnAi).setOnClickListener {
            Fx.press(this, "ai")
            startGame("ai", "", "")
        }
        findViewById<Button>(R.id.btnRules).setOnClickListener { v ->
            Fx.press(this, "rules")
            icf = !icf
            val text = getString(if (icf) R.string.rules_icf else R.string.rules_simple)
            (v as Button).text = text
            v.announceForAccessibility(text)
        }
        findViewById<Button>(R.id.btnLocal).setOnClickListener {
            Fx.press(this, "local")
            showPanel(local, R.id.titleLocal)
        }
        findViewById<Button>(R.id.btnSupport).setOnClickListener {
            Fx.press(this, "support")
            showPanel(support, R.id.titleSupport)
        }
        findViewById<Button>(R.id.btnStartLocal).setOnClickListener {
            Fx.press(this, "start")
            val p1 = findViewById<EditText>(R.id.etP1).text.toString().trim()
            val p2 = findViewById<EditText>(R.id.etP2).text.toString().trim()
            startGame("local", p1, p2)
        }
        findViewById<Button>(R.id.btnBackLocal).setOnClickListener {
            Fx.press(this, "back")
            showPanel(menu, R.id.titleMenu)
        }
        findViewById<Button>(R.id.btnBackSupport).setOnClickListener {
            Fx.press(this, "back")
            showPanel(more, R.id.titleMore)
        }
        findViewById<TextView>(R.id.emailText).setOnClickListener {
            try {
                val i = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:bits.headquarter505@gmail.com"))
                startActivity(i)
            } catch (e: ActivityNotFoundException) {
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (current === settings || current === support) {
                    showPanel(more, R.id.titleMore)
                } else if (current === local || current === more || current === notifsPanel) {
                    showPanel(menu, R.id.titleMenu)
                } else {
                    finish()
                }
            }
        })

        val saved = savedInstanceState?.getString("panel")
        if (saved != null) {
            when (saved) {
                "settings" -> showPanel(settings, R.id.titleSettings)
                "local" -> showPanel(local, R.id.titleLocal)
                "support" -> showPanel(support, R.id.titleSupport)
                "more" -> showPanel(more, R.id.titleMore)
                "notifs" -> showNotifs()
                else -> showPanel(menu, R.id.titleMenu)
            }
        } else {
            showPanel(splash, R.id.titleSplash)
            // शुरुआती धुन
            handler.postDelayed({ Sfx.play("startup") }, 400)
            handler.postDelayed(toMenu, 4600)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(
            "panel",
            when {
                current === settings -> "settings"
                current === local -> "local"
                current === support -> "support"
                current === more -> "more"
                current === notifsPanel -> "notifs"
                current === splash -> "menu"
                else -> "menu"
            }
        )
    }

    private fun soundText(on: Boolean) =
        if (on) L.tr("आवाज़: चालू. बंद करने के लिए दबाएँ", "Sound: on. Press to turn off")
        else L.tr("आवाज़: बंद. चालू करने के लिए दबाएँ", "Sound: off. Press to turn on")

    private fun vibeText(on: Boolean) =
        if (on) L.tr("कंपन: चालू. बंद करने के लिए दबाएँ", "Vibration: on. Press to turn off")
        else L.tr("कंपन: बंद. चालू करने के लिए दबाएँ", "Vibration: off. Press to turn on")

    private fun refreshSettings() {
        findViewById<Button>(R.id.btnSound).text = soundText(Fx.soundOn)
        findViewById<Button>(R.id.btnVibe).text = vibeText(Fx.vibeOn)
        val hi = L.isHindi()
        findViewById<Button>(R.id.btnLangEn).text =
            if (!hi) "English, " + L.tr("चुनी हुई", "selected") else "English"
        findViewById<Button>(R.id.btnLangHi).text =
            if (hi) "हिन्दी, चुनी हुई" else "हिन्दी (Hindi)"
    }

    private fun setLanguage(code: String) {
        if (L.code() == code) {
            Fx.press(this, "fx")
            return
        }
        Fx.press(this, "fx")
        L.set(this, code)
        // भाषा बदलते ही स्क्रीन अपने आप दोबारा बनेगी
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(code))
    }

    private fun showPanel(panel: View, titleId: Int) {
        for (p in panels) p.visibility = View.GONE
        panel.visibility = View.VISIBLE
        current = panel
        val title = findViewById<TextView>(titleId)
        title.post {
            title.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
        }
        if (panel === menu) {
            refreshIdentity()
            handler.postDelayed({ announceNew() }, 1500)
        }
    }

    // ---------- पहचान की पंक्ति ----------
    private fun refreshIdentity() {
        val tv = findViewById<TextView>(R.id.tvIdentity)
        tv.text = if (Net.token != null && Net.myName.isNotEmpty())
            L.tr("${Net.myName}, लेवल ${Net.level}", "${Net.myName}, level ${Net.level}")
        else L.tr("मेहमान. ऑनलाइन खेलने के लिए लॉगिन कीजिए.", "Guest. Sign in to play online.")
    }

    override fun onResume() {
        super.onResume()
        if (::menu.isInitialized) refreshIdentity()
    }

    // ---------- सूचनाएँ ----------
    private fun newCount(): Int {
        val l = notifList ?: return 0
        val seen = prefs.getLong("notif_seen", 0L)
        var n = 0
        for (i in 0 until l.length()) if (l.getJSONObject(i).optLong("at") > seen) n++
        return n
    }

    private fun updateNotifButton() {
        val n = newCount()
        findViewById<Button>(R.id.btnNotifs).text =
            if (n > 0) L.tr("सूचनाएँ, $n नई", "Notifications, $n new") else getString(R.string.btn_notifs)
    }

    private fun announceNew() {
        val n = newCount()
        if (n > 0 && !announced && current === menu) {
            announced = true
            findViewById<Button>(R.id.btnNotifs).announceForAccessibility(
                L.tr("आपकी $n नई सूचनाएँ हैं.", "You have $n new notifications.")
            )
        }
    }

    private fun timeAgo(at: Long): String {
        val mins = ((System.currentTimeMillis() - at) / 60000L).coerceAtLeast(0L)
        return when {
            mins < 1 -> L.tr("अभी", "just now")
            mins < 60 -> L.tr("$mins मिनट पहले", "$mins minutes ago")
            mins < 1440 -> L.tr("${mins / 60} घंटे पहले", "${mins / 60} hours ago")
            else -> L.tr("${mins / 1440} दिन पहले", "${mins / 1440} days ago")
        }
    }

    private fun addNotifText(parent: LinearLayout, text: String) {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 18f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, (16 * resources.displayMetrics.density).toInt())
        parent.addView(tv)
    }

    private fun showNotifs() {
        showPanel(notifsPanel, R.id.titleNotifs)
        renderNotifs()
        if (notifList == null) {
            Net.refreshHome(this) { list ->
                if (!isDestroyed) {
                    notifList = list
                    updateNotifButton()
                    if (current === notifsPanel) renderNotifs()
                }
            }
        }
    }

    private fun renderNotifs() {
        val list = findViewById<LinearLayout>(R.id.notifList)
        list.removeAllViews()
        val l = notifList
        if (l == null) {
            addNotifText(list, L.tr("सूचनाएँ लाई जा रही हैं. इंटरनेट चालू रखिए, पहली बार कुछ देर लग सकती है.", "Loading notifications. Keep your internet on, the first time can take a while."))
            return
        }
        if (l.length() == 0) addNotifText(list, L.tr("अभी कोई सूचना नहीं है.", "There are no notifications."))
        var newest = prefs.getLong("notif_seen", 0L)
        for (i in 0 until l.length()) {
            val n = l.getJSONObject(i)
            val at = n.optLong("at")
            addNotifText(list, "${n.optString("text")}. ${timeAgo(at)}")
            if (at > newest) newest = at
        }
        // खोलते ही सब पढ़ी हुई गिनी जाती हैं
        prefs.edit().putLong("notif_seen", newest).apply()
        updateNotifButton()
    }

    private fun startGame(mode: String, p1: String, p2: String) {
        val i = Intent(this, GameActivity::class.java)
        i.putExtra("mode", mode)
        i.putExtra("p1", p1)
        i.putExtra("p2", p2)
        i.putExtra("rules", if (icf) "icf" else "simple")
        startActivity(i)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
