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
    private val names = arrayOf("", "")
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
        names[0] = intent.getStringExtra("p1")?.takeIf { it.isNotBlank() } ?: L.tr("खिलाड़ी 1", "Player 1")
        names[1] = if (vsAi) L.tr("कंप्यूटर", "Computer")
        else intent.getStringExtra("p2")?.takeIf { it.isNotBlank() } ?: L.tr("खिलाड़ी 2", "Player 2")

        tts = TextToSpeech(this, this)

        game.world.listener = { ev -> playEvent(ev) }
        game.onShotFinished = { res, foul -> onShotFinished(res, foul) }

        bind(R.id.btnStrikerLeft, "striker_left", -1f) {
            game.moveStriker(-1)
            scheduleBrief("${game.strikerWord()}. ")
        }
        bind(R.id.btnStrikerRight, "striker_right", 1f) {
            game.moveStriker(1)
            scheduleBrief("${game.strikerWord()}. ")
        }
        bind(R.id.btnAimLeft, "aim_left", -1f) {
            game.changeAim(-1)
            scheduleBrief("${game.aimWord()}. ")
        }
        bind(R.id.btnAimRight, "aim_right", 1f) {
            game.changeAim(1)
            scheduleBrief("${game.aimWord()}. ")
        }
        bind(R.id.btnAimStraight, "straight") {
            game.aimStraight()
            scheduleBrief(L.tr("निशाना सीधा. ", "Aim straight. "))
        }
        bind(R.id.btnStrikerCenter, "center") {
            game.strikerCenter()
            scheduleBrief(L.tr("स्ट्राइकर बीच में. ", "Striker in the centre. "))
        }
        bind(R.id.btnFine, "fine") {
            val fine = game.toggleFine()
            speak(
                if (fine) L.tr(
                    "बारीक मोड चालू. निशाना एक डिग्री और स्ट्राइकर दस इकाई के कदम से चलेगा.",
                    "Fine mode on. Aim moves one degree and the striker ten units at a time."
                ) else L.tr(
                    "बारीक मोड बंद. निशाना पाँच डिग्री और स्ट्राइकर पचास इकाई के कदम से चलेगा.",
                    "Fine mode off. Aim moves five degrees and the striker fifty units at a time."
                )
            )
        }
        bind(R.id.btnNextCoin, "next_coin") {
            val c = game.aimNextCoin()
            if (c == null) {
                speak(L.tr("सामने कोई गोटी नहीं है", "There is no coin ahead"))
            } else {
                scheduleBrief("${game.coinName(c.type)}, ${game.aimWord()}. ")
            }
        }
        bind(R.id.btnPowerUp, "power_up") {
            game.changePower(1)
            speak(L.tr("ताकत ${game.power}", "Power ${game.power}"))
        }
        bind(R.id.btnPowerDown, "power_down") {
            game.changePower(-1)
            speak(L.tr("ताकत ${game.power}", "Power ${game.power}"))
        }
        bind(R.id.btnInfo, "info") { speak(game.detail()) }
        bind(R.id.btnShoot, "shoot") {
            handler.removeCallbacks(briefRunnable)
            game.shoot()
        }
        findViewById<Button>(R.id.btnScore).setOnClickListener {
            Fx.press(this, "score")
            speak(scoreText())
        }
        findViewById<Button>(R.id.btnExit).setOnClickListener {
            Fx.press(this, "exit")
            finish()
        }

        updateStatus()
        handler.postDelayed({
            speak(
                L.tr(
                    "खेल शुरू. ${rules.modeText()} ${rules.startText(names)} स्ट्राइकर बीच में है.",
                    "Game started. ${rules.modeText()} ${rules.startText(names)} The striker is in the centre."
                )
            )
        }, 1200)
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.getDefault())
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.setLanguage(Locale.ENGLISH)
            }
            ttsReady = true
        }
    }

    private fun bind(id: Int, key: String, pan: Float = 0f, action: () -> Unit) {
        findViewById<Button>(id).setOnClickListener {
            if (canAct()) {
                Fx.press(this, key, pan)
                action()
            }
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
        statusView.text = L.tr("${names[cur]} का टर्न | ${scoreText()}", "${names[cur]}'s turn | ${scoreText()}")
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
            statusView.text = L.tr("खेल ख़त्म | ${scoreText()}", "Game over | ${scoreText()}")
            handler.postDelayed({ Sfx.play("win") }, 900)
            speak(msg.toString() + " " + scoreText())
            return
        }
        if (rules.boardOver) {
            rules.nextBoard(game.world)
            game.invalidate()
            msg.append(L.tr(" नया बोर्ड शुरू. ", " New board started. ") + rules.startText(names))
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
                    speak(L.tr("कंप्यूटर शॉट मार रहा है", "The computer is taking its shot"))
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
