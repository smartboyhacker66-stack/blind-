package com.blindindiantech.blindcarrom

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

class Coin(var x: Float, var y: Float, val type: Int) {
    var vx = 0f
    var vy = 0f
    var alive = true
    val radius: Float get() = if (type == 3) World.STRIKER_R else World.COIN_R
    val mass: Float get() = if (type == 3) 1.5f else 1f
}

class Hit(val coin: Coin, val dist: Float, val pocket: Int)

class World {
    companion object {
        const val COIN_R = 22f
        const val STRIKER_R = 30f
        const val POCKET_R = 48f
        const val BASE_Y = 850f
        const val EV_COIN = 1
        const val EV_WALL = 2
        const val EV_POCKET = 3
        const val EV_FOUL = 4
        const val EV_STRIKER = 5
        val POCKETS = arrayOf(
            floatArrayOf(40f, 40f),
            floatArrayOf(960f, 40f),
            floatArrayOf(40f, 960f),
            floatArrayOf(960f, 960f)
        )
    }

    val coins = ArrayList<Coin>()
    val pocketed = ArrayList<Int>()
    var foul = false
    var listener: ((Int) -> Unit)? = null

    val striker: Coin get() = coins[0]

    init {
        reset()
    }

    fun reset() {
        coins.clear()
        coins.add(Coin(500f, BASE_Y, 3))
        coins.add(Coin(500f, 500f, 2))
        for (i in 0 until 6) {
            val a = Math.toRadians(60.0 * i)
            coins.add(Coin(500f + 46f * cos(a).toFloat(), 500f + 46f * sin(a).toFloat(), i % 2))
        }
        for (i in 0 until 12) {
            val a = Math.toRadians(30.0 * i)
            coins.add(Coin(500f + 92f * cos(a).toFloat(), 500f + 92f * sin(a).toFloat(), i % 2))
        }
        pocketed.clear()
        foul = false
    }

    fun copy(): World {
        val w = World()
        w.coins.clear()
        for (c in coins) {
            val n = Coin(c.x, c.y, c.type)
            n.vx = c.vx
            n.vy = c.vy
            n.alive = c.alive
            w.coins.add(n)
        }
        return w
    }

    fun placeStriker(x: Float) {
        val s = striker
        s.x = x
        s.y = BASE_Y
        s.vx = 0f
        s.vy = 0f
        s.alive = true
    }

    fun shoot(angleDeg: Float, power: Int) {
        val a = Math.toRadians(angleDeg.toDouble())
        val sp = power * 180f
        striker.vx = sin(a).toFloat() * sp
        striker.vy = -cos(a).toFloat() * sp
        pocketed.clear()
        foul = false
    }

    fun moving(): Boolean {
        for (c in coins) {
            if (c.alive && (c.vx != 0f || c.vy != 0f)) return true
        }
        return false
    }

    fun count(type: Int): Int = coins.count { it.alive && it.type == type }

    private fun spotFree(x: Float, y: Float): Boolean {
        for (c in coins) {
            if (!c.alive) continue
            val dx = c.x - x
            val dy = c.y - y
            val minD = c.radius + COIN_R + 2f
            if (dx * dx + dy * dy < minD * minD) return false
        }
        return true
    }

    /** पॉकेट में गई एक गोटी (इस रंग की) को बोर्ड के बीच के पास वापस रखता है. */
    fun returnCoin(type: Int): Boolean {
        val c = coins.firstOrNull { !it.alive && it.type == type } ?: return false
        val spots = ArrayList<FloatArray>()
        spots.add(floatArrayOf(500f, 500f))
        for (ring in 1..6) {
            val r = ring * 50f
            val n = ring * 6
            for (i in 0 until n) {
                val a = 2.0 * Math.PI * i / n
                spots.add(floatArrayOf(500f + (r * cos(a)).toFloat(), 500f + (r * sin(a)).toFloat()))
            }
        }
        for (s in spots) {
            if (spotFree(s[0], s[1])) {
                c.x = s[0]
                c.y = s[1]
                c.vx = 0f
                c.vy = 0f
                c.alive = true
                return true
            }
        }
        return false
    }


    fun simulate(maxSteps: Int = 700) {
        var i = 0
        while (i < maxSteps && moving()) {
            step(1f / 90f)
            i++
        }
    }

    fun step(dt: Float) {
        val decay = exp(-1.3f * dt)
        for (c in coins) {
            if (!c.alive) continue
            c.x += c.vx * dt
            c.y += c.vy * dt
            c.vx *= decay
            c.vy *= decay
            if (c.vx * c.vx + c.vy * c.vy < 100f) {
                c.vx = 0f
                c.vy = 0f
            }
            var inPocket = false
            for (p in POCKETS) {
                val dx = c.x - p[0]
                val dy = c.y - p[1]
                if (dx * dx + dy * dy < POCKET_R * POCKET_R) {
                    inPocket = true
                    break
                }
            }
            if (inPocket) {
                c.alive = false
                c.vx = 0f
                c.vy = 0f
                if (c.type == 3) {
                    foul = true
                    listener?.invoke(EV_FOUL)
                } else {
                    pocketed.add(c.type)
                    listener?.invoke(EV_POCKET)
                }
                continue
            }
            val r = c.radius
            if (c.x < r) {
                c.x = r
                if (abs(c.vx) > 60f) listener?.invoke(EV_WALL)
                c.vx = abs(c.vx) * 0.8f
            }
            if (c.x > 1000f - r) {
                c.x = 1000f - r
                if (abs(c.vx) > 60f) listener?.invoke(EV_WALL)
                c.vx = -abs(c.vx) * 0.8f
            }
            if (c.y < r) {
                c.y = r
                if (abs(c.vy) > 60f) listener?.invoke(EV_WALL)
                c.vy = abs(c.vy) * 0.8f
            }
            if (c.y > 1000f - r) {
                c.y = 1000f - r
                if (abs(c.vy) > 60f) listener?.invoke(EV_WALL)
                c.vy = -abs(c.vy) * 0.8f
            }
        }

        val n = coins.size
        for (i in 0 until n) {
            val a = coins[i]
            if (!a.alive) continue
            for (j in i + 1 until n) {
                val b = coins[j]
                if (!b.alive) continue
                val dx = b.x - a.x
                val dy = b.y - a.y
                val minD = a.radius + b.radius
                val d2 = dx * dx + dy * dy
                if (d2 >= minD * minD || d2 == 0f) continue
                val d = sqrt(d2)
                val nx = dx / d
                val ny = dy / d
                val overlap = minD - d
                val ma = a.mass
                val mb = b.mass
                val tot = ma + mb
                a.x -= nx * overlap * (mb / tot)
                a.y -= ny * overlap * (mb / tot)
                b.x += nx * overlap * (ma / tot)
                b.y += ny * overlap * (ma / tot)
                val rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
                if (rvn > 0f) {
                    val e = 0.9f
                    val imp = (1f + e) * rvn / (1f / ma + 1f / mb)
                    a.vx -= imp / ma * nx
                    a.vy -= imp / ma * ny
                    b.vx += imp / mb * nx
                    b.vy += imp / mb * ny
                    if (rvn > 40f) listener?.invoke(if (a.type == 3 || b.type == 3) EV_STRIKER else EV_COIN)
                }
            }
        }
    }

    fun firstHit(angleDeg: Float): Hit? {
        val s = striker
        val a = Math.toRadians(angleDeg.toDouble())
        val dx = sin(a).toFloat()
        val dy = -cos(a).toFloat()
        val rr = COIN_R + STRIKER_R
        var best: Coin? = null
        var bestDist = Float.MAX_VALUE
        for (i in 1 until coins.size) {
            val c = coins[i]
            if (!c.alive) continue
            val tx = c.x - s.x
            val ty = c.y - s.y
            val t = tx * dx + ty * dy
            if (t <= 0f) continue
            val perp = abs(tx * dy - ty * dx)
            if (perp >= rr) continue
            val dist = t - sqrt(rr * rr - perp * perp)
            if (dist < bestDist) {
                bestDist = dist
                best = c
            }
        }
        val coin = best ?: return null
        val d = max(bestDist, 0f)
        val cx = s.x + dx * d
        val cy = s.y + dy * d
        var ux = coin.x - cx
        var uy = coin.y - cy
        val len = sqrt(ux * ux + uy * uy)
        if (len > 0f) {
            ux /= len
            uy /= len
        }
        var pk = -1
        var bestAlong = Float.MAX_VALUE
        for (k in POCKETS.indices) {
            val wx = POCKETS[k][0] - coin.x
            val wy = POCKETS[k][1] - coin.y
            val along = wx * ux + wy * uy
            if (along <= 0f) continue
            val perp2 = abs(wx * uy - wy * ux)
            if (perp2 < 40f && along < bestAlong) {
                bestAlong = along
                pk = k
            }
        }
        return Hit(coin, d, pk)
    }
}
