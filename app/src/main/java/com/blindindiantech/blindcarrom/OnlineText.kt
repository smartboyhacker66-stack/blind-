package com.blindindiantech.blindcarrom

import org.json.JSONArray

/** सर्वर की "घटनाओं" को हर खिलाड़ी की अपनी भाषा के वाक्यों में बदलता है. */
object OnlineText {

    fun colourName(c: Int) = if (c == 1) L.tr("सफ़ेद", "White") else L.tr("काली", "Black")

    fun count(coins: JSONArray, type: Int): Int {
        var n = 0
        for (i in 0 until coins.length()) {
            val c = coins.getJSONArray(i)
            if (c.getInt(2) == type && c.getInt(3) == 1) n++
        }
        return n
    }

    fun remain(coins: JSONArray, colour: IntArray): String = L.tr(
        "${colourName(colour[0])} गोटियाँ ${count(coins, colour[0])} बाकी, ${colourName(colour[1])} गोटियाँ ${count(coins, colour[1])} बाकी.",
        "${count(coins, colour[0])} ${colourName(colour[0])} coins left, ${count(coins, colour[1])} ${colourName(colour[1])} coins left."
    )

    fun startText(names: Array<String>, colour: IntArray, cur: Int): String = L.tr(
        "${names[0]} ${colourName(colour[0])} गोटियाँ खेलेंगे, ${names[1]} ${colourName(colour[1])}. ${names[cur]} का टर्न.",
        "${names[0]} plays ${colourName(colour[0])}, ${names[1]} plays ${colourName(colour[1])}. It is ${names[cur]}'s turn."
    )

    fun render(
        ev: JSONArray, shooter: String, names: Array<String>, colour: IntArray, coins: JSONArray
    ): String {
        val sb = StringBuilder()
        val s = shooter
        for (i in 0 until ev.length()) {
            val e = ev.getJSONObject(i)
            when (e.getString("t")) {
                "foul" -> sb.append(L.tr("$s का स्ट्राइकर पॉकेट में गया, फ़ाउल. ", "$s's striker went into a pocket. Foul. "))
                "shotCoinsReturned" -> sb.append(L.tr("इस शॉट की गोटियाँ वापस बोर्ड पर रखी गईं. ", "The coins from this shot were put back on the board. "))
                "queenReturned" -> sb.append(L.tr("रानी वापस बीच में रखी गई. ", "The queen was put back in the centre. "))
                "penaltyReturned" -> sb.append(L.tr("दंड में $s की एक गोटी वापस बोर्ड पर रखी गई. ", "As a penalty, one of $s's coins was put back on the board. "))
                "penaltyOwed" -> sb.append(L.tr("$s की कोई गोटी अभी डाली नहीं गई थी, इसलिए अगली डाली गई गोटी वापस रखी जाएगी. ", "$s had not pocketed any coin yet, so the next coin pocketed will be put back. "))
                "owedReturned" -> sb.append(L.tr("पहले के दंड की वजह से यह गोटी वापस बोर्ड पर रखी गई. ", "Because of an earlier penalty, this coin was put back on the board. "))
                "own" -> {
                    val n = e.getInt("n")
                    sb.append(
                        if (n == 1) L.tr("$s की गोटी पॉकेट में गई. ", "$s pocketed one of their coins. ")
                        else L.tr("$s की $n गोटियाँ पॉकेट में गईं. ", "$s pocketed $n of their coins. ")
                    )
                }
                "opp" -> {
                    val n = e.getInt("n")
                    sb.append(
                        if (n == 1) L.tr("विरोधी की गोटी पॉकेट में गई. ", "An opponent's coin was pocketed. ")
                        else L.tr("विरोधी की $n गोटियाँ पॉकेट में गईं. ", "$n opponent coins were pocketed. ")
                    )
                }
                "queenCovered" -> sb.append(L.tr("रानी कवर हो गई. ", "The queen is covered. "))
                "queenNotCovered" -> sb.append(L.tr("रानी कवर नहीं हुई, वापस बीच में रखी गई. ", "The queen was not covered and was put back in the centre. "))
                "queenWithOwn" -> sb.append(L.tr("रानी और $s की गोटी साथ में गई, रानी कवर हो गई. ", "The queen and $s's coin went in together. The queen is covered. "))
                "queenPending" -> sb.append(L.tr("रानी पॉकेट में गई. अब $s को अपनी गोटी डालकर उसे कवर करना है. ", "The queen is pocketed. Now $s must pocket one of their coins to cover her. "))
                "lastCoinBack" -> sb.append(L.tr("रानी से पहले आख़िरी गोटी नहीं डाली जा सकती, वह वापस रखी गई. ", "The last coin cannot be pocketed before the queen, so it was put back. "))
                "oppLastBack" -> sb.append(L.tr("रानी से पहले विरोधी की आख़िरी गोटी नहीं गिनी जाती, वह वापस रखी गई. ", "The opponent's last coin does not count before the queen, so it was put back. "))
                "none" -> sb.append(L.tr("कोई गोटी पॉकेट में नहीं गई. ", "No coin was pocketed. "))
                "boardOver" -> {
                    val w = e.getInt("winner")
                    val remaining = e.getInt("remaining")
                    val bonus = e.getInt("bonus")
                    val pts = e.getInt("pts")
                    sb.append(L.tr("बोर्ड ख़त्म. ${names[w]} ने बोर्ड जीता. विरोधी की $remaining गोटियाँ बाकी थीं", "Board over. ${names[w]} won the board. The opponent had $remaining coins left"))
                    if (bonus > 0) sb.append(L.tr(", और रानी के तीन अंक", ", plus three points for the queen"))
                    sb.append(L.tr(", कुल $pts अंक. ", ", $pts points in total. "))
                }
                "matchOver" -> sb.append(L.tr("मैच ख़त्म. ${names[e.getInt("winner")]} जीते. ", "Match over. ${names[e.getInt("winner")]} wins. "))
                "newBoard" -> sb.append(L.tr("नया बोर्ड शुरू. ", "A new board has started. ") + startText(names, colour, e.getInt("cur")) + " ")
                "timeout" -> sb.append(L.tr("${names[e.getInt("player")]} ने समय पर शॉट नहीं मारा, बारी बदल गई. ", "${names[e.getInt("player")]} did not shoot in time, so the turn passed. "))
                "turn" -> {
                    sb.append(L.tr("अब ${names[e.getInt("cur")]} का टर्न. ", "Now it is ${names[e.getInt("cur")]}'s turn. "))
                    sb.append(remain(coins, colour))
                }
            }
        }
        return sb.toString()
    }
}
