package com.blindindiantech.blindcarrom

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.InputType
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class OnlineActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var loop = 0
    private var rules = "icf"
    private var stage = "connect"
    private var roomsKey = ""
    private var waitKey = ""
    private var lastWaitCount = 0
    private var launched = false
    private var busy = false
    private var ticking = false
    private var myCode = ""
    private lateinit var panels: Map<String, View>
    private var consentTitleId = 0
    private var forgotTitleId = 0
    private var linkTitleId = 0
    private var linkInfo: TextView? = null
    private var lastLinkCode = ""
    private var lastBot = ""
    private val pickAudio = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) uploadConsent(uri)
    }

    private fun t(id: Int) = findViewById<TextView>(id)
    private fun b(id: Int) = findViewById<Button>(id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_online)
        Sfx.init(this)
        Net.init(this)
        rules = intent.getStringExtra("rules") ?: "icf"
        panels = mapOf(
            "connect" to findViewById(R.id.pConnect),
            "auth" to findViewById(R.id.pAuth),
            "id" to findViewById(R.id.pIdShown),
            "lobby" to findViewById(R.id.pLobby),
            "room" to findViewById(R.id.pRoom)
        )
        buildExtraPanels()
        setTexts()
        b(R.id.btnForgot).setOnClickListener { Fx.press(this, "info"); show("forgot", forgotTitleId) }
        b(R.id.btnLinkTg).setOnClickListener { Fx.press(this, "info"); show("link", linkTitleId) }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Fx.press(this@OnlineActivity, "back")
                if (stage == "room") leaveRoom() else finish()
            }
        })

        b(R.id.btnRetry).setOnClickListener { Fx.press(this, "info"); connect() }
        b(R.id.btnConnectBack).setOnClickListener { Fx.press(this, "back"); finish() }
        b(R.id.btnAuthBack).setOnClickListener { Fx.press(this, "back"); finish() }
        b(R.id.btnLogin).setOnClickListener { Fx.press(this, "start"); doAuth(false) }
        b(R.id.btnRegister).setOnClickListener { Fx.press(this, "start"); doAuth(true) }
        b(R.id.btnCopyId).setOnClickListener {
            Fx.press(this, "fx")
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Blind Hub username", Net.myName))
            toast(L.tr("यूज़रनेम कॉपी हो गया.", "Username copied."))
        }
        b(R.id.btnShareId).setOnClickListener {
            Fx.press(this, "fx")
            share(L.tr("Blind Hub पर मेरा यूज़रनेम: ${Net.myName}", "My Blind Hub username: ${Net.myName}"))
        }
        b(R.id.btnIdContinue).setOnClickListener { Fx.press(this, "start"); showLobby() }
        b(R.id.btnCreatePublic).setOnClickListener { Fx.press(this, "start"); createRoom("public") }
        b(R.id.btnCreatePrivate).setOnClickListener { Fx.press(this, "start"); createRoom("private") }
        b(R.id.btnJoinCode).setOnClickListener {
            Fx.press(this, "start")
            val code = findViewById<EditText>(R.id.etCode).text.toString().trim()
            if (code.length != 6) toast(L.tr("छह अंकों का कोड डालिए.", "Enter the six digit code."))
            else join(JSONObject().put("code", code))
        }
        b(R.id.btnRefresh).setOnClickListener { Fx.press(this, "info"); roomsKey = ""; doTick() }
        b(R.id.btnLogout).setOnClickListener {
            Fx.press(this, "exit")
            Net.bg({ Net.call("POST", "/api/logout", JSONObject()) }, { })
            Net.clearSession(this)
            showAuth()
        }
        b(R.id.btnLobbyBack).setOnClickListener { Fx.press(this, "back"); finish() }
        b(R.id.btnShareCode).setOnClickListener {
            Fx.press(this, "fx")
            share(L.tr("मेरे Blind Carrom कमरे में आइए. कमरे का कोड: $myCode", "Join my Blind Carrom room. Room code: $myCode"))
        }
        b(R.id.btnLeaveRoom).setOnClickListener { Fx.press(this, "exit"); leaveRoom() }

        connect()
    }

    // ---------- पाठ ----------
    private fun setTexts() {
        t(R.id.tvConnectTitle).text = L.tr("सर्वर से जुड़ रहे हैं", "Connecting to the server")
        b(R.id.btnRetry).text = L.tr("दोबारा कोशिश करें", "Try again")
        b(R.id.btnConnectBack).text = L.tr("वापस", "Back")
        t(R.id.tvAuthTitle).text = L.tr("ऑनलाइन मल्टीप्लेयर: लॉगिन", "Online multiplayer: sign in")
        t(R.id.tvAuthHelp).text = L.tr(
            "ऑनलाइन खेलने के लिए खाता चाहिए. नए हैं तो अपना नाम लिखिए, अक्षरों और अंकों वाला आठ अक्षर का पासवर्ड चुनिए और खाता बनाएँ दबाइए. आपको सोलह अक्षर की आईडी मिलेगी. दूसरे फ़ोन पर लॉगिन के लिए अपनी आईडी और पासवर्ड डालकर लॉगिन दबाइए.",
            "You need an account to play online. If you are new, type a name, choose an eight character password using letters and numbers, and press Create account. You will get a sixteen character ID. To sign in on another phone, type your ID and password and press Sign in."
        )
        findViewById<EditText>(R.id.etId).hint = L.tr("आपकी आईडी, सोलह अक्षर", "Your ID, sixteen characters")
        findViewById<EditText>(R.id.etPassword).hint = L.tr("पासवर्ड, आठ अक्षर या अंक", "Password, eight letters or numbers")
        findViewById<EditText>(R.id.etBirth).hint = L.tr("जन्म का साल, जैसे 2012", "Birth year, e.g. 2012")
        findViewById<EditText>(R.id.etGuardian).hint = L.tr("अभिभावक का पूरा नाम (13 से कम उम्र पर ज़रूरी)", "Parent or guardian full name (required if under 13)")
        findViewById<TextView>(R.id.tvConsent).text = L.tr("13 से कम उम्र के बच्चे के लिए अभिभावक का नाम लिखना उसकी सहमति माना जाएगा.", "For a child under 13, writing the guardian name counts as the guardian's consent.")
        findViewById<EditText>(R.id.etName).hint = L.tr("आपका यूज़रनेम, सिर्फ़ नए खाते के लिए", "Your username, only for a new account")
        t(R.id.tvAuthHelp).text = L.tr(
            "ऑनलाइन खेलने के लिए खाता चाहिए. नए खाते के लिए अपना यूज़रनेम, जन्म का साल और आठ अक्षर का पासवर्ड भरिए और खाता बनाएँ दबाइए. दूसरे फ़ोन पर वही यूज़रनेम और पासवर्ड डालकर लॉगिन कीजिए. 13 से कम उम्र के लिए अभिभावक का नाम ज़रूरी है और बाद में उनकी आवाज़ में सहमति भेजनी होगी.",
            "You need an account to play online. For a new account, enter a username, your birth year and an eight character password, then press Create account. On another phone, sign in with the same username and password. Under 13 needs a guardian name and a voice consent recording afterwards."
        )
        findViewById<EditText>(R.id.etId).hint = L.tr("यूज़रनेम (या पुरानी आईडी)", "Username (or old ID)")
        b(R.id.btnForgot).text = L.tr("पासवर्ड भूल गए", "Forgot password")
        b(R.id.btnLinkTg).text = L.tr("Telegram जोड़ें (पासवर्ड वापसी के लिए)", "Link Telegram (for password recovery)")
        b(R.id.btnLogin).text = L.tr("लॉगिन", "Sign in")
        b(R.id.btnRegister).text = L.tr("खाता बनाएँ", "Create account")
        b(R.id.btnAuthBack).text = L.tr("वापस", "Back")
        t(R.id.tvIdTitle).text = L.tr("आपका खाता तैयार है", "Your account is ready")
        b(R.id.btnCopyId).text = L.tr("यूज़रनेम कॉपी करें", "Copy username")
        b(R.id.btnShareId).text = L.tr("यूज़रनेम शेयर करें", "Share username")
        b(R.id.btnIdContinue).text = L.tr("आगे बढ़ें", "Continue")
        t(R.id.tvLobbyTitle).text = L.tr("ऑनलाइन लॉबी", "Online lobby")
        b(R.id.btnCreatePublic).text = L.tr("खुला कमरा बनाएँ, कोई भी जुड़ने को कह सकता है", "Create an open room, anyone can ask to join")
        b(R.id.btnCreatePrivate).text = L.tr("कोड वाला निजी कमरा बनाएँ", "Create a private room with a code")
        findViewById<EditText>(R.id.etCode).hint = L.tr("कमरे का कोड, छह अंक", "Room code, six digits")
        b(R.id.btnJoinCode).text = L.tr("कोड से जुड़ें", "Join with code")
        b(R.id.btnRefresh).text = L.tr("सूची ताज़ा करें", "Refresh the list")
        t(R.id.tvRoomsTitle).text = L.tr("खुले कमरे", "Open rooms")
        b(R.id.btnLogout).text = L.tr("लॉग आउट", "Sign out")
        b(R.id.btnLobbyBack).text = L.tr("मुख्य मेनू पर वापस", "Back to main menu")
        b(R.id.btnShareCode).text = L.tr("कमरे का कोड शेयर करें", "Share the room code")
        b(R.id.btnLeaveRoom).text = L.tr("कमरा छोड़ें", "Leave the room")
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun makePanel(title: String, build: (LinearLayout) -> Unit): Pair<LinearLayout, Int> {
        val p = LinearLayout(this)
        p.orientation = LinearLayout.VERTICAL
        p.visibility = View.GONE
        val tv = TextView(this)
        tv.id = View.generateViewId()
        tv.text = title
        tv.textSize = 24f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(12))
        p.addView(tv)
        build(p)
        return Pair(p, tv.id)
    }

    private fun addText(p: LinearLayout, text: String): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.textSize = 17f
        tv.isFocusable = true
        tv.setPadding(0, 0, 0, dp(10))
        p.addView(tv)
        return tv
    }

    private fun addBtn(p: LinearLayout, text: String, click: () -> Unit): Button {
        val b = Button(this)
        b.text = text
        b.minimumHeight = dp(64)
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(10)
        b.layoutParams = lp
        b.setOnClickListener { Fx.press(this, "start"); click() }
        p.addView(b)
        return b
    }

    private fun addEdit(p: LinearLayout, hint: String, type: Int, max: Int): EditText {
        val e = EditText(this)
        e.hint = hint
        e.inputType = type
        e.maxLines = 1
        e.filters = arrayOf(android.text.InputFilter.LengthFilter(max))
        p.addView(e)
        return e
    }

    private fun buildExtraPanels() {
        val root = findViewById<LinearLayout>(R.id.onlineRoot)
        // 1) माता-पिता की आवाज़ में सहमति
        val consent = makePanel(L.tr("अभिभावक की सहमति", "Parent consent")) { p ->
            addText(p, L.tr(
                "आपकी उम्र 13 से कम है, इसलिए माता या पिता की आवाज़ में सहमति चाहिए. माता या पिता फ़ोन के रिकॉर्डर में बोलकर रिकॉर्ड करें: अपना नाम, बच्चे का नाम, और यह कि वे इस ऐप में खाता बनाने की अनुमति देते हैं. फिर उस रिकॉर्डिंग की फ़ाइल यहाँ चुनिए. फ़ाइल 3 MB तक की हो.",
                "You are under 13, so we need consent in a parent's voice. The parent records a voice message in the phone's recorder saying their name, the child's name and that they allow this account. Then choose that recording here. The file can be up to 3 MB."
            ))
            addBtn(p, L.tr("ऑडियो फ़ाइल चुनें", "Choose the audio file")) { pickAudio.launch("audio/*") }
            addBtn(p, L.tr("अभी छोड़ें", "Skip for now")) {
                toast(L.tr("सहमति के बिना ऑनलाइन खेल बंद रहेगा.", "Online play stays off without consent."))
                showLobby()
            }
        }
        // 2) पासवर्ड भूल गए
        val forgot = makePanel(L.tr("पासवर्ड भूल गए", "Forgot password")) { p ->
            addText(p, L.tr(
                "अगर आपने Telegram जोड़ा है, तो यूज़रनेम डालकर कोड मँगवाइए, फिर कोड और नया आठ अक्षर का पासवर्ड भरिए. Telegram नहीं जोड़ा था तो bits.headquarter505@gmail.com पर ईमेल कीजिए.",
                "If you linked Telegram, enter your username to get a code, then enter the code and a new eight character password. If you did not link Telegram, email bits.headquarter505@gmail.com."
            ))
            val u = addEdit(p, L.tr("यूज़रनेम", "Username"), InputType.TYPE_CLASS_TEXT, 24)
            addBtn(p, L.tr("Telegram पर कोड भेजें", "Send the code on Telegram")) {
                val name = u.text.toString().trim()
                if (name.isEmpty()) { toast(L.tr("पहले यूज़रनेम डालिए.", "Enter your username first.")); return@addBtn }
                Net.bg({ Net.call("POST", "/api/password/forgot", JSONObject().put("username", name)) }, { r ->
                    if (!destroyed) toast(if (r.code == 429) L.tr("बहुत कोशिशें हुईं, बाद में कीजिए.", "Too many tries, try later.")
                        else L.tr("अगर इस खाते में Telegram जुड़ा है तो कोड भेज दिया गया है. 10 मिनट तक चलेगा.", "If this account has Telegram linked, a code has been sent. It works for 10 minutes."))
                })
            }
            val c = addEdit(p, L.tr("Telegram का 6 अंकों का कोड", "6 digit code from Telegram"), InputType.TYPE_CLASS_NUMBER, 6)
            val np = addEdit(p, L.tr("नया पासवर्ड, आठ अक्षर या अंक", "New password, eight letters or numbers"), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD, 8)
            addBtn(p, L.tr("पासवर्ड बदलें", "Change password")) {
                val body = JSONObject().put("username", u.text.toString().trim()).put("code", c.text.toString().trim()).put("newPassword", np.text.toString())
                Net.bg({ Net.call("POST", "/api/password/reset", body) }, { r ->
                    if (!destroyed) {
                        if (r.ok) { toast(L.tr("पासवर्ड बदल गया. अब नए पासवर्ड से लॉगिन कीजिए.", "Password changed. Now sign in with the new password.")); showAuth() }
                        else if (r.error == "bad_password") toast(L.tr("नया पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.", "The new password must be exactly eight letters or numbers."))
                        else toast(L.tr("कोड ग़लत है या पुराना हो गया.", "The code is wrong or expired."))
                    }
                })
            }
            addBtn(p, L.tr("वापस", "Back")) { showAuth() }
        }
        // 3) Telegram जोड़ना
        val link = makePanel(L.tr("Telegram जोड़ें", "Link Telegram")) { p ->
            addText(p, L.tr(
                "Telegram जोड़ने पर पासवर्ड भूलने पर कोड वहीं आएगा. कोड बनाइए, फिर Telegram खोलकर बॉट को वह कोड भेजिए.",
                "When Telegram is linked, a password recovery code will arrive there. Create a code, then open Telegram and send it to the bot."
            ))
            linkInfo = addText(p, "")
            addBtn(p, L.tr("कोड बनाएँ", "Create the code")) {
                Net.bg({ Net.call("POST", "/api/telegram/link-start", JSONObject()) }, { r ->
                    if (!destroyed) {
                        if (r.ok && r.json != null) {
                            lastLinkCode = r.json.optString("code")
                            lastBot = r.json.optString("bot")
                            val bot = if (lastBot.isEmpty()) L.tr("हमारे बॉट", "our bot") else "@$lastBot"
                            linkInfo?.text = L.tr("आपका कोड: ${spoken(lastLinkCode).replace(",  ", " ")}. $bot को Telegram में भेजिए: /link $lastLinkCode. कोड 15 मिनट चलेगा.", "Your code: ${spoken(lastLinkCode).replace(",  ", " ")}. Send this to $bot in Telegram: /link $lastLinkCode. The code works for 15 minutes.")
                        } else toast(L.tr("कोड नहीं बन पाया. पहले लॉगिन कीजिए.", "Could not make a code. Sign in first."))
                    }
                })
            }
            addBtn(p, L.tr("Telegram खोलें", "Open Telegram")) {
                val url = if (lastBot.isNotEmpty() && lastLinkCode.isNotEmpty()) "https://t.me/$lastBot?start=link_$lastLinkCode" else "https://t.me/"
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) { toast(L.tr("Telegram नहीं खुला.", "Could not open Telegram.")) }
            }
            addBtn(p, L.tr("वापस", "Back")) { showLobby() }
        }
        consentTitleId = consent.second; forgotTitleId = forgot.second; linkTitleId = link.second
        root.addView(consent.first); root.addView(forgot.first); root.addView(link.first)
        panels = panels + mapOf("consent" to consent.first, "forgot" to forgot.first, "link" to link.first)
    }

    private fun showConsent() {
        handler.removeCallbacks(ticker)
        show("consent", consentTitleId)
    }

    private fun uploadConsent(uri: Uri) {
        if (busy) return
        busy = true
        toast(L.tr("ऑडियो भेजा जा रहा है, कृपया रुकिए.", "Uploading the audio, please wait."))
        Thread {
            var body: JSONObject? = null
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                if (bytes.size in 2000..3500000) {
                    val mime = contentResolver.getType(uri) ?: ""
                    val ext = when {
                        mime.contains("mpeg") -> "mp3"
                        mime.contains("ogg") -> "ogg"
                        mime.contains("wav") -> "wav"
                        mime.contains("aac") -> "aac"
                        mime.contains("3gpp") -> "3gp"
                        else -> "m4a"
                    }
                    body = JSONObject().put("audio", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)).put("ext", ext)
                }
            } catch (e: Exception) { body = null }
            val r = body?.let { Net.call("POST", "/api/consent", it, 90000) }
            handler.post {
                busy = false
                if (!destroyed) {
                    if (r != null && r.ok) {
                        toast(L.tr("सहमति मिल गई. अब आप खेल सकते हैं.", "Consent received. You can play now."))
                        showLobby()
                    } else if (r == null || r.error == "bad_audio") {
                        toast(L.tr("फ़ाइल बहुत छोटी या 3 MB से बड़ी है. दूसरी फ़ाइल चुनिए.", "The file is too small or larger than 3 MB. Choose another file."))
                    } else if (r.code == 503) {
                        toast(L.tr("अभी भेज नहीं पाए. कुछ देर बाद कोशिश कीजिए.", "Could not send it now. Try again in a while."))
                    } else toast(L.tr("कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.", "Something went wrong. Please try again."))
                }
            }
        }.start()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    private fun share(text: String) {
        val i = Intent(Intent.ACTION_SEND)
        i.type = "text/plain"
        i.putExtra(Intent.EXTRA_TEXT, text)
        startActivity(Intent.createChooser(i, null))
    }

    private fun spoken(s: String) = s.chunked(4).joinToString(",  ") { it.toCharArray().joinToString(" ") }

    private fun show(name: String, focusId: Int) {
        stage = name
        for ((k, v) in panels) v.visibility = if (k == name) View.VISIBLE else View.GONE
        val f = t(focusId)
        f.postDelayed({ f.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }, 200)
    }

    // ---------- सर्वर से जुड़ना ----------
    private val stillConnecting = object : Runnable {
        override fun run() {
            if (destroyed || stage != "connect") return
            toast(L.tr("अभी भी जुड़ रहे हैं, कृपया रुकिए.", "Still connecting, please wait."))
            handler.postDelayed(this, 12000)
        }
    }

    private fun connect() {
        show("connect", R.id.tvConnectTitle)
        t(R.id.tvConnectStatus).text = L.tr(
            "पहली बार में एक मिनट तक लग सकता है. कृपया रुकिए.",
            "The first time this can take up to a minute. Please wait."
        )
        b(R.id.btnRetry).visibility = View.GONE
        Sfx.stop(loop)
        loop = Sfx.playLoop("net_wait")
        handler.removeCallbacks(stillConnecting)
        handler.postDelayed(stillConnecting, 12000)
        Net.bg({ Net.ping() }, { ok ->
            if (!destroyed) {
                handler.removeCallbacks(stillConnecting)
                Sfx.stop(loop)
                loop = 0
                if (ok) onConnected() else onConnectFailed()
            }
        })
    }

    private fun onConnectFailed() {
        t(R.id.tvConnectStatus).text = L.tr(
            "सर्वर से नहीं जुड़ पाए. इंटरनेट जाँचिए और दोबारा कोशिश कीजिए.",
            "Could not connect to the server. Check your internet and try again."
        )
        b(R.id.btnRetry).visibility = View.VISIBLE
        toast(t(R.id.tvConnectStatus).text.toString())
    }

    private fun onConnected() {
        Sfx.play("net_connected")
        if (Net.token == null) { showAuth(); return }
        Net.bg({ Net.call("GET", "/api/me") }, { r ->
            if (!destroyed) {
                if (r.ok) {
                    r.json?.let { Net.saveLevel(this, it.optInt("level", 1)) }
                    showLobby()
                } else {
                    if (r.code == 401) Net.clearSession(this)
                    showAuth()
                }
            }
        })
    }

    // ---------- लॉगिन ----------
    private fun showAuth() {
        handler.removeCallbacks(ticker)
        show("auth", R.id.tvAuthTitle)
    }

    private fun doAuth(register: Boolean) {
        if (busy) return
        val id = findViewById<EditText>(R.id.etId).text.toString().trim()
        val pw = findViewById<EditText>(R.id.etPassword).text.toString()
        val name = findViewById<EditText>(R.id.etName).text.toString().trim()
        if (pw.length != 8) { toast(L.tr("पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.", "The password must be exactly eight letters or numbers.")); return }
        val body = JSONObject().put("password", pw)
        if (register) {
            if (name.length < 3) { toast(L.tr("नाम कम से कम तीन अक्षर का लिखिए.", "Type a name of at least three characters.")); return }
            body.put("name", name)
            val birth = findViewById<EditText>(R.id.etBirth).text.toString().trim()
            if (birth.isEmpty()) { toast(L.tr("जन्म का साल डालिए.", "Enter your birth year.")); return }
            body.put("birthYear", birth.toIntOrNull() ?: 0)
            body.put("guardian", findViewById<EditText>(R.id.etGuardian).text.toString().trim())
        } else {
            if (id.isEmpty()) { toast(L.tr("अपना यूज़रनेम डालिए.", "Type your username.")); return }
            body.put("id", id)
            body.put("username", id)
        }
        busy = true
        toast(if (register) L.tr("खाता बन रहा है.", "Creating your account.") else L.tr("लॉगिन हो रहा है.", "Signing in."))
        Net.bg({ Net.call("POST", if (register) "/api/register" else "/api/login", body, 60000) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok && r.json != null) {
                    Net.saveSession(this, r.json.getString("id"), r.json.getString("name"), r.json.getString("token"), r.json.optInt("level", 1))
                    findViewById<EditText>(R.id.etPassword).setText("")
                    if (r.json.optString("consent") == "none") showConsent()
                    else if (register) showId() else showLobby()
                } else {
                    toast(authError(r))
                }
            }
        })
    }

    private fun authError(r: Net.Result): String = when {
        r.code == -1 -> L.tr("सर्वर से बात नहीं हो पाई. इंटरनेट जाँचिए.", "Could not reach the server. Check your internet.")
        r.error == "name_taken" -> L.tr("यह यूज़रनेम पहले से लिया हुआ है. दूसरा चुनिए.", "That username is already taken. Choose another.")
        r.error == "bad_login" -> L.tr("आईडी या पासवर्ड ग़लत है.", "The ID or password is wrong.")
        r.error == "locked" -> L.tr("बहुत ग़लत कोशिशें हुईं. पाँच मिनट बाद कोशिश कीजिए.", "Too many wrong attempts. Try again in five minutes.")
        r.error == "bad_name" -> L.tr("नाम तीन से सोलह अक्षर का होना चाहिए, सिर्फ़ अक्षर, अंक और खाली जगह.", "The name must be three to sixteen characters, using only letters, numbers and spaces.")
        r.error == "bad_password" -> L.tr("पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.", "The password must be exactly eight letters or numbers.")
        r.error == "guardian_needed" -> L.tr("13 से कम उम्र के लिए अभिभावक का नाम ज़रूरी है.", "A guardian name is required for users under 13.")
        r.error == "bad_birth" -> L.tr("जन्म का साल सही नहीं लगता.", "The birth year does not look right.")
        r.error == "too_many" -> L.tr("बहुत कोशिशें हुईं. कुछ देर बाद कोशिश कीजिए.", "Too many tries. Please try again later.")
        else -> L.tr("कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.", "Something went wrong. Please try again.")
    }

    private fun showId() {
        t(R.id.tvIdInfo).text = L.tr(
            "आपका यूज़रनेम है: ${Net.myName}. दूसरे फ़ोन पर लॉगिन के लिए यही यूज़रनेम और आपका पासवर्ड चाहिए होगा. पासवर्ड वही आठ अक्षर हैं जो आपने चुने.",
            "Your username is: ${Net.myName}. To sign in on another phone you need this username and your password. Your password is the eight characters you chose."
        )
        show("id", R.id.tvIdTitle)
    }

    // ---------- लॉबी ----------
    private fun showLobby() {
        roomsKey = ""
        t(R.id.tvLobbyInfo).text = L.tr("${Net.myName} के रूप में लॉगिन हैं, लेवल ${Net.level}.", "Signed in as ${Net.myName}, level ${Net.level}.")
        show("lobby", R.id.tvLobbyTitle)
        handler.removeCallbacks(ticker)
        handler.post(ticker)
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed) return
            if (stage == "lobby" || stage == "room") doTick()
            handler.postDelayed(this, if (stage == "room") 1500L else 3000L)
        }
    }

    private fun doTick() {
        if (ticking || (stage != "lobby" && stage != "room")) return
        ticking = true
        val wantRooms = stage == "lobby"
        Net.bg({
            val st = Net.call("GET", "/api/state")
            val rooms = if (wantRooms) Net.call("GET", "/api/rooms") else null
            Pair(st, rooms)
        }, { pair ->
            ticking = false
            if (!destroyed) handleTick(pair.first, pair.second)
        })
    }

    private fun handleTick(st: Net.Result, rooms: Net.Result?) {
        if (st.code == 401) { Net.clearSession(this); showAuth(); return }
        if (st.code == 403 && st.error == "consent_needed") { showConsent(); return }
        val j = st.json
        if (!st.ok || j == null) return
        when (j.optString("phase")) {
            "open" -> { if (stage != "room") enterRoom(); renderOpenRoom(j) }
            "waiting" -> { if (stage != "room") enterRoom(); renderWaiting(j) }
            "playing" -> launchGame()
            "ended" -> Net.bg({ Net.call("POST", "/api/rooms/leave", JSONObject()) }, { })
            else -> {
                if (stage == "room") {
                    when (j.optString("notice", "")) {
                        "chosenOther" -> toast(L.tr("कमरे वाले ने किसी और को चुना.", "The room owner chose another player."))
                        "roomClosed" -> toast(L.tr("कमरा बंद हो गया.", "The room was closed."))
                        "expired" -> toast(L.tr("कमरे का समय पूरा हो गया.", "The room expired."))
                    }
                    showLobby()
                } else if (stage == "lobby" && rooms != null) {
                    renderRooms(rooms)
                }
            }
        }
    }

    private fun addRow(parent: LinearLayout, text: String, onClick: () -> Unit) {
        val btn = Button(this)
        btn.text = text
        btn.minimumHeight = (64 * resources.displayMetrics.density).toInt()
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = (8 * resources.displayMetrics.density).toInt()
        btn.layoutParams = lp
        btn.setOnClickListener { Fx.press(this, "start"); onClick() }
        parent.addView(btn)
    }

    private fun renderRooms(r: Net.Result) {
        val j = r.json ?: return
        val arr = j.optJSONArray("rooms") ?: JSONArray()
        val key = arr.toString()
        if (key == roomsKey) return
        roomsKey = key
        val list = findViewById<LinearLayout>(R.id.roomsList)
        list.removeAllViews()
        t(R.id.tvRoomsTitle).text = L.tr(
            "खुले कमरे, अभी ${j.optInt("online")} खिलाड़ी ऑनलाइन",
            "Open rooms, ${j.optInt("online")} players online now"
        )
        if (arr.length() == 0) {
            val tv = TextView(this)
            tv.text = L.tr("अभी कोई खुला कमरा नहीं है. आप एक बनाइए.", "There are no open rooms right now. Create one.")
            tv.textSize = 18f
            tv.isFocusable = true
            list.addView(tv)
            return
        }
        for (i in 0 until arr.length()) {
            val room = arr.getJSONObject(i)
            val owner = room.getString("owner")
            val waiting = room.getInt("waiting")
            val simple = room.optString("rules") == "simple"
            val label = L.tr(
                "$owner का कमरा${if (simple) ", सादा खेल" else ""}, $waiting लोग इंतज़ार में. जुड़ने के लिए दबाइए.",
                "$owner's room${if (simple) ", simple game" else ""}, $waiting waiting. Press to ask to join."
            )
            addRow(list, label) { join(JSONObject().put("roomId", room.getString("roomId"))) }
        }
    }

    // ---------- कमरा ----------
    private fun createRoom(type: String) {
        if (busy) return
        busy = true
        Net.bg({ Net.call("POST", "/api/rooms", JSONObject().put("type", type).put("rules", rules)) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok) { enterRoom(); doTick() }
                else if (r.error == "already_in_room") { doTick() }
                else toast(L.tr("कमरा नहीं बन पाया. दोबारा कोशिश कीजिए.", "Could not create the room. Please try again."))
            }
        })
    }

    private fun join(body: JSONObject) {
        if (busy) return
        busy = true
        Net.bg({ Net.call("POST", "/api/rooms/join", body) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok) {
                    if (r.json?.optBoolean("started") == true) launchGame() else { enterRoom(); doTick() }
                } else {
                    toast(
                        when (r.error) {
                            "not_found" -> L.tr("यह कमरा नहीं मिला या बंद हो चुका है.", "That room was not found or is already closed.")
                            "room_full" -> L.tr("इस कमरे की इंतज़ार-सूची भर चुकी है.", "This room's waiting list is full.")
                            "own_room" -> L.tr("यह आपका ही कमरा है.", "This is your own room.")
                            "already_in_room" -> L.tr("आप पहले से किसी कमरे में हैं.", "You are already in a room.")
                            else -> L.tr("जुड़ नहीं पाए. दोबारा कोशिश कीजिए.", "Could not join. Please try again.")
                        }
                    )
                    if (r.error == "already_in_room") doTick()
                }
            }
        })
    }

    private fun enterRoom() {
        waitKey = ""
        lastWaitCount = 0
        show("room", R.id.tvRoomTitle)
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, 1500)
    }

    private fun renderOpenRoom(j: JSONObject) {
        val room = j.getJSONObject("room")
        myCode = room.getString("code")
        t(R.id.tvRoomTitle).text = L.tr("आपका कमरा", "Your room")
        val isPublic = room.optString("type") == "public"
        t(R.id.tvRoomInfo).text = L.tr(
            "कमरे का कोड: ${spoken(myCode).replace(",  ", " ")}. इसे दोस्त को भेज दीजिए" +
                (if (isPublic) ", या खुले कमरों की सूची से जुड़ने वालों का इंतज़ार कीजिए." else "."),
            "Room code: ${spoken(myCode).replace(",  ", " ")}. Send it to a friend" +
                (if (isPublic) ", or wait for players to ask to join from the open rooms list." else ".")
        )
        b(R.id.btnShareCode).visibility = View.VISIBLE
        val arr = j.optJSONArray("waiting") ?: JSONArray()
        val key = arr.toString()
        if (key == waitKey) return
        waitKey = key
        if (arr.length() > lastWaitCount) {
            Sfx.play("turn_change")
            toast(L.tr("${arr.length()} खिलाड़ी इंतज़ार में हैं.", "${arr.length()} players are waiting."))
        }
        lastWaitCount = arr.length()
        val list = findViewById<LinearLayout>(R.id.waitList)
        list.removeAllViews()
        for (i in 0 until arr.length()) {
            val w = arr.getJSONObject(i)
            val name = w.getString("name")
            addRow(
                list,
                L.tr("$name खेलना चाहते हैं. $name के साथ मैच शुरू करने के लिए दबाइए.", "$name wants to play. Press to start a match with $name.")
            ) { acceptPlayer(w.getString("id")) }
        }
    }

    private fun renderWaiting(j: JSONObject) {
        t(R.id.tvRoomTitle).text = L.tr("इंतज़ार", "Waiting")
        t(R.id.tvRoomInfo).text = L.tr(
            "${j.optString("owner")} के चुनने का इंतज़ार है. आप ${j.optInt("waitingCount")} इंतज़ार करने वालों में से नंबर ${j.optInt("position")} पर हैं.",
            "Waiting for ${j.optString("owner")} to choose a player. You are number ${j.optInt("position")} of ${j.optInt("waitingCount")} waiting."
        )
        b(R.id.btnShareCode).visibility = View.GONE
        findViewById<LinearLayout>(R.id.waitList).removeAllViews()
        waitKey = ""
    }

    private fun acceptPlayer(userId: String) {
        if (busy) return
        busy = true
        Net.bg({ Net.call("POST", "/api/rooms/accept", JSONObject().put("userId", userId)) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok) doTick() else toast(L.tr("यह खिलाड़ी अब उपलब्ध नहीं है.", "That player is no longer available."))
            }
        })
    }

    private fun leaveRoom() {
        Net.bg({ Net.call("POST", "/api/rooms/leave", JSONObject()) }, { if (!destroyed) showLobby() })
    }

    private fun launchGame() {
        if (launched) return
        launched = true
        handler.removeCallbacks(ticker)
        val i = Intent(this, GameActivity::class.java)
        i.putExtra("mode", "online")
        startActivity(i)
    }

    override fun onResume() {
        super.onResume()
        launched = false
        if (stage == "lobby" || stage == "room") {
            handler.removeCallbacks(ticker)
            handler.post(ticker)
        }
    }

    override fun onPause() {
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        Sfx.stop(loop)
        super.onDestroy()
    }
}
