'use strict';
// Titanic: Survive. Story graph. Every decision has a time limit; when it runs out the scene's `timeout` scene happens.
// Endings: end 'win' pays +1000 rupees, end 'lose' costs 100 rupees (see titanic.js).
(function (root) {
  const REWARD = 1000, PENALTY = 100;
  const scenes = {
    start: {
      limit: 20, timeout: 'frozen',
      hi: '14 अप्रैल 1912, रात के लगभग 11:40. जहाज़ "टाइटैनिक" अटलांटिक में चल रहा है। अचानक एक ज़ोर का झटका लगता है। जहाज़ के तल में पानी भरने लगा है। आप अपने केबिन में हैं।',
      en: 'April 14, 1912, about 11:40 at night. The Titanic is sailing in the Atlantic. Suddenly there is a violent jolt. Water is entering the hull. You are in your cabin.',
      choices: [
        { hi: 'डेक पर जाकर हालात देखें', en: 'Go to the deck and see what is happening', to: 'deck' },
        { hi: 'पहले केबिन में परिवार को जगाएँ', en: 'First wake your family in the cabin', to: 'cabin' },
      ],
    },
    frozen: {
      limit: 12, timeout: 'lost',
      hi: 'आप कुछ मिनट सुन्न खड़े रहे। गलियारे में पानी आने लगा है और समय हाथ से निकल रहा है।',
      en: 'You stood frozen for several minutes. Water is creeping into the corridor and time is slipping away.',
      choices: [
        { hi: 'दौड़कर सीढ़ियों से डेक पर पहुँचें', en: 'Run up the stairs to the deck', to: 'late' },
        { hi: 'केबिन में ही मदद का इंतज़ार करें', en: 'Stay in the cabin and wait for help', to: 'lost' },
      ],
    },
    deck: {
      limit: 15, timeout: 'crowd',
      hi: 'डेक पर अफ़रा-तफ़री है। क्रू कहता है कि सब ठीक है, पर लाइफ़बोट उतर रही हैं। एक अफ़सर सबको शांत रहने को कह रहा है।',
      en: 'The deck is in chaos. The crew says all is fine, but lifeboats are being lowered. An officer asks everyone to stay calm.',
      choices: [
        { hi: 'लाइफ़बोट की लाइन में लगें', en: 'Join the lifeboat line', to: 'boats', pts: 10 },
        { hi: 'भीड़ में आगे निकलने की कोशिश करें', en: 'Try to push ahead through the crowd', to: 'crowd' },
      ],
    },
    cabin: {
      limit: 15, timeout: 'late',
      hi: 'परिवार जाग गया है। बच्चा डर रहा है। सामान इकट्ठा करें, या तुरंत डेक पर चलें?',
      en: 'Your family is awake. A child is frightened. Gather the luggage, or go to the deck right away?',
      choices: [
        { hi: 'सीधे परिवार के साथ डेक पर चलें', en: 'Go to the deck with your family right away', to: 'boats', pts: 5 },
        { hi: 'सामान उठाने में समय लगाएँ', en: 'Spend time gathering luggage', to: 'late' },
      ],
    },
    crowd: {
      limit: 12, timeout: 'lost',
      hi: 'भीड़ बहुत घनी है। आप फँस जाते हैं और आगे नहीं बढ़ पाते।',
      en: 'The crowd is too dense. You get stuck and cannot move forward.',
      choices: [
        { hi: 'वापस लौटकर लाइन में लगें', en: 'Go back and join the line', to: 'boats', pts: 2 },
        { hi: 'पानी की ओर कूदें', en: 'Jump into the water', to: 'lost' },
      ],
    },
    late: {
      limit: 12, timeout: 'lost',
      hi: 'आप देर से डेक पर पहुँचे। ज़्यादातर लाइफ़बोट जा चुकी हैं। बची एक लाइफ़बोट पर जगह कम है।',
      en: 'You reached the deck late. Most lifeboats have gone. One boat is left with little room.',
      choices: [
        { hi: 'परिवार को पहले बिठाने की विनती करें', en: 'Plead for your family to board first', to: 'boats', pts: 5 },
        { hi: 'ख़ुद कूदकर किसी और तरीके से बचने की कोशिश करें', en: 'Jump and try another way to survive', to: 'lost' },
      ],
    },
    boats: {
      limit: 15, timeout: 'rescue',
      hi: 'आपको लाइफ़बोट पर बिठाया जा रहा है। ठंड बहुत है। एक क्रू सदस्य पूछता है कि क्या आप बोट पर बैठेंगे या पानी में रहेंगे?',
      en: 'You are being seated in a lifeboat. It is very cold. A crew member asks whether you will sit in the boat or stay in the water.',
      choices: [
        { hi: 'लाइफ़बोट में बैठें और मदद का इंतज़ार करें', en: 'Sit in the boat and wait for help', to: 'rescue', pts: 20 },
        { hi: 'बोट से उतरकर अपने साथी को ढूँढें', en: 'Get out and look for a companion', to: 'lost' },
      ],
    },
    rescue: {
      end: 'win',
      hi: 'सुबह होते-होते कार्पेथिया जहाज़ पहुँचता है और लाइफ़बोट से लोगों को बचाता है। आप जीवित हैं!',
      en: 'By morning the Carpathia arrives and rescues people from the lifeboats. You are alive!',
    },
    lost: {
      end: 'lose',
      hi: 'आपने ख़तरनाक फ़ैसला लिया। ठंडा पानी और अंधेरा आपको घेर लेता है। यह यात्रा यहीं ख़त्म होती है।',
      en: 'You made a dangerous choice. Cold water and darkness overwhelm you. Your journey ends here.',
    },
    tooLate: {
      end: 'lose',
      hi: 'आख़िरी लाइफ़बोट जा चुकी है। डेक झुक रहा है और बर्फ़ीला पानी ऊपर आ रहा है। बहुत देर हो गई।',
      en: 'The last lifeboat has gone. The deck is tilting and freezing water is rising. It is too late.',
    },
  };
  // Story clock: minutes after the collision (11:40 pm). Real time runs at MIN_PER_SEC story minutes per second.
  const MIN_PER_SEC = 1.5, BOATS_GONE = 130;
  const events = [
    { m: 6, snd: 'water', hi: 'जहाज़ के निचले हिस्से में पानी चढ़ रहा है.', en: 'Water is rising in the lower decks.' },
    { m: 25, snd: 'horn', hi: 'जहाज़ का भोंपू बज रहा है. लाइफ़बोट खोली जा रही हैं.', en: 'The ship\'s horn sounds. The lifeboats are being uncovered.' },
    { m: 50, snd: 'creak', hi: 'पहली लाइफ़बोट उतर चुकी है. जहाज़ आगे की ओर झुक रहा है.', en: 'The first lifeboat is away. The bow is starting to tilt.' },
    { m: 80, snd: 'rocket', hi: 'आसमान में संकट के रॉकेट छूट रहे हैं.', en: 'Distress rockets are bursting in the sky.' },
    { m: 105, snd: 'water', hi: 'आगे का डेक पानी में डूब रहा है.', en: 'The forward deck is going under.' },
    { m: 120, snd: 'creak', hi: 'बहुत कम लाइफ़बोट बची हैं. जल्दी कीजिए.', en: 'Very few lifeboats are left. Hurry.' },
    { m: 130, snd: 'horn', hi: 'आख़िरी लाइफ़बोट चली गई.', en: 'The last lifeboat has gone.' },
    { m: 150, snd: 'creak', hi: 'जहाज़ टूटने की आवाज़ें आ रही हैं.', en: 'The ship is groaning as it breaks apart.' },
    { m: 160, snd: 'sink', hi: 'टाइटैनिक डूब गया.', en: 'The Titanic has sunk.' },
  ];
  const api = { REWARD, PENALTY, MIN_PER_SEC, BOATS_GONE, START: 'start', scenes, events };
  root.TitanicStory = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
