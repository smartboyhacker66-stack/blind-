package com.blindindiantech.blindcarrom

/** Titanic: Survive. The shared/titanic page in a WebView; the wallet (+1000 / -100) goes through WebGameActivity.Bridge. */
class TitanicActivity : WebGameActivity() {
    override fun pageUrl(): String = "file:///android_asset/titanic/index.html?" + baseQuery()
}
