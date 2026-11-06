'use strict';
// Route map files for the Aeroplane Simulator (uploaded from Settings -> Upload Route Map).
// JSON:  {"name":"Delhi Run","destinationNm":12,"cruiseFt":3500,"waypoints":[{"name":"ALFA","nm":4},{"name":"BRAVO","nm":8}]}
// Text:  route,Delhi Run / destination,12 / cruise,3500 / ALFA,4 / BRAVO,8   (one "name,value" pair per line, # for comments)
(function (root) {
  const L = { minDest: 5, maxDest: 20, minCruise: 2000, maxCruise: 5000, maxWp: 20, maxBytes: 20000, maxName: 40 };
  const DEFAULT = Object.freeze({ name: 'Standard route', destinationNm: 6, cruiseFt: 3000, waypoints: [] });
  const bad = (hi, en) => ({ ok: false, error: { hi, en } });
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, L.maxName);
  const num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN));

  function build(name, dest, cruise, wps) {
    if (!Array.isArray(wps)) return bad('वेपॉइंट की सूची चाहिए.', 'Waypoints must be a list.');
    if (wps.length > L.maxWp) return bad(`ज़्यादा से ज़्यादा ${L.maxWp} वेपॉइंट हो सकते हैं.`, `At most ${L.maxWp} waypoints are allowed.`);
    const out = [];
    for (const w of wps) {
      const wn = clean(w && w.name), nm = num(w && w.nm);
      if (!wn || !isFinite(nm) || nm <= 0) return bad('हर वेपॉइंट का नाम और समुद्री मील में दूरी (शून्य से ज़्यादा) चाहिए.', 'Every waypoint needs a name and a distance in nautical miles above zero.');
      out.push({ name: wn, nm: Math.round(nm * 10) / 10 });
    }
    out.sort((a, b) => a.nm - b.nm);
    let d = num(dest);
    if (!isFinite(d)) d = out.length ? Math.max(L.minDest, Math.ceil(out[out.length - 1].nm + 1)) : DEFAULT.destinationNm;
    let c = num(cruise);
    if (!isFinite(c)) c = DEFAULT.cruiseFt;
    d = Math.round(d * 10) / 10; c = Math.round(c / 100) * 100;
    if (d < L.minDest || d > L.maxDest) return bad(`दूरी ${L.minDest} से ${L.maxDest} समुद्री मील के बीच होनी चाहिए.`, `The route length must be between ${L.minDest} and ${L.maxDest} nautical miles.`);
    if (c < L.minCruise || c > L.maxCruise) return bad(`क्रूज़ ऊँचाई ${L.minCruise} से ${L.maxCruise} फ़ीट के बीच होनी चाहिए.`, `Cruise altitude must be between ${L.minCruise} and ${L.maxCruise} feet.`);
    if (out.length && out[out.length - 1].nm >= d) return bad('हर वेपॉइंट गंतव्य से पहले होना चाहिए.', 'Every waypoint must be before the destination.');
    return { ok: true, map: { name: clean(name) || 'Custom route', destinationNm: d, cruiseFt: c, waypoints: out } };
  }

  function fromText(text) {
    const wps = []; let name = '', dest, cruise;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const m = /^([^,;\t]+)[,;\t]\s*(.*)$/.exec(line);
      if (!m) return bad(`यह पंक्ति समझ नहीं आई: ${clean(line)}`, `Could not read this line: ${clean(line)}`);
      const key = m[1].trim(), val = m[2].trim(), k = key.toLowerCase();
      if (k === 'route' || k === 'name') name = val;
      else if (k === 'destination' || k === 'dest' || k === 'distance') dest = val;
      else if (k === 'cruise' || k === 'altitude') cruise = val;
      else wps.push({ name: key, nm: val });
    }
    return build(name, dest, cruise, wps);
  }

  function parse(text) {
    text = String(text == null ? '' : text).replace(/^﻿/, '').trim();
    if (!text) return bad('फ़ाइल ख़ाली है.', 'The file is empty.');
    if (text.length > L.maxBytes) return bad('फ़ाइल बहुत बड़ी है.', 'The file is too large.');
    if (text[0] === '{') {
      let j;
      try { j = JSON.parse(text); } catch (e) { return bad('JSON पढ़ी नहीं जा सकी.', 'The JSON could not be read.'); }
      if (!j || typeof j !== 'object' || Array.isArray(j)) return bad('JSON एक ऑब्जेक्ट होनी चाहिए.', 'The JSON must be an object.');
      const dest = j.destinationNm !== undefined ? j.destinationNm : (j.destination_nm !== undefined ? j.destination_nm : j.destination);
      const cruise = j.cruiseFt !== undefined ? j.cruiseFt : (j.cruise_ft !== undefined ? j.cruise_ft : j.cruise);
      return build(j.name, dest, cruise, j.waypoints === undefined ? [] : j.waypoints);
    }
    return fromText(text);
  }

  const serialize = (map) => JSON.stringify({ name: map.name, destinationNm: map.destinationNm, cruiseFt: map.cruiseFt, waypoints: map.waypoints });
  function describe(map, hi) {
    const n = map.waypoints.length;
    return hi
      ? `रूट मैप ${map.name}: ${map.destinationNm} समुद्री मील, क्रूज़ ${map.cruiseFt} फ़ीट, ${n} वेपॉइंट.`
      : `Route map ${map.name}: ${map.destinationNm} nautical miles, cruise ${map.cruiseFt} feet, ${n} waypoint${n === 1 ? '' : 's'}.`;
  }

  const api = { LIMITS: L, DEFAULT, parse, serialize, describe };
  root.RouteMap = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
