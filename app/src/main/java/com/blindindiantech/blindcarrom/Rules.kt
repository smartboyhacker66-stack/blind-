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

    fun colourName(c: Int) = if (c == 1) "सफ़ेद" else "काली"

    fun startText(names: Array<String>): String {
        return "${names[0]} ${colourName(colour[0])} गोटियाँ खेलेंगे, " +
            "${names[1]} ${colourName(colour[1])}. ${names[cur]} का टर्न."
    }

    fun modeText(): String =
        if (match25) "असली कैरम नियम, पच्चीस अंक तक का मैच."
        else "सादा खेल, सिर्फ़ एक बोर्ड."

    private fun remainText(world: World): String {
        return "${colourName(colour[0])} गोटियाँ ${world.count(colour[0])} बाकी, " +
            "${colourName(colour[1])} गोटियाँ ${world.count(colour[1])} बाकी."
    }

    fun scoreText(names: Array<String>, world: World): String {
        val s = StringBuilder()
        if (match25) {
            s.append("${names[0]} ${matchScore[0]} अंक, ${names[1]} ${matchScore[1]} अंक. बोर्ड $board. ")
        }
        s.append("${names[0]} की ${world.count(colour[0])} गोटियाँ बाकी, ")
        s.append("${names[1]} की ${world.count(colour[1])} गोटियाँ बाकी.")
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
            sb.append("स्ट्राइकर पॉकेट में गया, फ़ाउल. ")
            for (t in pocketed) giveBack(world, t)
            if (pocketed.isNotEmpty()) sb.append("इस शॉट की गोटियाँ वापस बोर्ड पर रखी गईं. ")
            if (wasPending) {
                giveBack(world, 2)
                queenState = Q_BOARD
                queenOwner = -1
                sb.append("रानी वापस बीच में रखी गई. ")
            }
            if (9 - world.count(o) > 0) {
                giveBack(world, o)
                sb.append("दंड में आपकी एक गोटी वापस बोर्ड पर रखी गई. ")
            } else {
                owed[p] += 1
                sb.append("आपकी कोई गोटी अभी डाली नहीं गई थी, इसलिए अगली गोटी जो आप डालेंगे वह वापस रखी जाएगी. ")
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
                sb.append("पहले के दंड की वजह से यह गोटी वापस बोर्ड पर रखी गई. ")
            }
            keep = false
            if (own > 0) {
                keep = true
                sb.append(if (own == 1) "आपकी गोटी पॉकेट में गई. " else "आपकी $own गोटियाँ पॉकेट में गईं. ")
            }
            if (opp > 0) {
                sb.append(if (opp == 1) "विरोधी की गोटी पॉकेट में गई. " else "विरोधी की $opp गोटियाँ पॉकेट में गईं. ")
            }
            if (wasPending) {
                if (own > 0) {
                    queenState = Q_COVERED
                    lastQueenCovered = true
                    sb.append("रानी कवर हो गई. ")
                } else {
                    giveBack(world, 2)
                    queenState = Q_BOARD
                    queenOwner = -1
                    keep = false
                    sb.append("रानी कवर नहीं हुई, वापस बीच में रखी गई. ")
                }
            }
            if (queenNow) {
                keep = true
                queenOwner = p
                if (own > 0) {
                    queenState = Q_COVERED
                    lastQueenCovered = true
                    sb.append("रानी और आपकी गोटी साथ में गई, रानी कवर हो गई. ")
                } else {
                    queenState = Q_PENDING
                    sb.append("रानी पॉकेट में गई. अब अपनी गोटी डालकर उसे कवर कीजिए. ")
                }
            }
            // रानी से पहले किसी रंग की आख़िरी गोटी नहीं डाली जा सकती
            if (world.count(o) == 0 && queenState == Q_BOARD) {
                giveBack(world, o)
                own--
                sb.append("रानी से पहले आख़िरी गोटी नहीं डाली जा सकती, वह वापस रखी गई. ")
                if (own <= 0 && !queenNow && !wasPending) keep = false
            }
            if (world.count(q) == 0 && queenState == Q_BOARD) {
                giveBack(world, q)
                sb.append("रानी से पहले विरोधी की आख़िरी गोटी नहीं गिनी जाती, वह वापस रखी गई. ")
            }
            if (pocketed.isEmpty()) sb.append("कोई गोटी पॉकेट में नहीं गई. ")
        }

        checkBoardEnd(world, names, sb)
        if (!boardOver) {
            if (!keep) cur = 1 - cur
            sb.append("अब ${names[cur]} का टर्न. ")
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
        sb.append("बोर्ड ख़त्म. ${names[w]} ने बोर्ड जीता. विरोधी की $remaining गोटियाँ बाकी थीं")
        if (bonus > 0) sb.append(", और रानी के तीन अंक")
        sb.append(", कुल $pts अंक. ")
        if (!match25) {
            matchOver = true
            sb.append("खेल ख़त्म. ${names[w]} जीते. ")
        } else if (matchScore[w] >= 25) {
            matchOver = true
            sb.append("मैच ख़त्म. ${names[w]} जीते. ")
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
