// tests/kurosawa/test-samurai.js — Task 3（ドット絵）・Task 4（パレット差し替え）
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();
eval(grabFunction(src, 'makePixelChar'));

const has = (svg, x, y, w, h, fill) =>
  new RegExp('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>').test(svg);

console.log('=== samurai のドット絵 ===');
const base = { hair: '#4a4a4a', body: '#8b4513', bg: '#3498db', hat: 'samurai' };
const svg = makePixelChar(base);
ok(/^<svg/.test(svg) && /<\/svg>$/.test(svg), 'SVG が返る');
ok(has(svg, 7, 0, 2, 2, '#1a1a1a'), 'ちょんまげ（頭頂 x7-8,y0-1）');
ok(has(svg, 6, 2, 4, 1, '#1a1a1a'), 'ちょんまげの土台（x6-9,y2）');
ok(has(svg, 3, 3, 10, 2, '#1a1a1a'), '髪（x3-12,y3-4）');
ok(has(svg, 3, 5, 1, 3, '#1a1a1a') && has(svg, 12, 5, 1, 3, '#1a1a1a'), 'もみあげ（両側）');
ok(has(svg, 7, 11, 2, 3, '#d0d0d0'), '着物の襟（体の中央 x7-8,y11-13）');
ok(has(svg, 4, 14, 8, 1, '#555555'), '帯（x4-11,y14）');
ok(has(svg, 13, 6, 1, 7, '#eeeeee'), '刀身（x13,y6-12）');
ok(has(svg, 12, 13, 3, 1, '#5a3a1a'), '鍔（x12-14,y13）');
ok(has(svg, 13, 14, 1, 2, '#3a2a1a'), '柄（x13,y14-15）');
ok(svg.indexOf('y="11" width="8" height="5"') < svg.indexOf('fill="#d0d0d0"'), '襟は体の後に描かれる');
ok(svg.indexOf('y="11" width="8" height="5"') < svg.indexOf('fill="#eeeeee"'), '刀は体の後に描かれる');

console.log('\n=== 既存の帽子は変わらない ===');
['helmet', 'cap', 'bandana', 'beret'].forEach(hat => {
  const s2 = makePixelChar(Object.assign({}, base, { hat }));
  ok(!/#eeeeee/.test(s2) && !/y="0" width="2" height="2" fill="#1a1a1a"/.test(s2), hat + ' に刀・ちょんまげが混ざらない');
});
ok(!/#eeeeee/.test(makePixelChar(Object.assign({}, base, { hat: undefined }))), '帽子なしにも混ざらない');
console.log('\n=== _charPalette：川崎＋ONのときだけ武士 ===');
global.localStorage = fakeStorage();
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, '_charPalette'));
const FIGHTERS = grabConst(src, 'SUMO_FIGHTERS');
const kawasaki = FIGHTERS.find(f => f.name === '川崎');
const shin     = FIGHTERS.find(f => f.name === '城間');
ok(!!kawasaki && !!shin, '川崎と城間が SUMO_FIGHTERS にいる');

ok(_charPalette(kawasaki) === kawasaki.palette, 'OFF：川崎は元のパレットそのもの（参照が同じ）');
localStorage.setItem('kurosawa_mode', '1');
const kp = _charPalette(kawasaki);
ok(kp !== kawasaki.palette, 'ON：川崎は別オブジェクト（元を壊さない）');
ok(kp.hat === 'samurai', 'ON：川崎は hat=samurai');
ok(kp.body === '#2c2c2c', 'ON：着物は暗い色');
ok(kp.bg === kawasaki.palette.bg, 'ON：背景色は元のまま');
ok(kawasaki.palette.hat === 'helmet', '元の SUMO_FIGHTERS は書き換わっていない');
ok(_charPalette(shin) === shin.palette, 'ON：城間は元のまま');
FIGHTERS.filter(f => f.name !== '川崎').forEach(f => ok(_charPalette(f) === f.palette, 'ON：' + f.name + ' は元のまま'));
ok(_charPalette(null) == null, 'null を渡しても落ちない');
ok(_charPalette({ name: '川崎' }) == null, 'palette が無いオブジェクトでも落ちない');

console.log('\n=== アバターの入口が全部 _charPalette を通る ===');
ok(!/makePixelChar\(fighter\.palette\)/.test(src), 'makePixelChar(fighter.palette) の直書きが残っていない');
ok(!/makePixelChar\(f\.palette\)/.test(src), 'makePixelChar(f.palette) の直書きが残っていない');
ok((src.match(/makePixelChar\(_charPalette\(/g) || []).length >= 4, '_charPalette 経由が4か所以上');
ok(/function _refreshKurosawaAvatars/.test(src), '_refreshKurosawaAvatars がある');
const asc = grabFunction(src, 'applyStaffToCards');
ok(/_charPalette/.test(asc) && /kzOrig/.test(asc), '漢たちタブは元のSVGを退避して差し替える');
ok(/_refreshKurosawaAvatars\(\)/.test(grabFunction(src, 'applyKurosawaMode')), 'applyKurosawaMode が再描画を呼ぶ');

console.log('\n=== スコープ：トップレベルにあるか（Task 1 の教訓）===');
['_charPalette', '_refreshKurosawaAvatars', 'makeSumoAvatar'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル（字下げ ' + (m ? m[1].length : '?') + '）');
});
ok.done();
