package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale
import kotlin.math.max

class GameActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var game: GameView
    private lateinit var statusView: TextView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val names = arrayOf("खिलाड़ी 1", "खिलाड़ी 2")
    private lateinit var rules: Rules
    private val cur: Int get() = rules.cur
    private var vsAi = false
    private var over = false
    private var aiBusy = false
    private var destroyed = false
    private val handler = Handler(Looper.getMainLooper())
    private val lastSound = HashMap<Int, Long>()
    private var prefix = ""
    private val briefRunnable = Runnable {
        speak(prefix + game.brief())
        prefix = ""
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_game)

        game = findViewById(R.id.gameView)
        statusView = findViewById(R.id.statusText)
        Sfx.init(this)
        rules = Rules(intent.getStringExtra("rules") != "simple")

        vsAi = intent.getStringExtra("mode") == "ai"
        names[0] = intent.getStringExtra("p1")?.takeIf { it.isNotBlank() } ?: "खिलाड़ी 1"
        names[1] = if (vsAi) "कंप्यूटर"
        else intent.getStringExtra("p2")?.takeIf { it.isNotBlank() } ?: "खिलाड़ी 2"

        tts = TextToSpeech(this, this)

        game.world.listener = { ev -> playEvent(ev) }
        game.onShotFinished = { res, foul -> onShotFinished(res, foul) }

        bind(R.id.btnStrikerLeft) {
            game.moveStriker(-1)
            scheduleBrief("स्थिति ${game.positionIndex()}. ")
        }
        bind(R.id.btnStrikerRight) {
            game.moveStriker(1)
            scheduleBrief("स्थिति ${game.positionIndex()}. ")
        }
        bind(R.id.btnAimLeft) {
            game.changeAim(-1)
            scheduleBrief("${game.aimWord()}. ")
        }
        bind(R.id.btnAimRight) {
            game.changeAim(1)
            scheduleBrief("${game.aimWord()}. ")
        }
        bind(R.id.btnPowerUp) {
            game.changePower(1)
            speak("ताकत ${game.power}")
        }
        bind(R.id.btnPowerDown) {
            game.changePower(-1)
            speak("ताकत ${game.power}")
        }
        bind(R.id.btnInfo) { speak(game.detail()) }
        bind(R.id.btnShoot) {
            handler.removeCallbacks(briefRunnable)
            game.shoot()
        }
        findViewById<Button>(R.id.btnScore).setOnClickListener { speak(scoreText()) }
        findViewById<Button>(R.id.btnExit).setOnClickListener { finish() }

        updateStatus()
        handler.postDelayed({
            speak(
                "खेल शुरू. ${rules.modeText()} ${rules.startText(names)} स्ट्राइकर बीच में है."
            )
        }, 1200)
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(Locale("hi", "IN"))
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.setLanguage(Locale.ENGLISH)
            }
            ttsReady = true
        }
    }

    private fun bind(id: Int, action: () -> Unit) {
        findViewById<Button>(id).setOnClickListener {
            if (canAct()) action()
        }
    }

    private fun canAct() = !over && !game.shooting && !aiBusy && !(vsAi && cur == 1)

    private fun speak(text: String) {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        if (am.isEnabled && am.isTouchExplorationEnabled) {
            statusView.announceForAccessibility(text)
        } else if (ttsReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "msg")
        }
    }

    private fun scoreText() = rules.scoreText(names, game.world)

    private fun updateStatus() {
        statusView.text = "${names[cur]} का टर्न | ${scoreText()}"
    }

    private fun scheduleBrief(p: String) {
        prefix = p
        beepForAim()
        handler.removeCallbacks(briefRunnable)
        handler.postDelayed(briefRunnable, 600)
    }

    private fun beepForAim() {
        val h = game.world.firstHit(game.aimAngle)
        if (h == null) {
            SoundHelper.play(Tone(300.0, 120, 0.3f))
        } else if (h.dist < 120f) {
            SoundHelper.play(Tone(900.0, 70, 0.5f), Tone(0.0, 60, 0f), Tone(900.0, 70, 0.5f))
        } else if (h.dist < 350f) {
            SoundHelper.play(Tone(700.0, 100, 0.35f))
        } else {
            SoundHelper.play(Tone(700.0, 100, 1f))
        }
    }

    private fun playEvent(ev: Int) {
        val now = SystemClock.uptimeMillis()
        if (now - (lastSound[ev] ?: 0L) < 50) return
        lastSound[ev] = now
        when (ev) {
            World.EV_COIN -> Sfx.play("coin_hit")
            World.EV_STRIKER -> Sfx.play("striker_hit")
            World.EV_WALL -> Sfx.play("wall_hit")
            World.EV_POCKET -> Sfx.play("pocket")
            World.EV_FOUL -> SoundHelper.play(Tone(150.0, 400, 1f))
        }
    }

    private fun onShotFinished(pocketed: List<Int>, foul: Boolean) {
        val msg = StringBuilder(rules.process(game.world, names, pocketed, foul))
        game.invalidate()
        if (pocketed.contains(2)) Sfx.play("queen_pocket")
        if (rules.lastQueenCovered) handler.postDelayed({ Sfx.play("queen_cover") }, 400)
        if (rules.lastReturned > 0) handler.postDelayed({ Sfx.play("coin_return") }, 700)

        if (rules.matchOver) {
            over = true
            statusView.text = "खेल ख़त्म | ${scoreText()}"
            handler.postDelayed({ Sfx.play("win") }, 900)
            speak(msg.toString() + " " + scoreText())
            return
        }
        if (rules.boardOver) {
            rules.nextBoard(game.world)
            game.invalidate()
            msg.append(" नया बोर्ड शुरू. ${rules.startText(names)}")
        }
        updateStatus()
        speak(msg.toString())
        maybeAi()
    }

    private fun maybeAi() {
        if (vsAi && cur == 1 && !over) {
            aiBusy = true
            val snapshot = game.world.copy()
            val ownC = rules.colour[1]
            handler.postDelayed({ startAi(snapshot, ownC) }, 2500)
        }
    }

    private fun startAi(w: World, ownC: Int) {
        Thread {
            var bestScore = -1e9
            var bx = 500f
            var ba = 0f
            var bp = 7
            val rnd = java.util.Random()
            for (x in 200..800 step 100) {
                for (ang in -70..70 step 5) {
                    for (p in intArrayOf(5, 8)) {
                        if (destroyed) return@Thread
                        val sim = w.copy()
                        sim.placeStriker(x.toFloat())
                        sim.shoot(ang.toFloat(), p)
                        sim.simulate()
                        var sc = 0.0
                        for (t in sim.pocketed) {
                            sc += if (t == ownC) 10.0 else if (t == 2) 14.0 else -9.0
                        }
                        if (sim.foul) sc -= 25.0
                        sc += rnd.nextDouble() * 2.0
                        if (sc > bestScore) {
                            bestScore = sc
                            bx = x.toFloat()
                            ba = ang.toFloat()
                            bp = p
                        }
                    }
                }
            }
            runOnUiThread {
                if (!destroyed) {
                    aiBusy = false
                    game.setAim(bx, ba, bp)
                    speak("कंप्यूटर शॉट मार रहा है")
                    game.shoot()
                }
            }
        }.start()
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
