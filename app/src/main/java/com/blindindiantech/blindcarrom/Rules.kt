package com.blindindiantech.blindcarrom

/**
 * असली कैरम के नियम (अंतरराष्ट्रीय कैरम संघ पर आधारित सरल रूप).
 * match25 = true: कई बोर्ड, 25 अंक तक का मैच.
 * match25 = false: सादा खेल, सिर्फ़ एक बोर्ड.
 * इस फ़ाइल में Android का कुछ नहीं है, ताकि बाद में यही नियम सर्वर पर भी चल सकें.
 */
class Rules(val match25: Boolean) {

    companion object {
        const val Q_BOARD = 0
        const val Q_PENDING = 1
        const val Q_COVERED = 2
    }

    // हर खिलाड़ी की गोटी का रंग: 1 = सफ़ेद, 0 = काली
    val colour = intArrayOf(1, 0)
    val matchScore = intArrayOf(0, 0)
    private val owed = intArrayOf(0, 0)
    var cur = 0
    var board = 1
    var boardOver = false
    var matchOver = false
    var queenState = Q_BOARD
    private var queenOwner = -1

    // आख़िरी शॉट में क्या हुआ, आवाज़ों के लिए
    var lastQueenCovered = false
    var lastReturned = 0

    fun colourName(c: Int) = if (c == 1) L.tr("सफ़ेद", "White") else L.tr("काली", "Black")

    fun startText(names: Array<String>): String {
        return L.tr(
            "${names[0]} ${colourName(colour[0])} गोटियाँ खेलेंगे, ${names[1]} ${colourName(colour[1])}. ${names[cur]} का टर्न.",
            "${names[0]} plays ${colourName(colour[0])}, ${names[1]} plays ${colourName(colour[1])}. It is ${names[cur]}'s turn."
        )
    }

    fun modeText(): String =
        if (match25) L.tr("असली कैरम नियम, पच्चीस अंक तक का मैच.", "Real carrom rules, a match to twenty five points.")
        else L.tr("सादा खेल, सिर्फ़ एक बोर्ड.", "Simple game, one board only.")

    private fun remainText(world: World): String {
        return L.tr(
            "${colourName(colour[0])} गोटियाँ ${world.count(colour[0])} बाकी, ${colourName(colour[1])} गोटियाँ ${world.count(colour[1])} बाकी.",
            "${world.count(colour[0])} ${colourName(colour[0])} coins left, ${world.count(colour[1])} ${colourName(colour[1])} coins left."
        )
    }

    fun scoreText(names: Array<String>, world: World): String {
        val s = StringBuilder()
        if (match25) {
            s.append(L.tr(
                "${names[0]} ${matchScore[0]} अंक, ${names[1]} ${matchScore[1]} अंक. बोर्ड $board. ",
                "${names[0]} ${matchScore[0]} points, ${names[1]} ${matchScore[1]} points. Board $board. "
            ))
        }
        s.append(L.tr(
            "${names[0]} की ${world.count(colour[0])} गोटियाँ बाकी, ${names[1]} की ${world.count(colour[1])} गोटियाँ बाकी.",
            "${names[0]} has ${world.count(colour[0])} coins left, ${names[1]} has ${world.count(colour[1])} coins left."
        ))
        return s.toString()
    }

    private fun giveBack(world: World, type: Int) {
        if (world.returnCoin(type)) lastReturned += 1
    }

    fun process(world: World, names: Array<String>, pocketed: List<Int>, foul: Boolean): String {
        lastQueenCovered = false
        lastReturned = 0
        val p = cur
        val o = colour[p]
        val q = colour[1 - p]
        val sb = StringBuilder()
        val wasPending = queenState == Q_PENDING && queenOwner == p
        var keep: Boolean

        if (foul) {
            sb.append(L.tr("स्ट्राइकर पॉकेट में गया, फ़ाउल. ", "The striker went into a pocket. Foul. "))
            for (t in pocketed) giveBack(world, t)
            if (pocketed.isNotEmpty()) sb.append(L.tr("इस शॉट की गोटियाँ वापस बोर्ड पर रखी गईं. ", "The coins pocketed in this shot were put back on the board. "))
            if (wasPending) {
                giveBack(world, 2)
                queenState = Q_BOARD
                queenOwner = -1
                sb.append(L.tr("रानी वापस बीच में रखी गई. ", "The queen was put back in the centre. "))
            }
            if (9 - world.count(o) > 0) {
                giveBack(world, o)
                sb.append(L.tr("दंड में आपकी एक गोटी वापस बोर्ड पर रखी गई. ", "As a penalty, one of your coins was put back on the board. "))
            } else {
                owed[p] += 1
                sb.append(L.tr("आपकी कोई गोटी अभी डाली नहीं गई थी, इसलिए अगली गोटी जो आप डालेंगे वह वापस रखी जाएगी. ", "You had not pocketed any coin yet, so the next coin you pocket will be put back. "))
            }
            keep = false
        } else {
            var own = 0
            var opp = 0
            var queenNow = false
            for (t in pocketed) {
                if (t == o) own++ else if (t == 2) queenNow = true else opp++
            }
            while (own > 0 && owed[p] > 0) {
                giveBack(world, o)
                own--
                owed[p]--
                sb.append(L.tr("पहले के दंड की वजह से यह गोटी वापस बोर्ड पर रखी गई. ", "Because of an earlier penalty, this coin was put back on the board. "))
            }
            keep = false
            if (own > 0) {
                keep = true
                sb.append(
                    if (own == 1) L.tr("आपकी गोटी पॉकेट में गई. ", "Your coin was pocketed. ")
                    else L.tr("आपकी $own गोटियाँ पॉकेट में गईं. ", "Your $own coins were pocketed. ")
                )
            }
            if (opp > 0) {
                sb.append(
                    if (opp == 1) L.tr("विरोधी की गोटी पॉकेट में गई. ", "The opponent's coin was pocketed. ")
                    else L.tr("विरोधी की $opp गोटियाँ पॉकेट में गईं. ", "The opponent's $opp coins were pocketed. ")
                )
            }
            if (wasPending) {
                if (own > 0) {
                    queenState = Q_COVERED
                    lastQueenCovered = true
                    sb.append(L.tr("रानी कवर हो गई. ", "The queen is covered. "))
                } else {
                    giveBack(world, 2)
                    queenState = Q_BOARD
                    queenOwner = -1
                    keep = false
                    sb.append(L.tr("रानी कवर नहीं हुई, वापस बीच में रखी गई. ", "The queen was not covered and was put back in the centre. "))
                }
            }
            if (queenNow) {
                keep = true
                queenOwner = p
                if (own > 0) {
                    queenState = Q_COVERED
                    lastQueenCovered = true
                    sb.append(L.tr("रानी और आपकी गोटी साथ में गई, रानी कवर हो गई. ", "The queen and your coin went in together. The queen is covered. "))
                } else {
                    queenState = Q_PENDING
                    sb.append(L.tr("रानी पॉकेट में गई. अब अपनी गोटी डालकर उसे कवर कीजिए. ", "The queen is pocketed. Now pocket one of your coins to cover her. "))
                }
            }
            // रानी से पहले किसी रंग की आख़िरी गोटी नहीं डाली जा सकती
            if (world.count(o) == 0 && queenState == Q_BOARD) {
                giveBack(world, o)
                own--
                sb.append(L.tr("रानी से पहले आख़िरी गोटी नहीं डाली जा सकती, वह वापस रखी गई. ", "The last coin cannot be pocketed before the queen, so it was put back. "))
                if (own <= 0 && !queenNow && !wasPending) keep = false
            }
            if (world.count(q) == 0 && queenState == Q_BOARD) {
                giveBack(world, q)
                sb.append(L.tr("रानी से पहले विरोधी की आख़िरी गोटी नहीं गिनी जाती, वह वापस रखी गई. ", "The opponent's last coin does not count before the queen, so it was put back. "))
            }
            if (pocketed.isEmpty()) sb.append(L.tr("कोई गोटी पॉकेट में नहीं गई. ", "No coin was pocketed. "))
        }

        checkBoardEnd(world, names, sb)
        if (!boardOver) {
            if (!keep) cur = 1 - cur
            sb.append(L.tr("अब ${names[cur]} का टर्न. ", "Now it is ${names[cur]}'s turn. "))
            sb.append(remainText(world))
        }
        return sb.toString()
    }

    private fun checkBoardEnd(world: World, names: Array<String>, sb: StringBuilder) {
        val c0 = world.count(colour[0])
        val c1 = world.count(colour[1])
        if (c0 != 0 && c1 != 0) return
        val w = if (c0 == 0 && c1 != 0) 0 else if (c1 == 0 && c0 != 0) 1 else cur
        val remaining = world.count(colour[1 - w])
        var bonus = 0
        if (queenState == Q_COVERED && queenOwner == w && matchScore[w] <= 22) bonus = 3
        val pts = remaining + bonus
        matchScore[w] += pts
        boardOver = true
        sb.append(L.tr(
            "बोर्ड ख़त्म. ${names[w]} ने बोर्ड जीता. विरोधी की $remaining गोटियाँ बाकी थीं",
            "Board over. ${names[w]} won the board. The opponent had $remaining coins left"
        ))
        if (bonus > 0) sb.append(L.tr(", और रानी के तीन अंक", ", plus three points for the queen"))
        sb.append(L.tr(", कुल $pts अंक. ", ", $pts points in total. "))
        if (!match25) {
            matchOver = true
            sb.append(L.tr("खेल ख़त्म. ${names[w]} जीते. ", "Game over. ${names[w]} wins. "))
        } else if (matchScore[w] >= 25) {
            matchOver = true
            sb.append(L.tr("मैच ख़त्म. ${names[w]} जीते. ", "Match over. ${names[w]} wins. "))
        }
    }

    fun nextBoard(world: World) {
        world.reset()
        queenState = Q_BOARD
        queenOwner = -1
        owed[0] = 0
        owed[1] = 0
        val t = colour[0]
        colour[0] = colour[1]
        colour[1] = t
        board += 1
        boardOver = false
        cur = if (colour[0] == 1) 0 else 1
    }
}
