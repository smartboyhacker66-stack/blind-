'use strict';
// Titanic: जीवित रहो. 14-15 अप्रैल 1912 की रात. आपके फ़ैसले कहानी का रास्ता तय करते हैं.
(function () {
  const T = Hub.tr;
  const S = {
    start: {
      hi: '14 अप्रैल 1912, रात के लगभग 11:40. जहाज़ "टाइटैनिक" अटलांटिक में चल रहा है। अचानक एक ज़ोर का झटका लगता है। जहाज़ के तल में पानी भरने लगा है। आप अपने केबिन में हैं।',
      en: 'April 14, 1912, about 11:40 at night. The Titanic is sailing in the Atlantic. Suddenly there is a violent jolt. Water is entering the hull. You are in your cabin.',
      choices: [
        { hi: 'डेक पर जाकर हालात देखें', en: 'Go to the deck and see what is happening', to: 'deck' },
        { hi: 'पहले केबिन में परिवार को जगाएँ', en: 'First wake your family in the cabin', to: 'cabin' },
      ],
    },
    deck: {
      hi: 'डेक पर अफ़रा-तफ़री है। क्रू कहता है कि सब ठीक है, पर लाइफ़बोट उतर रही हैं। एक अफ़सर सबको शांत रहने को कह रहा है।',
      en: 'The deck is in chaos. The crew says all is fine, but lifeboats are being lowered. An officer asks everyone to stay calm.',
      choices: [
        { hi: 'लाइफ़बोट की लाइन में लगें', en: 'Join the lifeboat line', to: 'boats', pts: 10 },
        { hi: 'भीड़ में आगे निकलने की कोशिश करें', en: 'Try to push ahead through the crowd', to: 'crowd' },
      ],
    },
    cabin: {
      hi: 'परिवार जाग गया है। बच्चा डर रहा है। सामान इकट्ठा करें, या तुरंत डेक पर चलें?',
      en: 'Your family is awake. A child is frightened. Gather the luggage, or go to the deck right away?',
      choices: [
        { hi: 'सीधे परिवार के साथ डेक पर चलें', en: 'Go to the deck with your family right away', to: 'boats', pts: 5 },
        { hi: 'सामान उठाने में समय लगाएँ', en: 'Spend time gathering luggage', to: 'late' },
      ],
    },
    crowd: {
      hi: 'भीड़ बहुत घनी है। आप फँस जाते हैं और आगे नहीं बढ़ पाते।',
      en: 'The crowd is too dense. You get stuck and cannot move forward.',
      choices: [
        { hi: 'वापस लौटकर लाइन में लगें', en: 'Go back and join the line', to: 'boats', pts: 2 },
        { hi: 'पानी की ओर कूदें', en: 'Jump into the water', to: 'lost' },
      ],
    },
    late: {
      hi: 'आप देर से डेक पर पहुँचे। ज़्यादातर लाइफ़बोट जा चुकी हैं। बची एक लाइफ़बोट पर जगह कम है।',
      en: 'You reached the deck late. Most lifeboats have gone. One boat is left with little room.',
      choices: [
        { hi: 'परिवार को पहले बिठाने की विनती करें', en: 'Plead for your family to board first', to: 'boats', pts: 5 },
        { hi: 'ख़ुद कूदकर किसी और तरीके से बचने की कोशिश करें', en: 'Jump and try another way to survive', to: 'lost' },
      ],
    },
    boats: {
      hi: 'आपको लाइफ़बोट पर बिठाया जा रहा है। ठंड बहुत है। एक क्रू सदस्य पूछता है कि क्या आप बोट पर बैठेंगे या पानी में रहेंगे?',
      en: 'You are being seated in a lifeboat. It is very cold. A crew member asks whether you will sit in the boat or stay in the water.',
      choices: [
        { hi: 'लाइफ़बोट में बैठें और मदद का इंतज़ार करें', en: 'Sit in the boat and wait for help', to: 'rescue', pts: 20 },
        { hi: 'बोट से उतरकर अपने साथी को ढूँढें', en: 'Get out and look for a companion', to: 'lost' },
      ],
    },
    rescue: {
      hi: 'सुबह होते-होते कार्पेथिया जहाज़ पहुँचता है और लाइफ़बोट से लोगों को बचाता है। आप जीवित हैं!',
      en: 'By morning the Carpathia arrives and rescues people from the lifeboats. You are alive!',
      win: true,
    },
    lost: {
      hi: 'आपने ख़तरनाक फ़ैसला लिया। ठंडा पानी और अंधेरा आपको घेर लेता है। यह यात्रा यहीं ख़त्म होती है।',
      en: 'You made a dangerous choice. Cold water and darkness overwhelm you. Your journey ends here.',
      win: false,
    },
  };

  Hub.registerGame('ti', {
    label: () => T('Titanic: जीवित रहो', 'Titanic: Survive'),
    key: 'ai',
    mount(root, exit) {
      let score = 0;
      function scene(id) {
        root.textContent = '';
        const s = S[id];
        Hub.heading(root, T('Titanic', 'Titanic'));
        Hub.para(root, T(s.hi, s.en));
        Hub.say(T(s.hi, s.en));
        if (s.win !== undefined) {
          Hub.para(root, T(`कुल अंक: ${score}`, `Total score: ${score}`));
          Hub.button(root, T('फिर से खेलें', 'Play again'), 'start', () => { score = 0; scene('start'); });
          Hub.button(root, T('वापस', 'Back'), 'back', exit);
          return;
        }
        s.choices.forEach((c) => {
          Hub.button(root, T(c.hi, c.en), 'start', () => { score += c.pts || 0; scene(c.to); });
        });
        Hub.button(root, T('खेल छोड़ें', 'Leave the game'), 'back', exit);
      }
      scene('start');
      return { destroy() { Hub.stopSpeech(); } };
    },
  });
})();
