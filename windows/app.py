"""Blind Hub: Windows डेस्कटॉप ऐप. अंदर का खेल blind-hub.html है, जो Windows की अपनी WebView2 में चलता है."""
import os
import sys
import webview


def resource(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


if __name__ == "__main__":
    webview.create_window(
        "Blind Hub",
        resource("blind-hub.html"),
        width=900,
        height=700,
        min_size=(600, 450),
    )
    webview.start()
