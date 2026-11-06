'use strict';
// Aeroplane Simulator host: opens the shared/aeroplane page in an iframe and passes the uploaded route map (Settings -> Upload Route Map).
(function () {
  Hub.registerGame('aero', {
    label: () => Hub.tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator'),
    key: 'ai',
    mount(root, exit) {
      root.textContent = '';
      const f = document.createElement('iframe');
      f.title = Hub.tr('हवाई जहाज़ सिम्युलेटर', 'Aeroplane Simulator');
      const map = Hub.store.get('route_map', null);
      const route = map && window.RouteMap ? `&route=${encodeURIComponent(RouteMap.serialize(map))}` : '';
      f.src = `../assets/aeroplane/index.html?lang=${Hub.lang}&sound=${Hub.soundOn ? 1 : 0}&voice=${Hub.voiceOn ? 1 : 0}${route}`;
      f.style.cssText = 'width:100%;height:calc(100vh - 24px);border:0;display:block';
      const onMsg = (e) => { if (e.source === f.contentWindow && e.data && e.data.hub === 'back') exit(); };
      window.addEventListener('message', onMsg);
      f.addEventListener('load', () => { try { f.focus(); f.contentWindow.focus(); } catch (e) { /* ignore */ } });
      root.append(f);
      return { destroy() { window.removeEventListener('message', onMsg); f.remove(); } };
    },
  });
})();
