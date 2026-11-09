package com.blindindiantech.blindcarrom

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** दुकान: 12 दिसंबर 2026 को खुलेगी. तब तक कुछ भी ख़रीदा नहीं जा सकता. */
class ShopActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        root.setPadding(pad, pad, pad, pad)
        val title = TextView(this)
        title.text = L.tr("दुकान", "Shop")
        title.textSize = 24f
        title.isFocusable = true
        root.addView(title)
        val info = TextView(this)
        info.text = L.tr(
            "दुकान 12 दिसंबर 2026 को खुलेगी. तब तक सारे खेल मुफ़्त हैं. अभी कुछ भी ख़रीदा नहीं जा सकता.",
            "The shop opens on 12 December 2026. Until then all games are free. Nothing can be bought now."
        )
        info.textSize = 18f
        info.isFocusable = true
        root.addView(info)
        val back = Button(this)
        back.text = L.tr("वापस", "Back")
        back.setOnClickListener { finish() }
        root.addView(back)
        val sv = ScrollView(this)
        sv.addView(root)
        setContentView(sv)
    }
}
