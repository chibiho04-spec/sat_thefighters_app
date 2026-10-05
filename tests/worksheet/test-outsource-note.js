// tests/worksheet/test-outsource-note.js — 未請求の案件は外注費が売上表に載らないことをワークシートに表示（2026-10-05）
const { html, grabFunction, fakeStorage, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
['loadInvStatus', '_wsOutsourceSalesNote'].forEach(n => (0, eval)(grabFunction(src, n)));
global.localStorage = fakeStorage({ inv_P26120: JSON.stringify({ billed: true, lines: [{}] }), inv_T26200: JSON.stringify({ paid: true }), inv_T26136: JSON.stringify({ lines: [] }) });

console.log('=== 注意文を出す／出さない ===');
ok(/未請求/.test(_wsOutsourceSalesNote('T26136', 12500)) && /別の受注番号/.test(_wsOutsourceSalesNote('T26136', 12500)), '未請求で外注費あり → 注意を出す');
ok(/未請求/.test(_wsOutsourceSalesNote('T26999', 5000)), '請求書の記録が無い案件も未請求として注意');
ok(_wsOutsourceSalesNote('P26120', 2500) === '', '請求済みなら出さない');
ok(_wsOutsourceSalesNote('T26200', 2500) === '', '入金済みなら出さない');
ok(_wsOutsourceSalesNote('T26136', 0) === '' && _wsOutsourceSalesNote('T26136', '') === '', '外注費の金額が無ければ出さない');

console.log('\n=== 配線 ===');
ok(/id="wsv-outsource-note"/.test(src) && src.indexOf('id="wsv-outsource-cost"') < src.indexOf('id="wsv-outsource-note"'), '注意欄は外注の合計の下にある');
const view = grabFunction(src, 'renderWsView');
ok(/const note = _wsOutsourceSalesNote\(num, total\);\s*noteEl\.textContent = note;\s*noteEl\.style\.display = note \? 'block' : 'none';/.test(view), '閲覧画面を描くたびに更新（textContent で入れる）');
const m = src.match(/^( *)function _wsOutsourceSalesNote\(/m); ok(!!m && m[1].length === 2, '_wsOutsourceSalesNote がトップレベル');
ok.done();
