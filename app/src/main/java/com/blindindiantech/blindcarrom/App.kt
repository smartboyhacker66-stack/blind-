package com.blindindiantech.blindcarrom

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.graphics.Insets
import androidx.core.os.LocaleListCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        L.init(this)
        Fx.load(this)
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(L.code()))
        // Android 15/16 (target 36) में स्क्रीन किनारे तक फैलती है; सामग्री को स्टेटस और नेविगेशन बार से बचाते हैं.
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                val content = activity.findViewById<View>(android.R.id.content) ?: return
                ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
                    val b: Insets = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                    v.setPadding(b.left, b.top, b.right, b.bottom)
                    insets
                }
                ViewCompat.requestApplyInsets(content)
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }
}
