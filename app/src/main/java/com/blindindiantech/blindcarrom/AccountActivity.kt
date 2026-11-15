package com.blindindiantech.blindcarrom

import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/** खाता मिटाना: पासवर्ड की पुष्टि के बाद सर्वर से खाता और सारा डेटा हट जाता है. */
class AccountActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Net.init(this)
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        root.setPadding(pad, pad, pad, pad)

        val title = TextView(this)
        title.text = L.tr("खाता मिटाएँ", "Delete account")
        title.textSize = 24f
        title.isFocusable = true
        root.addView(title)

        val info = TextView(this)
        info.text = L.tr(
            "खाता मिटाने पर आपका यूज़रनेम, पासवर्ड, Telegram जुड़ाव और खेल के आँकड़े हमेशा के लिए मिट जाएँगे. यह वापस नहीं आ सकता. आगे बढ़ने के लिए अपना पासवर्ड डालिए.",
            "Deleting your account permanently removes your username, password, Telegram link and game records. This cannot be undone. Enter your password to continue."
        )
        info.textSize = 17f
        info.isFocusable = true
        root.addView(info)

        val pw = EditText(this)
        pw.hint = L.tr("अपना पासवर्ड", "Your password")
        pw.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        root.addView(pw)

        val del = Button(this)
        del.text = L.tr("खाता हमेशा के लिए मिटाएँ", "Delete my account permanently")
        root.addView(del)

        val back = Button(this)
        back.text = L.tr("वापस", "Back")
        back.setOnClickListener { finish() }
        root.addView(back)

        del.setOnClickListener {
            if (Net.token == null) {
                toast(L.tr("पहले लॉगिन कीजिए.", "Please sign in first."))
                return@setOnClickListener
            }
            val p = pw.text.toString()
            if (p.length != 8) {
                toast(L.tr("पासवर्ड ठीक 8 अक्षर या अंकों का होना चाहिए.", "The password must be exactly 8 letters or numbers."))
                return@setOnClickListener
            }
            del.isEnabled = false
            Net.bg({ Net.call("POST", "/api/account/delete", JSONObject().put("password", p), 30000) }, { r ->
                del.isEnabled = true
                if (r.ok) {
                    Net.clearSession(this)
                    toast(L.tr("खाता मिट गया.", "Your account has been deleted."))
                    finish()
                } else if (r.code == 401) {
                    toast(L.tr("पासवर्ड ग़लत है.", "Wrong password."))
                } else {
                    toast(L.tr("खाता नहीं मिटा. दोबारा कोशिश कीजिए, या bits.headquarter505@gmail.com पर ईमेल कीजिए.", "Could not delete. Try again, or email bits.headquarter505@gmail.com."))
                }
            })
        }

        val sv = ScrollView(this)
        sv.addView(root)
        setContentView(sv)
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
