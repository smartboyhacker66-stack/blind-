package com.blindindiantech.blindcarrom

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** blindhub://join?game=race|carrom&code=123456 : वेबसाइट के लिंक से सीधे कमरे के कोड पर. */
class LinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val d = intent?.data
        val game = d?.getQueryParameter("game") ?: ""
        val code = d?.getQueryParameter("code") ?: ""
        if (Regex("^[0-9]{6}$").matches(code) && (game == "race" || game == "carrom")) {
            getSharedPreferences("blindcarrom", MODE_PRIVATE).edit().putString("pending_join", "$game:$code").apply()
            startActivity(Intent(this, if (game == "race") RaceActivity::class.java else OnlineActivity::class.java))
        } else {
            startActivity(Intent(this, MainActivity::class.java))
        }
        finish()
    }
}
