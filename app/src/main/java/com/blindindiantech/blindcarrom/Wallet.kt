package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/** खेल के रुपये. लॉगिन हो तो यूज़र आईडी से जुड़ा Firestore बैलेंस (सर्वर), वरना सिर्फ़ इसी फ़ोन में. */
object Wallet {
    private const val PREFS = "blindcarrom"
    private const val KEY = "train_money_v2"
    const val START = 20000
    private val main = Handler(Looper.getMainLooper())

    fun local(ctx: Context): Int = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY, START)

    private fun save(ctx: Context, v: Int) {
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY, v).apply()
    }

    /** ताज़ा बैलेंस मंगाता है; सर्वर न मिले तो स्थानीय मान ही लौटाता है (मुख्य थ्रेड पर). */
    fun pull(ctx: Context, done: (Int) -> Unit) {
        if (Net.token == null) { done(local(ctx)); return }
        Thread {
            val r = Net.call("GET", "/api/balance", null, 30000)
            val b = if (r.ok && r.json != null && r.json.has("balance")) r.json.optInt("balance", local(ctx)) else local(ctx)
            save(ctx, b)
            main.post { done(b) }
        }.start()
    }

    /** kind: "fine" या "reward". स्थानीय मान तुरंत बदलता है, सर्वर को पीछे से बताता है. */
    fun apply(ctx: Context, kind: String, amount: Int) {
        val cur = local(ctx)
        save(ctx, maxOf(0, if (kind == "fine") cur - amount else cur + amount))
        if (Net.token == null) return
        Thread {
            val r = Net.call("POST", "/api/balance/apply", JSONObject().put("kind", kind).put("amount", amount), 30000)
            if (r.ok && r.json != null && r.json.has("balance")) save(ctx, r.json.optInt("balance"))
        }.start()
    }
}
