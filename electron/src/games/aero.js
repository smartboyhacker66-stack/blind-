'use strict';
// हवाई जहाज़ सिम्युलेटर का होस्ट: shared/aeroplane का पेज iframe में खोलता है.
(function () {
  Hub.registerGame('aero', {
    label: () => Hub.tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator'),
    key: 'ai',
    mount(root, exit) {
      root.textContent = '';
      const f = document.createElement('iframe');
      f.title = Hub.tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator');
      f.src = `../assets/aeroplane/index.html?lang=${Hub.lang}&sound=${Hub.soundOn ? 1 : 0}&voice=${Hub.voiceOn ? 1 : 0}`;
      f.style.cssText = 'width:100%;height:calc(100vh - 24px);border:0;display:block';
      const onMsg = (e) => { if (e.data && e.data.hub === 'back') exit(); };
      window.addEventListener('message', onMsg);
      f.addEventListener('load', () => { try { f.focus(); f.contentWindow.focus(); } catch (e) { /* अनदेखा */ } });
      root.append(f);
      return { destroy() { window.removeEventListener('message', onMsg); f.remove(); } };
    },
  });
})();
