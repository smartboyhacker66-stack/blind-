package com.blindindiantech.blindcarrom

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        L.init(this)
        Fx.load(this)
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(L.code()))
    }
}
