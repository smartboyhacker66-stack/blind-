package com.blindindiantech.blindcarrom

import java.util.Locale

/** फ़ोन की भाषा के हिसाब से हिंदी या अंग्रेज़ी वाक्य चुनता है. */
object L {
    fun isHindi(): Boolean = Locale.getDefault().language == "hi"

    fun tr(hi: String, en: String): String = if (isHindi()) hi else en
}
