package com.blindindiantech.blindcarrom

import android.content.Context

/** ऐप की अपनी भाषा (डिफ़ॉल्ट English). फ़ोन की भाषा से कोई लेना-देना नहीं. */
object L {
    private const val PREFS = "blindcarrom"
    private var lang = "en"

    fun init(ctx: Context) {
        lang = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lang", "en") ?: "en"
    }

    fun set(ctx: Context, value: String) {
        lang = value
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("lang", value).apply()
    }

    fun code(): String = lang

    fun isHindi(): Boolean = lang == "hi"

    fun tr(hi: String, en: String): String = if (isHindi()) hi else en
}
