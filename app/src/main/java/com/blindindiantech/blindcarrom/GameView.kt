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

    fun moveStriker(dir: Int) {
        if (shooting) return
        strikerX = (strikerX + dir * 50f).coerceIn(150f, 850f)
        world.placeStriker(strikerX)
        invalidate()
    }

    fun changeAim(dir: Int) {
        if (shooting) return
        aimAngle = (aimAngle + dir * 5f).coerceIn(-75f, 75f)
        invalidate()
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

    private val pocketNames = arrayOf("ऊपर बाएँ", "ऊपर दाएँ", "नीचे बाएँ", "नीचे दाएँ")

    private fun coinName(t: Int) = when (t) {
        0 -> "काली गोटी"
        1 -> "सफ़ेद गोटी"
        else -> "रानी"
    }

    private fun distWord(d: Float) = when {
        d < 120f -> "बहुत पास"
        d < 350f -> "मध्यम दूरी पर"
        else -> "दूर"
    }

    fun aimWord(): String = when {
        aimAngle == 0f -> "सीधा"
        aimAngle > 0f -> "दाएँ ${aimAngle.toInt()} डिग्री"
        else -> "बाएँ ${(-aimAngle).toInt()} डिग्री"
    }

    fun brief(): String {
        val h = world.firstHit(aimAngle) ?: return "सामने कोई गोटी नहीं"
        var s = "सामने ${coinName(h.coin.type)}, ${distWord(h.dist)}"
        if (h.pocket >= 0) s += ", पॉकेट की सीध में"
        return s
    }

    fun detail(): String {
        val h = world.firstHit(aimAngle)
        var s = "स्ट्राइकर स्थिति ${positionIndex()}, पंद्रह में से. निशाना ${aimWord()}. ताकत $power. ${brief()}."
        if (h != null) {
            s += if (h.pocket >= 0) {
                " यह गोटी ${pocketNames[h.pocket]} पॉकेट में जा सकती है."
            } else {
                " इस शॉट से गोटी के पॉकेट में जाने की संभावना कम है."
            }
        }
        return s
    }
}
