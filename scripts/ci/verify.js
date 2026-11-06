'use strict';
// Fast pre-build checks, run by CI and by scripts/deploy.*: node scripts/ci/verify.js
// 1) every .js file parses  2) route-map rules  3) Titanic story graph  4) server tests (if its dependencies are installed)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'assets']);
let failures = 0;
const ok = (m) => console.log('  ok   ' + m);
const fail = (m, e) => { failures++; console.error('  FAIL ' + m + (e ? '\n       ' + (e.message || e) : '')); };
const test = (name, fn) => { try { fn(); ok(name); } catch (e) { fail(name, e); } };

function walk(dir, out) {
  for (const n of fs.readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, out); else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

console.log('Syntax');
for (const f of walk(root, [])) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail(path.relative(root, f), String(e.stderr || e)); }
}
if (!failures) ok('all JavaScript files parse');

console.log('Route maps');
const RM = require(path.join(root, 'shared/aeroplane/routemap.js'));
test('JSON route is accepted and sorted', () => {
  const r = RM.parse('{"name":"Delhi Run","destinationNm":12,"cruiseFt":3500,"waypoints":[{"name":"B","nm":8},{"name":"A","nm":4}]}');
  assert(r.ok); assert.strictEqual(r.map.waypoints[0].name, 'A'); assert.strictEqual(r.map.destinationNm, 12);
});
test('text route is accepted', () => {
  const r = RM.parse('route,Hop\n# comment\ndestination,9\ncruise,3500\nALFA,3\nBRAVO,6');
  assert(r.ok); assert.strictEqual(r.map.waypoints.length, 2); assert.strictEqual(r.map.cruiseFt, 3500);
});
test('destination inferred from waypoints', () => { const r = RM.parse('A,10\n'); assert(r.ok); assert.strictEqual(r.map.destinationNm, 11); });
for (const [name, text] of [['empty', ''], ['bad json', '{oops'], ['too short', '{"destinationNm":2}'], ['too high', '{"cruiseFt":9000}'],
  ['waypoint past destination', '{"destinationNm":6,"waypoints":[{"name":"X","nm":7}]}'], ['nameless waypoint', '{"waypoints":[{"nm":3}]}'],
  ['garbage line', 'hello world'], ['too big', 'x'.repeat(RM.LIMITS.maxBytes + 1)]]) {
  test('rejects ' + name, () => assert.strictEqual(RM.parse(text).ok, false));
}
test('markup characters are stripped from names', () => { const r = RM.parse('{"name":"<b>Hi\\"</b>","waypoints":[]}'); assert(r.ok); assert(!/[<>"]/.test(r.map.name)); });

console.log('Titanic story');
const T = require(path.join(root, 'shared/titanic/story.js'));
test('reward is +1000 and penalty is 100', () => { assert.strictEqual(T.REWARD, 1000); assert.strictEqual(T.PENALTY, 100); });
test('every link points to a scene and every decision has a timeout', () => {
  for (const [id, sc] of Object.entries(T.scenes)) {
    assert(sc.hi && sc.en, id + ' needs both languages');
    if (sc.end) { assert(['win', 'lose'].includes(sc.end), id); continue; }
    assert(sc.limit >= 8 && sc.limit <= 30, id + ' limit');
    assert(T.scenes[sc.timeout], id + ' timeout target');
    assert(sc.choices.length >= 2, id + ' choices');
    for (const c of sc.choices) { assert(c.hi && c.en, id + ' choice text'); assert(T.scenes[c.to], id + ' -> ' + c.to); }
  }
});
test('a win and a loss are both reachable from the start', () => {
  const seen = new Set(), todo = [T.START];
  while (todo.length) { const id = todo.pop(); if (seen.has(id)) continue; seen.add(id); const sc = T.scenes[id]; if (sc.end) continue; sc.choices.forEach((c) => todo.push(c.to)); todo.push(sc.timeout); }
  assert([...seen].some((i) => T.scenes[i].end === 'win')); assert([...seen].some((i) => T.scenes[i].end === 'lose'));
});
test('events are in order and the boats leave before the ship sinks', () => {
  for (let i = 1; i < T.events.length; i++) assert(T.events[i].m > T.events[i - 1].m);
  assert(T.events.some((e) => e.m === T.BOATS_GONE));
});

console.log('Server');
const srv = path.join(root, 'server');
if (fs.existsSync(path.join(srv, 'test', 'run.js')) && fs.existsSync(path.join(srv, 'node_modules'))) {
  try { execFileSync(process.execPath, ['test/run.js'], { cwd: srv, stdio: 'inherit', timeout: 120000 }); ok('server tests'); } catch (e) { fail('server tests', e); }
} else console.log('  skip server tests (run "npm ci" in server/ to enable)');

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
