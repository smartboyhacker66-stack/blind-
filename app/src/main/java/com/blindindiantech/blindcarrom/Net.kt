package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** सर्वर से बात करने का सीधा-सादा तरीक़ा (कोई बाहरी पैकेज नहीं). */
object Net {
    private const val PREFS = "blindcarrom"
    var base = ""
        private set
    private var candidates: List<String> = emptyList()
    private var appCtx: Context? = null
    var token: String? = null
        private set
    var myId = ""
        private set
    var myName = ""
        private set
    var level = 1
        private set
    private val main = Handler(Looper.getMainLooper())

    class Result(val code: Int, val json: JSONObject?) {
        val ok get() = code in 200..299
        val error: String get() = json?.optString("error", "") ?: ""
    }

    fun init(ctx: Context) {
        val app = ctx.applicationContext
        appCtx = app
        candidates = app.resources.getStringArray(R.array.server_urls).map { it.trimEnd('/') }
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val saved = p.getString("net_base", null)
        base = if (saved != null && candidates.contains(saved)) saved else candidates.firstOrNull() ?: ""
        token = p.getString("net_token", null)
        myId = p.getString("net_id", "") ?: ""
        myName = p.getString("net_name", "") ?: ""
        level = p.getInt("net_level", 1)
    }

    fun saveSession(ctx: Context, id: String, name: String, tok: String, lvl: Int = 1) {
        token = tok; myId = id; myName = name; level = lvl
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("net_token", tok).putString("net_id", id).putString("net_name", name)
            .putInt("net_level", lvl).apply()
    }

    fun saveLevel(ctx: Context, lvl: Int) {
        level = lvl
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("net_level", lvl).apply()
    }

    fun clearSession(ctx: Context) {
        token = null; myId = ""; myName = ""; level = 1
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove("net_token").remove("net_id").remove("net_name").remove("net_level").apply()
    }

    /** रुकावट वाला कॉल: सिर्फ़ पृष्ठभूमि (background) थ्रेड से चलाइए. */
    fun call(method: String, path: String, body: JSONObject? = null, timeoutMs: Int = 20000): Result {
        return try {
            val c = URL(base + path).openConnection() as HttpURLConnection
            c.requestMethod = method
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.setRequestProperty("Content-Type", "application/json")
            token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val stream = if (code >= 400) c.errorStream else c.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            c.disconnect()
            Result(code, if (text.isNotBlank()) JSONObject(text) else JSONObject())
        } catch (e: Exception) {
            Result(-1, null)
        }
    }

    /** हर पते को बारी-बारी आज़माता है. जो चल जाए उसे याद रख लेता है. */
    fun ping(timeoutMs: Int = 90000): Boolean {
        val order = listOf(base) + candidates.filter { it != base }
        for (u in order) {
            base = u
            if (call("GET", "/api/ping", null, timeoutMs).ok) {
                appCtx?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.putString("net_base", u)?.apply()
                return true
            }
        }
        return false
    }

    /** ऐप खुलते ही सर्वर को चुपचाप जगाना (10 मिनट के अंदर दोबारा नहीं). */
    fun wakeQuietly(ctx: Context) {
        val app = ctx.applicationContext
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - p.getLong("net_wake", 0L) < 10 * 60 * 1000L) return
        p.edit().putLong("net_wake", now).apply()
        Thread { ping(90000) }.start()
    }

    /** मेन्यू के लिए: सर्वर जगाना, सूचनाएँ लाना और (लॉगिन हो तो) लेवल ताज़ा करना. */
    fun refreshHome(ctx: Context, done: (JSONArray?) -> Unit) {
        val app = ctx.applicationContext
        Thread {
            var list: JSONArray? = null
            if (ping(90000)) {
                val n = call("GET", "/api/notifications", null, 30000)
                if (n.ok) list = n.json?.optJSONArray("notifications")
                if (token != null) {
                    val me = call("GET", "/api/me", null, 30000)
                    if (me.ok && me.json != null) saveLevel(app, me.json.optInt("level", 1))
                    else if (me.code == 401) clearSession(app)
                }
            }
            main.post { done(list) }
        }.start()
    }

    fun <T> bg(work: () -> T, done: (T) -> Unit) {
        Thread {
            val r = work()
            main.post { done(r) }
        }.start()
    }
}
