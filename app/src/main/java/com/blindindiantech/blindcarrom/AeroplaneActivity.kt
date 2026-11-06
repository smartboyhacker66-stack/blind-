package com.blindindiantech.blindcarrom

import android.net.Uri

/** Aeroplane Simulator: the shared/aeroplane page (Web Audio sounds) in a WebView, flying the uploaded route map if there is one. */
class AeroplaneActivity : WebGameActivity() {
    override fun pageUrl(): String {
        val route = RouteMap.stored(this)
        val extra = if (route != null) "&route=" + Uri.encode(route) else ""
        return "file:///android_asset/aeroplane/index.html?" + baseQuery() + extra
    }
}
