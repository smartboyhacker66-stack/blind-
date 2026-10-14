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
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

class MainActivity : AppCompatActivity() {

    private lateinit var splash: View
    private lateinit var menu: View
    private lateinit var local: View
    private lateinit var support: View
    private lateinit var settings: View
    private var current: View? = null
    private var icf = true
    private val handler = Handler(Looper.getMainLooper())
    private val toMenu = Runnable { showPanel(menu, R.id.titleMenu) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        Sfx.init(this)
        Net.init(this)
        Net.wakeQuietly(this)
        splash = findViewById(R.id.panelSplash)
        menu = findViewById(R.id.panelMenu)
        local = findViewById(R.id.panelLocal)
        support = findViewById(R.id.panelSupport)
        settings = findViewById(R.id.panelSettings)

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
            showPanel(menu, R.id.titleMenu)
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
            showPanel(menu, R.id.titleMenu)
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
                if (current === local || current === support || current === settings) {
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
        splash.visibility = View.GONE
        menu.visibility = View.GONE
        local.visibility = View.GONE
        support.visibility = View.GONE
        panel.visibility = View.VISIBLE
        current = panel
        val title = findViewById<TextView>(titleId)
        title.post {
            title.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
        }
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
