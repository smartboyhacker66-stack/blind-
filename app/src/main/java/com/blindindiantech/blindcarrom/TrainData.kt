package com.blindindiantech.blindcarrom

class Station(val hi: String, val en: String, val main: Boolean = false) {
    fun name() = L.tr(hi, en)
}

class Route(val hi: String, val en: String, val stations: List<Station>) {
    fun title() = L.tr(hi, en)
}

/** मुंबई लोकल का डेमो: हार्बर, ट्रांस-हार्बर और सेंट्रल लाइन के हिस्से. */
object TrainData {
    /** हर दो स्टेशनों के बीच की दूरी (मीटर). यह अभी एक समान मान है, असली दूरियाँ बाद में डाली जाएँगी. */
    const val HOP_M = 700f

    private val csmt = Station("छत्रपति शिवाजी महाराज टर्मिनस", "CSMT", true)
    private val masjid = Station("मस्जिद", "Masjid")
    private val sandhurst = Station("सैंडहर्स्ट रोड", "Sandhurst Road")
    private val dockyard = Station("डॉकयार्ड रोड", "Dockyard Road")
    private val reay = Station("रे रोड", "Reay Road")
    private val cotton = Station("कॉटन ग्रीन", "Cotton Green")
    private val sewri = Station("शिवड़ी", "Sewri")
    private val wadala = Station("वडाला रोड", "Wadala Road", true)
    private val gtb = Station("जीटीबी नगर", "GTB Nagar")
    private val chuna = Station("चुनाभट्टी", "Chunabhatti")
    private val kurla = Station("कुर्ला", "Kurla", true)
    private val tilak = Station("तिलक नगर", "Tilak Nagar")
    private val chembur = Station("चेंबूर", "Chembur", true)
    private val govandi = Station("गोवंडी", "Govandi")
    private val mankhurd = Station("मानखुर्द", "Mankhurd", true)
    private val vashi = Station("वाशी", "Vashi", true)
    private val sanpada = Station("सानपाड़ा", "Sanpada")
    private val juinagar = Station("जुईनगर", "Juinagar")
    private val nerul = Station("नेरुल", "Nerul", true)
    private val seawoods = Station("सीवुड्स-दारावे", "Seawoods-Darave")
    private val belapur = Station("सीबीडी बेलापुर", "CBD Belapur", true)
    private val kharghar = Station("खारघर", "Kharghar")
    private val mansarovar = Station("मानसरोवर", "Mansarovar")
    private val khandeshwar = Station("खांडेश्वर", "Khandeshwar")
    private val panvel = Station("पनवेल", "Panvel", true)

    private val kings = Station("किंग्स सर्कल", "King's Circle")
    private val mahim = Station("माहिम", "Mahim", true)
    private val bandra = Station("बांद्रा", "Bandra", true)
    private val khar = Station("खार रोड", "Khar Road")
    private val santacruz = Station("सांताक्रुज", "Santacruz")
    private val vileparle = Station("विलेपार्ले", "Vile Parle")
    private val andheri = Station("अंधेरी", "Andheri", true)
    private val jogeshwari = Station("जोगेश्वरी", "Jogeshwari")
    private val rammandir = Station("राम मंदिर", "Ram Mandir")
    private val goregaon = Station("गोरेगांव", "Goregaon", true)

    private val thane = Station("ठाणे", "Thane", true)
    private val digha = Station("दिघा गांव", "Digha Gaon")
    private val airoli = Station("ऐरोली", "Airoli", true)
    private val rabale = Station("रबाले", "Rabale")
    private val ghansoli = Station("घंसोली", "Ghansoli")
    private val koparkhairane = Station("कोपरखैराने", "Koparkhairane")
    private val turbhe = Station("तुर्भे", "Turbhe", true)

    private val byculla = Station("भायखला", "Byculla", true)
    private val chinchpokli = Station("चिंचपोकली", "Chinchpokli")
    private val curreyRoad = Station("करी रोड", "Currey Road")
    private val parel = Station("परेल", "Parel")
    private val dadar = Station("दादर", "Dadar", true)
    private val matunga = Station("माटुंगा", "Matunga")
    private val sion = Station("सायन", "Sion")
    private val vidyavihar = Station("विद्याविहार", "Vidyavihar")
    private val ghatkopar = Station("घाटकोपर", "Ghatkopar", true)

    private val harbourMain = listOf(csmt, masjid, sandhurst, dockyard, reay, cotton, sewri, wadala)

    val routes: List<Route> = listOf(
        Route(
            "हार्बर लाइन: CSMT से पनवेल", "Harbour line: CSMT to Panvel",
            harbourMain + listOf(gtb, chuna, kurla, tilak, chembur, govandi, mankhurd, vashi, sanpada, juinagar,
                nerul, seawoods, belapur, kharghar, mansarovar, khandeshwar, panvel)
        ),
        Route(
            "हार्बर लाइन: CSMT से गोरेगांव", "Harbour line: CSMT to Goregaon",
            harbourMain + listOf(kings, mahim, bandra, khar, santacruz, vileparle, andheri, jogeshwari, rammandir, goregaon)
        ),
        Route(
            "ट्रांस-हार्बर लाइन: ठाणे से पनवेल", "Trans-Harbour line: Thane to Panvel",
            listOf(thane, digha, airoli, rabale, ghansoli, koparkhairane, turbhe, sanpada, juinagar, nerul,
                seawoods, belapur, kharghar, mansarovar, khandeshwar, panvel)
        ),
        Route(
            "ट्रांस-हार्बर लाइन: ठाणे से वाशी", "Trans-Harbour line: Thane to Vashi",
            listOf(thane, digha, airoli, rabale, ghansoli, koparkhairane, turbhe, sanpada, vashi)
        ),
        Route(
            "सेंट्रल लाइन: CSMT से घाटकोपर", "Central line: CSMT to Ghatkopar",
            listOf(csmt, masjid, sandhurst, byculla, chinchpokli, curreyRoad, parel, dadar, matunga, sion,
                kurla, vidyavihar, ghatkopar)
        )
    )
}
