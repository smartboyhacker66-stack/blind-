package com.blindindiantech.blindcarrom

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** सर्वर से बात करने का सीधा-सादा तरीक़ा (कोई बाहरी पैकेज नहीं). */
object Net {
    private const val PREFS = "blindcarrom"
    var base = ""
        private set
    var token: String? = null
        private set
    var myId = ""
        private set
    var myName = ""
        private set
    private val main = Handler(Looper.getMainLooper())

    class Result(val code: Int, val json: JSONObject?) {
        val ok get() = code in 200..299
        val error: String get() = json?.optString("error", "") ?: ""
    }

    fun init(ctx: Context) {
        val app = ctx.applicationContext
        base = app.getString(R.string.server_url).trimEnd('/')
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        token = p.getString("net_token", null)
        myId = p.getString("net_id", "") ?: ""
        myName = p.getString("net_name", "") ?: ""
    }

    fun saveSession(ctx: Context, id: String, name: String, tok: String) {
        token = tok; myId = id; myName = name
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("net_token", tok).putString("net_id", id).putString("net_name", name).apply()
    }

    fun clearSession(ctx: Context) {
        token = null; myId = ""; myName = ""
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove("net_token").remove("net_id").remove("net_name").apply()
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

    fun ping(timeoutMs: Int = 90000): Boolean = call("GET", "/api/ping", null, timeoutMs).ok

    /** ऐप खुलते ही सर्वर को चुपचाप जगाना (10 मिनट के अंदर दोबारा नहीं). */
    fun wakeQuietly(ctx: Context) {
        val app = ctx.applicationContext
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - p.getLong("net_wake", 0L) < 10 * 60 * 1000L) return
        p.edit().putLong("net_wake", now).apply()
        Thread { call("GET", "/api/ping", null, 90000) }.start()
    }

    fun <T> bg(work: () -> T, done: (T) -> Unit) {
        Thread {
            val r = work()
            main.post { done(r) }
        }.start()
    }
}
