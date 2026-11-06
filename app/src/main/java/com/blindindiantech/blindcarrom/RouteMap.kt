package com.blindindiantech.blindcarrom

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.max

/**
 * Route maps for the Aeroplane Simulator (Settings -> Upload Route Map). Same rules as shared/aeroplane/routemap.js.
 * JSON: {"name":"Delhi Run","destinationNm":12,"cruiseFt":3500,"waypoints":[{"name":"ALFA","nm":4}]}
 * Text: lines "route,Delhi Run", "destination,12", "cruise,3500", "ALFA,4" (# starts a comment).
 */
object RouteMap {
    private const val PREFS = "blindcarrom"
    private const val KEY = "route_map"
    const val MAX_BYTES = 20000
    private const val MIN_DEST = 5.0
    private const val MAX_DEST = 20.0
    private const val MIN_CRUISE = 2000.0
    private const val MAX_CRUISE = 5000.0
    private const val MAX_WP = 20
    private const val MAX_NAME = 40

    class Result(val ok: Boolean, val json: String = "", val summary: String = "", val error: String = "")

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun stored(ctx: Context): String? = prefs(ctx).getString(KEY, null)

    fun storedName(ctx: Context): String? = try {
        stored(ctx)?.let { JSONObject(it).optString("name") }?.takeIf { it.isNotEmpty() }
    } catch (e: JSONException) {
        null
    }

    fun save(ctx: Context, json: String) = prefs(ctx).edit().putString(KEY, json).apply()

    fun clear(ctx: Context) = prefs(ctx).edit().remove(KEY).apply()

    private fun bad(hi: String, en: String) = Result(false, error = L.tr(hi, en))

    private val dirty = Regex("[\u0000-\u001f\u007f<>\"'`\\\\]")
    private val spaces = Regex("\\s+")
    private fun clean(s: String?): String = (s ?: "").replace(dirty, " ").replace(spaces, " ").trim().take(MAX_NAME)

    private fun num(v: Any?): Double = when (v) {
        is Number -> v.toDouble()
        is String -> v.trim().toDoubleOrNull() ?: Double.NaN
        else -> Double.NaN
    }

    private fun fmt(d: Double): String = if (d % 1.0 == 0.0) d.toInt().toString() else d.toString()

    fun parse(raw: String): Result {
        val text = raw.removePrefix("﻿").trim()
        if (text.isEmpty()) return bad("फ़ाइल ख़ाली है.", "The file is empty.")
        if (text.length > MAX_BYTES) return bad("फ़ाइल बहुत बड़ी है.", "The file is too large.")
        return if (text.startsWith("{")) fromJson(text) else fromText(text)
    }

    private fun fromJson(text: String): Result {
        val j = try {
            JSONObject(text)
        } catch (e: JSONException) {
            return bad("JSON पढ़ी नहीं जा सकी.", "The JSON could not be read.")
        }
        fun first(vararg keys: String): Double {
            for (k in keys) if (j.has(k)) return num(j.opt(k))
            return Double.NaN
        }
        val arr: JSONArray = j.optJSONArray("waypoints")
            ?: if (j.has("waypoints")) return bad("वेपॉइंट की सूची चाहिए.", "Waypoints must be a list.") else JSONArray()
        val wps = ArrayList<Pair<String, Double>>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: return badWaypoint()
            wps.add(Pair(clean(o.optString("name")), num(o.opt("nm"))))
        }
        return build(j.optString("name"), first("destinationNm", "destination_nm", "destination"), first("cruiseFt", "cruise_ft", "cruise"), wps)
    }

    private fun badWaypoint() = bad(
        "हर वेपॉइंट का नाम और समुद्री मील में दूरी (शून्य से ज़्यादा) चाहिए.",
        "Every waypoint needs a name and a distance in nautical miles above zero."
    )

    private fun fromText(text: String): Result {
        val line = Regex("^([^,;\t]+)[,;\t]\\s*(.*)$")
        var name = ""
        var dest = Double.NaN
        var cruise = Double.NaN
        val wps = ArrayList<Pair<String, Double>>()
        for (raw in text.split(Regex("\r?\n"))) {
            val l = raw.trim()
            if (l.isEmpty() || l.startsWith("#")) continue
            val m = line.matchEntire(l)
                ?: return bad("यह पंक्ति समझ नहीं आई: ${clean(l)}", "Could not read this line: ${clean(l)}")
            val key = m.groupValues[1].trim()
            val v = m.groupValues[2].trim()
            when (key.lowercase()) {
                "route", "name" -> name = v
                "destination", "dest", "distance" -> dest = num(v)
                "cruise", "altitude" -> cruise = num(v)
                else -> wps.add(Pair(clean(key), num(v)))
            }
        }
        return build(name, dest, cruise, wps)
    }

    private fun build(nameIn: String, destIn: Double, cruiseIn: Double, wpsIn: List<Pair<String, Double>>): Result {
        if (wpsIn.size > MAX_WP) return bad("ज़्यादा से ज़्यादा $MAX_WP वेपॉइंट हो सकते हैं.", "At most $MAX_WP waypoints are allowed.")
        val wps = ArrayList<Pair<String, Double>>()
        for ((n, nm) in wpsIn) {
            if (n.isEmpty() || nm.isNaN() || nm <= 0.0) return badWaypoint()
            wps.add(Pair(n, Math.round(nm * 10) / 10.0))
        }
        wps.sortBy { it.second }
        var d = destIn
        if (d.isNaN()) d = if (wps.isNotEmpty()) max(MIN_DEST, ceil(wps.last().second + 1)) else 6.0
        var c = cruiseIn
        if (c.isNaN()) c = 3000.0
        d = Math.round(d * 10) / 10.0
        c = Math.round(c / 100.0) * 100.0
        if (d < MIN_DEST || d > MAX_DEST) return bad(
            "दूरी ${fmt(MIN_DEST)} से ${fmt(MAX_DEST)} समुद्री मील के बीच होनी चाहिए.",
            "The route length must be between ${fmt(MIN_DEST)} and ${fmt(MAX_DEST)} nautical miles."
        )
        if (c < MIN_CRUISE || c > MAX_CRUISE) return bad(
            "क्रूज़ ऊँचाई ${fmt(MIN_CRUISE)} से ${fmt(MAX_CRUISE)} फ़ीट के बीच होनी चाहिए.",
            "Cruise altitude must be between ${fmt(MIN_CRUISE)} and ${fmt(MAX_CRUISE)} feet."
        )
        if (wps.isNotEmpty() && wps.last().second >= d) return bad("हर वेपॉइंट गंतव्य से पहले होना चाहिए.", "Every waypoint must be before the destination.")
        val name = clean(nameIn).ifEmpty { "Custom route" }
        val out = JSONObject().put("name", name).put("destinationNm", d).put("cruiseFt", c)
        val a = JSONArray()
        for ((n, nm) in wps) a.put(JSONObject().put("name", n).put("nm", nm))
        out.put("waypoints", a)
        val summary = L.tr(
            "रूट मैप $name: ${fmt(d)} समुद्री मील, क्रूज़ ${fmt(c)} फ़ीट, ${wps.size} वेपॉइंट.",
            "Route map $name: ${fmt(d)} nautical miles, cruise ${fmt(c)} feet, ${wps.size} waypoint${if (wps.size == 1) "" else "s"}."
        )
        return Result(true, json = out.toString(), summary = summary)
    }
}
