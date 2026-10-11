package com.blindindiantech.blindcarrom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

class GameView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) :
    View(context, attrs) {

    val world = World()
    var strikerX = 500f
    var aimAngle = 0f
    var power = 5
    var shooting = false
    var fine = false
    var onShotFinished: ((List<Int>, Boolean) -> Unit)? = null

    private var last = 0L

    private fun fill(c: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = c }

    private val boardPaint = fill(Color.rgb(222, 184, 120))
    private val pocketPaint = fill(Color.BLACK)
    private val blackPaint = fill(Color.rgb(40, 40, 40))
    private val whitePaint = fill(Color.rgb(250, 245, 235))
    private val queenPaint = fill(Color.rgb(200, 30, 50))
    private val strikerPaint = fill(Color.rgb(30, 90, 200))
    private val outlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = Color.BLACK
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(120, 80, 40)
        strokeWidth = 4f
    }
    private val aimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.RED
        strokeWidth = 5f
    }

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val s = min(width, height) / 1000f
        val ox = (width - 1000f * s) / 2f
        val oy = (height - 1000f * s) / 2f
        canvas.save()
        canvas.translate(ox, oy)
        canvas.scale(s, s)
        canvas.drawRect(0f, 0f, 1000f, 1000f, boardPaint)
        for (p in World.POCKETS) {
            canvas.drawCircle(p[0], p[1], World.POCKET_R, pocketPaint)
        }
        canvas.drawLine(150f, World.BASE_Y, 850f, World.BASE_Y, linePaint)
        for (c in world.coins) {
            if (!c.alive) continue
            val paint = when (c.type) {
                0 -> blackPaint
                1 -> whitePaint
                2 -> queenPaint
                else -> strikerPaint
            }
            canvas.drawCircle(c.x, c.y, c.radius, paint)
            canvas.drawCircle(c.x, c.y, c.radius, outlinePaint)
        }
        if (!shooting && world.striker.alive) {
            val a = Math.toRadians(aimAngle.toDouble())
            val sx = world.striker.x
            val sy = world.striker.y
            canvas.drawLine(sx, sy, sx + sin(a).toFloat() * 400f, sy - cos(a).toFloat() * 400f, aimPaint)
        }
        canvas.restore()
    }

    private fun aimStep() = if (fine) 1f else 5f
    private fun strikerStep() = if (fine) 10f else 50f

    fun moveStriker(dir: Int) {
        if (shooting) return
        strikerX = (strikerX + dir * strikerStep()).coerceIn(150f, 850f)
        world.placeStriker(strikerX)
        invalidate()
    }

    fun changeAim(dir: Int) {
        if (shooting) return
        aimAngle = (aimAngle + dir * aimStep()).coerceIn(-75f, 75f)
        invalidate()
    }

    fun aimStraight() {
        if (shooting) return
        aimAngle = 0f
        invalidate()
    }

    fun strikerCenter() {
        if (shooting) return
        strikerX = 500f
        world.placeStriker(strikerX)
        invalidate()
    }

    /** बारीक मोड चालू या बंद करता है. नया हाल लौटाता है. */
    fun toggleFine(): Boolean {
        if (shooting) return fine
        fine = !fine
        if (!fine) {
            strikerX = (((strikerX - 150f) / 50f).roundToInt() * 50f + 150f).coerceIn(150f, 850f)
            world.placeStriker(strikerX)
            aimAngle = ((aimAngle / 5f).roundToInt() * 5f).coerceIn(-75f, 75f)
        }
        invalidate()
        return fine
    }

    /** निशाने को सामने की अगली गोटी की सीध में घुमाता है (बाएँ से दाएँ). */
    fun aimNextCoin(): Coin? {
        if (shooting) return null
        val sx = world.striker.x
        val sy = world.striker.y
        val list = ArrayList<Pair<Float, Coin>>()
        for (c in world.coins) {
            if (!c.alive || c.type == 3) continue
            val dx = c.x - sx
            val dy = sy - c.y
            if (dy <= 0f) continue
            val ang = Math.toDegrees(Math.atan2(dx.toDouble(), dy.toDouble())).toFloat()
            if (ang < -75f || ang > 75f) continue
            list.add(Pair(ang, c))
        }
        if (list.isEmpty()) return null
        list.sortBy { it.first }
        val next = list.firstOrNull { it.first > aimAngle + 0.5f } ?: list[0]
        aimAngle = next.first
        invalidate()
        return next.second
    }

    fun changePower(dir: Int) {
        if (shooting) return
        power = (power + dir).coerceIn(1, 10)
    }

    fun setAim(x: Float, angle: Float, p: Int) {
        strikerX = x
        aimAngle = angle
        power = p
        world.placeStriker(x)
        invalidate()
    }

    fun positionIndex(): Int = ((strikerX - 150f) / 50f).roundToInt() + 1

    fun shoot() {
        if (shooting) return
        world.shoot(aimAngle, power)
        shooting = true
        last = System.nanoTime()
        postOnAnimation(tick)
    }

    private val tick = object : Runnable {
        override fun run() {
            val now = System.nanoTime()
            var dt = (now - last) / 1_000_000_000f
            last = now
            if (dt > 0.05f) dt = 0.05f
            var rem = dt
            while (rem > 0f) {
                val s = min(rem, 1f / 120f)
                world.step(s)
                rem -= s
            }
            if (!world.moving()) {
                finishShot()
            } else {
                invalidate()
                postOnAnimation(this)
            }
        }
    }

    private fun finishShot() {
        shooting = false
        val res = ArrayList(world.pocketed)
        val foul = world.foul
        strikerX = 500f
        aimAngle = 0f
        power = 5
        world.placeStriker(strikerX)
        invalidate()
        onShotFinished?.invoke(res, foul)
    }

    private val pocketNames: Array<String>
        get() = if (L.isHindi()) arrayOf("ऊपर बाएँ", "ऊपर दाएँ", "नीचे बाएँ", "नीचे दाएँ")
        else arrayOf("top left", "top right", "bottom left", "bottom right")

    fun coinName(t: Int) = when (t) {
        0 -> L.tr("काली गोटी", "black coin")
        1 -> L.tr("सफ़ेद गोटी", "white coin")
        else -> L.tr("रानी", "the queen")
    }

    private fun distWord(d: Float) = when {
        d < 120f -> L.tr("बहुत पास", "very close")
        d < 350f -> L.tr("मध्यम दूरी पर", "at medium distance")
        else -> L.tr("दूर", "far")
    }

    fun aimWord(): String = when {
        aimAngle == 0f -> L.tr("सीधा", "straight")
        aimAngle > 0f -> L.tr("दाएँ ${aimAngle.toInt()} डिग्री", "${aimAngle.toInt()} degrees right")
        else -> L.tr("बाएँ ${(-aimAngle).toInt()} डिग्री", "${(-aimAngle).toInt()} degrees left")
    }

    fun strikerWord(): String {
        if (!fine) {
            val idx = positionIndex()
            return if (idx == 8) L.tr("स्थिति आठ, बीच में", "position eight, centre")
            else L.tr("स्थिति $idx", "position $idx")
        }
        val off = (strikerX - 500f).roundToInt()
        return when {
            off == 0 -> L.tr("बीच में", "at the centre")
            off < 0 -> L.tr("बीच से ${-off} इकाई बाएँ", "${-off} units left of centre")
            else -> L.tr("बीच से $off इकाई दाएँ", "$off units right of centre")
        }
    }

    fun brief(): String {
        val h = world.firstHit(aimAngle) ?: return L.tr("सामने कोई गोटी नहीं", "No coin ahead")
        var s = L.tr(
            "सामने ${coinName(h.coin.type)}, ${distWord(h.dist)}",
            "Ahead: ${coinName(h.coin.type)}, ${distWord(h.dist)}"
        )
        if (h.pocket >= 0) s += L.tr(", पॉकेट की सीध में", ", in line with a pocket")
        return s
    }

    fun detail(): String {
        val h = world.firstHit(aimAngle)
        var s = L.tr(
            "स्ट्राइकर ${strikerWord()}. निशाना ${aimWord()}. ताकत $power. ${brief()}.",
            "Striker ${strikerWord()}. Aim ${aimWord()}. Power $power. ${brief()}."
        )
        if (h != null) {
            s += if (h.pocket >= 0) {
                L.tr(
                    " यह गोटी ${pocketNames[h.pocket]} पॉकेट में जा सकती है.",
                    " This coin can go into the ${pocketNames[h.pocket]} pocket."
                )
            } else {
                L.tr(
                    " इस शॉट से गोटी के पॉकेट में जाने की संभावना कम है.",
                    " This shot is unlikely to pocket the coin."
                )
            }
        }
        return s
    }
}
