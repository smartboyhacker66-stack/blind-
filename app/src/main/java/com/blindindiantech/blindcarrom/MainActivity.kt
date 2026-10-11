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

class MainActivity : AppCompatActivity() {

    private lateinit var splash: View
    private lateinit var menu: View
    private lateinit var local: View
    private lateinit var support: View
    private var current: View? = null
    private var icf = true
    private val handler = Handler(Looper.getMainLooper())
    private val toMenu = Runnable { showPanel(menu, R.id.titleMenu) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        Sfx.init(this)
        splash = findViewById(R.id.panelSplash)
        menu = findViewById(R.id.panelMenu)
        local = findViewById(R.id.panelLocal)
        support = findViewById(R.id.panelSupport)

        findViewById<Button>(R.id.btnSkip).setOnClickListener {
            Fx.press(this, "skip")
            handler.removeCallbacks(toMenu)
            showPanel(menu, R.id.titleMenu)
        }
        val fxButton = findViewById<Button>(R.id.btnFx)
        fxButton.text = Fx.modeText(Fx.mode(this))
        fxButton.setOnClickListener { v ->
            val m = Fx.nextMode(this)
            val text = Fx.modeText(m)
            (v as Button).text = text
            Fx.press(this, "fx")
            v.announceForAccessibility(text)
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
                if (current === local || current === support) {
                    showPanel(menu, R.id.titleMenu)
                } else {
                    finish()
                }
            }
        })

        showPanel(splash, R.id.titleSplash)
        // शुरुआती "सिस्टम चालू हो रहा है" वाली धुन
        handler.postDelayed({ Sfx.play("startup") }, 400)
        handler.postDelayed(toMenu, 4600)
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
