// tests/worksheet/test-open-reset.js — ワークシートを開くとき、保存値の無い欄に前の案件の値が残らない（2026-09-29 本人指摘）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const openWS = grabFunction(src, 'openWS');

console.log('=== テキスト欄 ===');
ok(/if \(el\) el\.value = \(saved\[id\] !== undefined && saved\[id\] !== null\) \? saved\[id\] : '';/.test(openWS), '保存値が無ければ空にする（残さない）');
ok(!/if \(el && saved\[id\] !== undefined\) el\.value = saved\[id\];/.test(openWS), '「あるときだけ入れる」の古い書き方が無い');
['wsd-private','wsd-report','wsd-memo','wsd-shootdate','wsd-crew-extra','wsd-order-amount'].forEach(id =>
  ok(openWS.indexOf("'" + id + "'") >= 0, id + ' が復元リストにある'));

console.log('\n=== 担当クルー ===');
const crew = openWS.slice(openWS.indexOf('crewFields.forEach'), openWS.indexOf('crewFields.forEach') + 700);
ok(/if \(!val\) \{[\s\S]*?sel\.value = '';[\s\S]*?txt\.style\.display = 'none'; txt\.value = '';[\s\S]*?return;/.test(crew), '未定なら選択と自由記入を空へ戻す');
ok(!/if \(!sel \|\| !val\) return;/.test(crew), '「値が無ければ何もしない」の古い書き方が無い');

console.log('\n=== 実際に動かして確認（擬似DOM） ===');
// 前の案件で「報告事項」に文が入った状態 → 保存値の無い案件を開くと空になるか、復元ループだけを取り出して動かす
const loop = openWS.match(/\['wsd-private','wsd-report'[\s\S]*?\}\);/)[0];
const els = {}; ['wsd-private','wsd-report','wsd-memo','wsd-shootdate','wsd-crew-extra','wsd-order-amount'].forEach(id => { els[id] = { value: '前の案件の値' }; });
global.document = { getElementById: id => els[id] || null };
let saved = { 'wsd-memo': '新しいメモ' };
eval(loop);
ok(els['wsd-report'].value === '' && els['wsd-private'].value === '' && els['wsd-memo'].value === '新しいメモ', '保存値の無い欄は空、ある欄は保存値: ' + JSON.stringify(els));
ok.done();
