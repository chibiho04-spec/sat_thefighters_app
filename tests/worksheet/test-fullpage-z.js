// tests/worksheet/test-fullpage-z.js — 全画面モードから戻したとき、元の重なり順（z-index）を失わない（2026-10-05）
// 症状：ワークシートの上部（◀ 一覧 の見出し）が、川崎会長のいる帯の下に隠れて表示されない。
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
['_applyFullPageStyle', '_resetFullPageStyle'].forEach(n => (0, eval)(grabFunction(src, n)));
const mk = z => { const c = new Set(); return { style: { zIndex: z }, dataset: {}, classList: { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) } }; };

console.log('=== 開いて戻す ===');
let ws = mk('175');
_applyFullPageStyle(ws, 9000);
ok(ws.style.zIndex === '9000' && ws.classList.contains('full-page-overlay'), '全画面中は指定の重なり順');
_resetFullPageStyle(ws);
ok(ws.style.zIndex === '175' && !ws.classList.contains('full-page-overlay'), '戻したら元の 175 に戻る（空にしない）');
console.log('\n=== 重ねて全画面にしても元の値を保つ ===');
_applyFullPageStyle(ws, 10000); _applyFullPageStyle(ws, 10010);
_resetFullPageStyle(ws);
ok(ws.style.zIndex === '175', '2回続けて全画面にしても 175 に戻る');
_resetFullPageStyle(ws);
ok(ws.style.zIndex === '175', '全画面でないときの「戻す」は何もしない');
console.log('\n=== 元の値が無い画面 ===');
const el = mk('');
_applyFullPageStyle(el, 9999); _resetFullPageStyle(el);
ok(el.style.zIndex === '', '元が空なら空に戻る');
console.log('\n=== 画面の定義と保険 ===');
ok(/id="ws-detail-screen" style="\s*position:absolute; inset:0; z-index:175;/.test(src), 'ワークシート画面の元の重なり順は 175（上部の帯 80・上部バー 90 より上）');
ok(/if \(ws\.dataset\.pageMode !== '1' && !ws\.style\.zIndex\) ws\.style\.zIndex = '175';/.test(grabFunction(src, 'openWS')), '開くとき、重なり順が消えていたら入れ直す');
ok.done();
