'use strict';
// Android की res/raw की 79 आवाज़ें और shared/ का सामान Electron के assets में नक़ल करता है. मूल फ़ाइलें छुई नहीं जातीं.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const rawDir = path.join(root, 'app', 'src', 'main', 'res', 'raw');
const outAudio = path.resolve(__dirname, '..', 'assets', 'audio');
const sharedDir = path.join(root, 'shared');
const outShared = path.resolve(__dirname, '..', 'assets');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.mkdirSync(outAudio, { recursive: true });
const manifest = {};
let n = 0;
for (const f of fs.readdirSync(rawDir).sort()) {
  const m = /^(.+)\.(ogg|wav)$/.exec(f);
  if (!m) continue;
  fs.copyFileSync(path.join(rawDir, f), path.join(outAudio, f));
  manifest[m[1]] = m[2];
  n++;
}
fs.writeFileSync(path.join(outAudio, 'manifest.json'), JSON.stringify(manifest));
if (fs.existsSync(sharedDir)) copyDir(sharedDir, outShared);
console.log(`audio: ${n} files, shared: ${fs.existsSync(sharedDir) ? 'ok' : 'none'}`);
if (n === 0) { console.error("ERROR: no audio files found"); process.exitCode = 1; }
