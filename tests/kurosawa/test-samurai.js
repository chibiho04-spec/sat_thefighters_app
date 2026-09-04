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
ok.done();
