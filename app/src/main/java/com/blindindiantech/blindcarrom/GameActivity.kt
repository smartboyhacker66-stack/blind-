package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale
import kotlin.math.max

class Shot(
    val x: Float, val angle: Float, val power: Int,
    val own: Int, val opp: Int, val queen: Boolean, val foul: Boolean
)

class GameActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var game: GameView
    private lateinit var statusView: TextView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val names = arrayOf("", "")
    private lateinit var rules: Rules
    private val cur: Int get() = if (online) onlineCur else rules.cur

    // ऑनलाइन मैच की स्थिति
    private var online = false
    private var myIdx = 0
    private var seqSeen = 0
    private var replaying = false
    private var shotPending = false
    private var firstState = true
    private var polling = false
    private var failCount = 0
    private var onlineCur = 0
    private var onlineBoard = 1
    private var onlineMatch25 = true
    private var onlineColour = intArrayOf(1, 0)
    private var onlineScore = intArrayOf(0, 0)
    private var onlineCoins: JSONArray? = null
    private var exitArmedAt = 0L
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (destroyed || !online || over) return
            pollOnce()
            handler.postDelayed(this, if (onlineCur == myIdx) 1500L else 1000L)
        }
    }
    private var vsAi = false
    private var demo = false
    private var hint: Shot? = null
    private var hintBusy = false
    private var speechUntil = 0L
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

        online = intent.getStringExtra("mode") == "online"
        if (online) Net.init(this)
        demo = intent.getStringExtra("mode") == "demo"
        vsAi = intent.getStringExtra("mode") == "ai" || demo
        names[0] = if (demo) "Aditya"
        else intent.getStringExtra("p1")?.takeIf { it.isNotBlank() } ?: L.tr("खिलाड़ी 1", "Player 1")
        names[1] = if (demo) "Momicaa"
        else if (vsAi) L.tr("कंप्यूटर", "Computer")
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
        findViewById<Button>(R.id.btnInfo).setOnClickListener {
            // यह बटन हर समय चलता है: किसी की भी बारी हो, शॉट चल रहा हो या खेल ख़त्म हो चुका हो
            Fx.press(this, "info")
            handler.removeCallbacks(briefRunnable)
            prefix = ""
            speakDetail(game.detail())
        }
        bind(R.id.btnShoot, "shoot") {
            handler.removeCallbacks(briefRunnable)
            if (online) onlineShoot() else game.shoot()
        }
        bind(R.id.btnHint, "hint") { if (online) speak(notOnline()) else coachSuggest(false) }
        bind(R.id.btnApplyHint, "apply") {
            val h = hint
            if (online) {
                speak(notOnline())
            } else if (h == null) {
                speak(L.tr("पहले कोच का सुझाव सुनिए.", "Please hear the coach suggestion first."))
            } else {
                game.setAim(h.x, h.angle, h.power)
                speak(
                    L.tr("सुझाव लागू हो गया. ", "Suggestion applied. ") +
                        "${game.strikerWord()}. ${game.aimWord()}. " +
                        L.tr("ताकत ${game.power}. अब शॉट मारिए.", "Power ${game.power}. Now shoot.")
                )
            }
        }
        findViewById<Button>(R.id.btnCoach).setOnClickListener {
            if (online) { speak(notOnline()); return@setOnClickListener }
            val on = Fx.toggleCoach(this)
            Fx.press(this, "coach")
            speak(
                if (on) L.tr(
                    "सिखाने वाला मोड चालू. हर टर्न पर मैं आपको सुझाव दूँगा.",
                    "Coach mode on. I will give you a suggestion on every turn."
                ) else L.tr("सिखाने वाला मोड बंद.", "Coach mode off.")
            )
        }
        findViewById<Button>(R.id.btnScore).setOnClickListener {
            Fx.press(this, "score")
            speak(scoreText())
        }
        findViewById<Button>(R.id.btnExit).setOnClickListener {
            Fx.press(this, "exit")
            if (online && !over) {
                val now = SystemClock.uptimeMillis()
                if (now - exitArmedAt > 6000L) {
                    exitArmedAt = now
                    speak(L.tr(
                        "बाहर जाने पर आप मैच हार जाएँगे. पक्का बाहर जाना है तो यही बटन छह सेकंड के अंदर दोबारा दबाइए.",
                        "If you leave, you lose the match. To leave, press this button again within six seconds."
                    ))
                    return@setOnClickListener
                }
            }
            if (online) Net.bg({ Net.call("POST", "/api/rooms/leave", JSONObject()) }, { })
            finish()
        }

        if (online) {
            statusView.text = L.tr("मैच से जुड़ रहे हैं", "Joining the match")
            handler.post(pollRunnable)
            return
        }
        updateStatus()
        handler.postDelayed({
            val intro = if (demo) L.tr(
                "यह डेमो मैच है. दो कंप्यूटर खिलाड़ी खेल रहे हैं और मैं हर शॉट के बाद बताऊँगा कि क्या हुआ. " +
                    "असली खेल में आप स्ट्राइकर को बाएँ दाएँ करेंगे, निशाना लगाएँगे, ताकत चुनेंगे और शॉट मारेंगे. ",
                "This is a demo match. Two computer players are playing, and after every shot I will tell you what happened. " +
                    "In a real game you move the striker left and right, set your aim, choose the power and shoot. "
            ) else ""
            speak(
                intro + L.tr(
                    "खेल शुरू. ${rules.modeText()} ${rules.startText(names)} स्ट्राइकर बीच में है.",
                    "Game started. ${rules.modeText()} ${rules.startText(names)} The striker is in the centre."
                )
            )
            afterSpeech()
        }, 1200)
    }

    override fun onInit(code: Int) {
        if (code == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(if (L.isHindi()) Locale("hi", "IN") else Locale.ENGLISH)
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

    private fun canAct() = !over && !game.shooting && !aiBusy && !demo && !(vsAi && cur == 1) &&
        (!online || (!firstState && onlineCur == myIdx && !replaying && !shotPending))

    private fun notOnline() = L.tr("यह सुविधा ऑनलाइन खेल में उपलब्ध नहीं है.", "This feature is not available in online games.")

    private fun speak(text: String) {
        speechUntil = SystemClock.uptimeMillis() + minOf(text.length * 70L, 15000L)
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        if (am.isEnabled && am.isTouchExplorationEnabled) {
            statusView.announceForAccessibility(text)
        } else if (ttsReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "msg")
        }
    }

    /** TalkBack चालू हो तो विवरण स्क्रीन के लेख में रखकर वहीं फ़ोकस ले जाते हैं, ताकि वह पक्का पढ़ा जाए. */
    private fun speakDetail(text: String) {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        if (am.isEnabled && am.isTouchExplorationEnabled) {
            statusView.text = text
            statusView.post {
                statusView.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
            }
        } else {
            speak(text)
        }
    }

    private fun scoreText(): String {
        if (!online) return rules.scoreText(names, game.world)
        val coins = onlineCoins ?: return ""
        val s = StringBuilder()
        if (onlineMatch25) {
            s.append(L.tr(
                "${names[0]} ${onlineScore[0]} अंक, ${names[1]} ${onlineScore[1]} अंक. बोर्ड $onlineBoard. ",
                "${names[0]} ${onlineScore[0]} points, ${names[1]} ${onlineScore[1]} points. Board $onlineBoard. "
            ))
        }
        s.append(OnlineText.remain(coins, onlineColour))
        return s.toString()
    }

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
        afterSpeech()
    }

    /** बोलना ख़त्म होने के बाद कंप्यूटर की बारी या कोच का सुझाव शुरू करता है. */
    private fun afterSpeech() {
        if (over) return
        val wait = maxOf(0L, speechUntil - SystemClock.uptimeMillis())
        if (vsAi && (cur == 1 || demo)) {
            maybeAi(wait)
        } else if (Fx.coachOn && !demo) {
            handler.postDelayed({ if (!over && !game.shooting) coachSuggest(true) }, wait + 600)
        }
    }

    private fun positionWord(x: Float): String {
        val idx = ((x - 150f) / 50f).toInt() + 1
        return if (idx == 8) L.tr("स्थिति आठ, बीच में", "position eight, centre")
        else L.tr("स्थिति $idx", "position $idx")
    }

    private fun angleWord(a: Float): String = when {
        a == 0f -> L.tr("सीधा", "straight")
        a > 0f -> L.tr("दाएँ ${a.toInt()} डिग्री", "${a.toInt()} degrees right")
        else -> L.tr("बाएँ ${(-a).toInt()} डिग्री", "${(-a).toInt()} degrees left")
    }

    private fun hintText(h: Shot): String {
        var s = L.tr(
            "कोच का सुझाव: स्ट्राइकर को ${positionWord(h.x)} पर लाइए, निशाना ${angleWord(h.angle)} कीजिए, " +
                "ताकत ${h.power} रखिए और शॉट मारिए. ",
            "Coach suggestion: put the striker at ${positionWord(h.x)}, aim ${angleWord(h.angle)}, " +
                "set the power to ${h.power} and shoot. "
        )
        s += when {
            h.foul -> L.tr("सावधान, इस शॉट में स्ट्राइकर पॉकेट में जा सकता है. ", "Careful, the striker may go into a pocket on this shot. ")
            h.queen -> L.tr("इससे रानी पॉकेट में जा सकती है. फिर अपनी गोटी डालकर उसे कवर करना होगा. ", "This can pocket the queen. You must then cover her with one of your coins. ")
            h.own > 0 -> L.tr("इससे आपकी गोटी पॉकेट में जा सकती है, और आपको दोबारा टर्न मिलेगा. ", "This can pocket your coin and give you another turn. ")
            h.opp > 0 -> L.tr("सावधान, इससे विरोधी की गोटी जा सकती है. ", "Careful, this may pocket the opponent's coin. ")
            else -> L.tr("कोई गोटी जाने की संभावना कम है, पर अभी यही सबसे अच्छा शॉट है. ", "A coin is unlikely to go in, but this is the best shot right now. ")
        }
        s += L.tr("सुझाव को सीधे लगाने के लिए सुझाव लागू करें बटन दबाइए.", "To set it up directly, press the Apply suggestion button.")
        return s
    }

    private fun coachSuggest(auto: Boolean) {
        if (hintBusy || over) return
        hintBusy = true
        val snapshot = game.world.copy()
        val ownC = rules.colour[cur]
        if (!auto) speak(L.tr("सोच रहा हूँ, कुछ सेकंड रुकिए.", "Thinking, please wait a few seconds."))
        Thread {
            val best = searchBest(snapshot, ownC, false)
            runOnUiThread {
                hintBusy = false
                if (destroyed || best == null) return@runOnUiThread
                hint = best
                if (!game.shooting && !over) speak(hintText(best))
            }
        }.start()
    }

    private fun maybeAi(wait: Long = 0L) {
        if (vsAi && (cur == 1 || demo) && !over) {
            aiBusy = true
            val snapshot = game.world.copy()
            val ownC = rules.colour[cur]
            handler.postDelayed({ startAi(snapshot, ownC) }, maxOf(2500L, wait + 800L))
        }
    }

    private fun searchBest(w: World, ownC: Int, jitter: Boolean): Shot? {
        var best: Shot? = null
        var bestScore = -1e9
        val rnd = java.util.Random()
        for (x in 200..800 step 100) {
            for (ang in -70..70 step 5) {
                for (p in intArrayOf(5, 8)) {
                    if (destroyed) return null
                    val sim = w.copy()
                    sim.placeStriker(x.toFloat())
                    sim.shoot(ang.toFloat(), p)
                    sim.simulate()
                    var own = 0
                    var opp = 0
                    var queen = false
                    for (t in sim.pocketed) {
                        if (t == ownC) own++ else if (t == 2) queen = true else opp++
                    }
                    var sc = own * 10.0 + (if (queen) 14.0 else 0.0) - opp * 9.0
                    if (sim.foul) sc -= 25.0
                    if (jitter) sc += rnd.nextDouble() * 2.0
                    if (sc > bestScore) {
                        bestScore = sc
                        best = Shot(x.toFloat(), ang.toFloat(), p, own, opp, queen, sim.foul)
                    }
                }
            }
        }
        return best
    }

    private fun startAi(w: World, ownC: Int) {
        Thread {
            val best = searchBest(w, ownC, true)
            runOnUiThread {
                if (!destroyed) {
                    aiBusy = false
                    if (best != null) game.setAim(best.x, best.angle, best.power)
                    if (!demo) speak(L.tr("कंप्यूटर शॉट मार रहा है", "The computer is taking its shot"))
                    game.shoot()
                }
            }
        }.start()
    }

    // ================= ऑनलाइन =================

    private fun pollOnce() {
        if (polling) return
        polling = true
        val seq = seqSeen
        Net.bg({ Net.call("GET", "/api/state?seq=$seq") }, { r ->
            polling = false
            if (!destroyed) handleOnlineState(r)
        })
    }

    private fun handleOnlineState(r: Net.Result) {
        if (r.code == 401) {
            speak(L.tr("आप लॉग आउट हो गए हैं.", "You have been signed out."))
            handler.postDelayed({ finish() }, 2000)
            return
        }
        val j = r.json
        if (!r.ok || j == null) {
            failCount++
            if (failCount == 5) speak(L.tr("कनेक्शन में दिक़्क़त है, दोबारा जुड़ रहे हैं.", "Connection problem, trying to reconnect."))
            return
        }
        failCount = 0
        val phase = j.optString("phase")
        if (phase != "playing" && phase != "ended") {
            if (!over) speak(L.tr("मैच ख़त्म हो चुका है.", "The match is over."))
            over = true
            handler.postDelayed({ finish() }, 2500)
            return
        }
        if (replaying) return
        val coins = j.getJSONArray("coins")
        if (firstState) {
            firstState = false
            myIdx = j.getInt("you")
            val pl = j.getJSONArray("players")
            names[0] = pl.getString(0)
            names[1] = pl.getString(1)
            seqSeen = j.getInt("shotSeq")
            readMeta(j)
            onlineCur = j.getInt("cur")
            onlineCoins = coins
            game.applyServerCoins(coins)
            updateStatus()
            val opponent = names[1 - myIdx]
            val mode = if (onlineMatch25) L.tr("असली कैरम नियम, पच्चीस अंक तक का मैच.", "Real carrom rules, a match to twenty five points.")
            else L.tr("सादा खेल, सिर्फ़ एक बोर्ड.", "Simple game, one board only.")
            speak(
                L.tr("ऑनलाइन मैच शुरू. आप $opponent के साथ खेल रहे हैं. ", "The online match has started. You are playing against $opponent. ") +
                    mode + " " + OnlineText.startText(names, onlineColour, onlineCur) + " " +
                    (if (onlineCur == myIdx) L.tr("आपकी बारी है.", "It is your turn.") else "")
            )
            if (j.optString("phase") == "ended") finishOnline(j)
            return
        }
        val shot = j.optJSONObject("lastShot")
        if (shot != null && shot.getInt("seq") > seqSeen) {
            seqSeen = shot.getInt("seq")
            startReplay(shot, j)
        } else {
            readMeta(j)
            onlineCur = j.getInt("cur")
            onlineCoins = coins
            game.applyServerCoins(coins)
            updateStatus()
            if (j.optString("phase") == "ended") finishOnline(j)
        }
    }

    private fun readMeta(j: JSONObject) {
        onlineMatch25 = j.optBoolean("match25", true)
        onlineBoard = j.optInt("board", 1)
        val c = j.getJSONArray("colour")
        onlineColour = intArrayOf(c.getInt(0), c.getInt(1))
        val sc = j.getJSONArray("score")
        onlineScore = intArrayOf(sc.getInt(0), sc.getInt(1))
    }

    private fun startReplay(shot: JSONObject, j: JSONObject) {
        replaying = true
        val by = shot.getInt("by")
        val ev = shot.getJSONArray("ev")
        val coinsAfter = j.getJSONArray("coins")
        val curAfter = j.getInt("cur")
        val ended = j.optString("phase") == "ended"
        val frames = shot.getJSONArray("frames")
        val sounds = shot.getJSONArray("sounds")
        for (i in 0 until sounds.length()) {
            val e = sounds.getJSONArray(i)
            val code = e.getInt(1)
            handler.postDelayed({ if (!destroyed) playEvent(code) }, e.getInt(0) * 1000L / 90L)
        }
        val n = frames.length()
        for (i in 0 until n) {
            val f = frames.getJSONArray(i)
            handler.postDelayed({ if (!destroyed) game.showFrame(f) }, i * 2000L / 90L)
        }
        handler.postDelayed({
            if (!destroyed) {
                readMeta(j)
                game.applyServerCoins(coinsAfter)
                onlineCoins = coinsAfter
                onlineCur = curAfter
                replaying = false
                var covered = false
                var returned = false
                for (i in 0 until ev.length()) {
                    when (ev.getJSONObject(i).getString("t")) {
                        "queenCovered", "queenWithOwn" -> covered = true
                        "shotCoinsReturned", "penaltyReturned", "queenReturned", "queenNotCovered",
                        "owedReturned", "lastCoinBack", "oppLastBack" -> returned = true
                    }
                }
                if (covered) handler.postDelayed({ Sfx.play("queen_cover") }, 300)
                if (returned) handler.postDelayed({ Sfx.play("coin_return") }, 700)
                updateStatus()
                var text = OnlineText.render(ev, names[by], names, onlineColour, coinsAfter)
                if (ended) text += " " + resultText(j)
                speak(text)
                if (ended) finishOnline(j, false)
                else if (onlineCur == myIdx) handler.postDelayed({ Sfx.play("turn_change") }, 400)
            }
        }, n * 2000L / 90L + 150L)
    }

    private fun resultText(j: JSONObject): String {
        val w = j.optInt("winner", -1)
        val reason = j.optString("endedReason", "")
        val mine = w == myIdx
        val head = if (mine) L.tr("बधाई हो, आप जीते!", "Congratulations, you won!") else L.tr("आप हार गए.", "You lost.")
        val why = when (reason) {
            "resign", "left" -> if (mine) L.tr(" विरोधी मैच छोड़कर चले गए.", " Your opponent left the match.") else ""
            "idle" -> if (mine) L.tr(" विरोधी का कनेक्शन टूट गया.", " Your opponent was disconnected.") else L.tr(" आपका कनेक्शन टूट गया था.", " You were disconnected.")
            "timeout" -> if (mine) L.tr(" विरोधी ने बार-बार समय पर शॉट नहीं मारा.", " Your opponent kept missing the time limit.") else L.tr(" आपने बार-बार समय पर शॉट नहीं मारा.", " You kept missing the time limit.")
            else -> ""
        }
        return head + why
    }

    private fun finishOnline(j: JSONObject, announce: Boolean = true) {
        over = true
        handler.removeCallbacks(pollRunnable)
        statusView.text = L.tr("खेल ख़त्म | ${scoreText()}", "Game over | ${scoreText()}")
        if (announce) speak(resultText(j) + " " + scoreText())
        if (j.optInt("winner", -1) == myIdx) handler.postDelayed({ Sfx.play("win") }, 600)
    }

    private fun onlineShoot() {
        shotPending = true
        val body = JSONObject()
            .put("x", game.strikerX.toDouble())
            .put("angle", game.aimAngle.toDouble())
            .put("power", game.power)
        Net.bg({ Net.call("POST", "/api/shoot", body) }, { r ->
            shotPending = false
            if (!destroyed) {
                if (r.ok) {
                    handler.removeCallbacks(pollRunnable)
                    handler.post(pollRunnable)
                } else {
                    speak(
                        when (r.error) {
                            "too_soon" -> L.tr("थोड़ा रुकिए, फिर शॉट मारिए.", "Wait a moment, then shoot.")
                            "not_your_turn" -> L.tr("अभी आपकी बारी नहीं है.", "It is not your turn.")
                            else -> L.tr("शॉट नहीं पहुँचा. दोबारा कोशिश कीजिए.", "The shot did not go through. Please try again.")
                        }
                    )
                }
            }
        })
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
