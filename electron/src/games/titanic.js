'use strict';
// Titanic: Survive. The game itself is shared/titanic (also used by Android); this file hosts it in an iframe
// and connects it to the Hub wallet (+1000 for surviving, -100 for losing).
(function () {
  Hub.registerGame('ti', {
    label: () => Hub.tr('Titanic: जीवित रहो', 'Titanic: Survive'),
    key: 'ai',
    mount(root, exit) {
      root.textContent = '';
      const f = document.createElement('iframe');
      f.title = Hub.tr('टाइटैनिक: जीवित रहो', 'Titanic: Survive');
      f.src = `../assets/titanic/index.html?lang=${Hub.lang}&sound=${Hub.soundOn ? 1 : 0}&voice=${Hub.voiceOn ? 1 : 0}`;
      f.style.cssText = 'width:100%;height:calc(100vh - 24px);border:0;display:block';
      const reply = (id, balance) => { try { f.contentWindow.postMessage({ hub: 'wallet-result', id, balance }, '*'); } catch (e) { /* frame closed */ } };
      const onMsg = async (e) => {
        const d = e.data;
        if (e.source !== f.contentWindow || !d) return;
        if (d.hub === 'back') exit();
        else if (d.hub === 'wallet-get') reply(d.id, await Hub.wallet.get());
        else if (d.hub === 'wallet') {
          // Only the two amounts this game is allowed to move.
          if ((d.kind === 'reward' && d.amount === 1000) || (d.kind === 'fine' && d.amount === 100)) reply(d.id, await Hub.wallet.apply(d.kind, d.amount));
          else reply(d.id, null);
        }
      };
      window.addEventListener('message', onMsg);
      f.addEventListener('load', () => { try { f.focus(); f.contentWindow.focus(); } catch (e) { /* ignore */ } });
      root.append(f);
      return { destroy() { window.removeEventListener('message', onMsg); f.remove(); } };
    },
  });
})();
