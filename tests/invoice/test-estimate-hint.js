// tests/invoice/test-estimate-hint.js — 空の請求書に「見積書の内容を取り込む」案内（2026-10-04・T26135 の件）
const { html, grabFunction, fakeStorage, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
// 本物の localStorage と同じく「Object.keys でデータのキーが取れる」擬似ストレージ（_findEstimateForCase が Object.keys を使うため）
function storage(init) {
  const s = Object.assign({}, init || {});
  const hide = (k, v) => Object.defineProperty(s, k, { value: v, enumerable: false, configurable: true });
  hide('getItem', k => (Object.prototype.propertyIsEnumerable.call(s, k) ? s[k] : null));
  hide('setItem', (k, v) => { s[k] = String(v); });
  hide('removeItem', k => { delete s[k]; });
  return s;
}
['loadInvStatus', '_findEstimateForCase', '_estimateForBlankInvoice'].forEach(n => (0, eval)(grabFunction(src, n)));

const EST = { lines: [{ name: 'スチール撮影費', qty: 1, unit: '式', price: 200000 }, { name: '駐車場代', qty: 1, unit: '式', price: 4800, taxable: false }], parentNum: 'T26135', docMode: 'estimate', company: '株式会社エレファントストーン', contact: '諸見' };
console.log('=== 実際に起きた形（請求書は印だけ・見積書に中身） ===');
global.localStorage = storage({ 'inv_T26135': JSON.stringify({ estimated: true, _updatedAt: '2026-09-03T07:38:46.955Z' }), 'inv_EST-26003': JSON.stringify(EST) });
let hit = _estimateForBlankInvoice('T26135');
ok(hit && hit.num === 'EST-26003' && hit.status.lines.length === 2, '見積書 EST-26003 を見つける');
console.log('\n=== 出さない場合 ===');
global.localStorage = storage({ 'inv_T26135': JSON.stringify({ lines: [{ name: 'a', price: 1, qty: 1 }] }), 'inv_EST-26003': JSON.stringify(EST) });
ok(_estimateForBlankInvoice('T26135') === null, '請求書に明細があれば案内しない');
global.localStorage = storage({ 'inv_EST-26003': JSON.stringify(Object.assign({}, EST, { lines: [{ name: '', price: 0, qty: 1 }, { spacer: true }] })) });
ok(_estimateForBlankInvoice('T26135') === null, '見積書が空なら案内しない');
global.localStorage = storage({ 'inv_EST-26003': JSON.stringify(EST), deleted_inv: JSON.stringify(['EST-26003']) });
ok(_estimateForBlankInvoice('T26135') === null, '削除した見積書は対象外');
global.localStorage = storage({ 'inv_EST-26003': JSON.stringify(EST) });
ok(_estimateForBlankInvoice('T26999') === null && _estimateForBlankInvoice('EST-26003') === null && _estimateForBlankInvoice('') === null, '別の案件・EST 自身・空は対象外');
ok(_estimateForBlankInvoice('T26135').num === 'EST-26003', '請求書のレコード自体が無くても見つける');

console.log('\n=== 配線 ===');
ok(/id="inv-est-hint"/.test(src) && src.indexOf('id="inv-est-hint"') < src.indexOf('class="inv-cards-title">明細'), '案内は明細の上にある');
ok(/_updateInvEstimateHint\(\);/.test(grabFunction(src, 'setDocMode')), '書類を開く／種類を切り替えるたびに更新');
const upd = grabFunction(src, '_updateInvEstimateHint');
ok(/if \(_docMode !== 'invoice'\) return;/.test(upd) && /_collectInvLines\(\)\.filter\(l => !l\.spacer\)\.length > 0\) return;/.test(upd), '請求書モードで、画面の明細が空のときだけ');
ok(/escapeHtml\(hit\.num\)/.test(upd), '番号は escapeHtml を通す');
const imp = grabFunction(src, 'importEstimateIntoInvoice');
ok(/renderInvLines\(\[\], lines, false, st\.discount\)/.test(imp) && /_markDirty\('inv-detail-screen'\)/.test(imp) && !/saveInvStatus|saveInvDoc/.test(imp), '取り込みは画面に入れるだけ（勝手に保存しない）');
['_estimateForBlankInvoice', '_updateInvEstimateHint', 'importEstimateIntoInvoice'].forEach(fn => { const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm')); ok(!!m && m[1].length === 2, fn + ' がトップレベル'); });

console.log('\n=== 印だけの空レコードを新しい時刻で送らない ===');
const cr = grabFunction(src, '_createEstimateFromWS');
ok(/if \(Array\.isArray\(src\.lines\) && src\.lines\.length > 0\) saveInvStatus\(num, src\);\s*else localStorage\.setItem\('inv_' \+ num, JSON\.stringify\(src\)\);/.test(cr), '明細が無い請求書には、時刻を打たず送信もしない形で印だけ付ける');
ok(!/if \(!src\.estimated\) \{ try \{ src\.estimated = true; saveInvStatus\(num, src\); \}/.test(cr), '無条件に saveInvStatus する古い書き方が無い');
ok.done();
