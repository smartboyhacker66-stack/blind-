package com.blindindiantech.blindcarrom

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
        setTexts()
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
            cm.setPrimaryClip(ClipData.newPlainText("Blind Carrom ID", Net.myId))
            toast(L.tr("आईडी कॉपी हो गई.", "ID copied."))
        }
        b(R.id.btnShareId).setOnClickListener {
            Fx.press(this, "fx")
            share(L.tr("मेरी Blind Carrom आईडी: ${Net.myId}", "My Blind Carrom ID: ${Net.myId}"))
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
        findViewById<EditText>(R.id.etName).hint = L.tr("आपका नाम, सिर्फ़ नए खाते के लिए", "Your name, only for a new account")
        b(R.id.btnLogin).text = L.tr("लॉगिन", "Sign in")
        b(R.id.btnRegister).text = L.tr("खाता बनाएँ", "Create account")
        b(R.id.btnAuthBack).text = L.tr("वापस", "Back")
        t(R.id.tvIdTitle).text = L.tr("आपका खाता तैयार है", "Your account is ready")
        b(R.id.btnCopyId).text = L.tr("आईडी कॉपी करें", "Copy ID")
        b(R.id.btnShareId).text = L.tr("आईडी शेयर करें", "Share ID")
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
                if (r.ok) showLobby()
                else {
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
        } else {
            if (id.isEmpty()) { toast(L.tr("अपनी आईडी डालिए.", "Type your ID.")); return }
            body.put("id", id)
        }
        busy = true
        toast(if (register) L.tr("खाता बन रहा है.", "Creating your account.") else L.tr("लॉगिन हो रहा है.", "Signing in."))
        Net.bg({ Net.call("POST", if (register) "/api/register" else "/api/login", body, 60000) }, { r ->
            busy = false
            if (!destroyed) {
                if (r.ok && r.json != null) {
                    Net.saveSession(this, r.json.getString("id"), r.json.getString("name"), r.json.getString("token"))
                    findViewById<EditText>(R.id.etPassword).setText("")
                    if (register) showId() else showLobby()
                } else {
                    toast(authError(r))
                }
            }
        })
    }

    private fun authError(r: Net.Result): String = when {
        r.code == -1 -> L.tr("सर्वर से बात नहीं हो पाई. इंटरनेट जाँचिए.", "Could not reach the server. Check your internet.")
        r.error == "bad_login" -> L.tr("आईडी या पासवर्ड ग़लत है.", "The ID or password is wrong.")
        r.error == "locked" -> L.tr("बहुत ग़लत कोशिशें हुईं. पाँच मिनट बाद कोशिश कीजिए.", "Too many wrong attempts. Try again in five minutes.")
        r.error == "bad_name" -> L.tr("नाम तीन से सोलह अक्षर का होना चाहिए, सिर्फ़ अक्षर, अंक और खाली जगह.", "The name must be three to sixteen characters, using only letters, numbers and spaces.")
        r.error == "bad_password" -> L.tr("पासवर्ड ठीक आठ अक्षर या अंकों का होना चाहिए.", "The password must be exactly eight letters or numbers.")
        r.error == "too_many" -> L.tr("बहुत कोशिशें हुईं. कुछ देर बाद कोशिश कीजिए.", "Too many tries. Please try again later.")
        else -> L.tr("कुछ गड़बड़ हुई. दोबारा कोशिश कीजिए.", "Something went wrong. Please try again.")
    }

    private fun showId() {
        t(R.id.tvIdInfo).text = L.tr(
            "आपकी आईडी है: ${spoken(Net.myId)}. इसे लिख लीजिए या कॉपी कर लीजिए. नए फ़ोन पर लॉगिन के लिए यही आईडी और आपका पासवर्ड चाहिए होगा. पासवर्ड वही आठ अक्षर हैं जो आपने चुने.",
            "Your ID is: ${spoken(Net.myId)}. Write it down or copy it. To sign in on a new phone you need this ID and your password. Your password is the eight characters you chose."
        )
        show("id", R.id.tvIdTitle)
    }

    // ---------- लॉबी ----------
    private fun showLobby() {
        roomsKey = ""
        t(R.id.tvLobbyInfo).text = L.tr("${Net.myName} के रूप में लॉगिन हैं.", "Signed in as ${Net.myName}.")
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
