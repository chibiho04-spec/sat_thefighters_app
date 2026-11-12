// tests/invoice/test-copy-doc.js — 見積書・請求書をコピーして新規作成（2026-11-12）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
['_wsCopyPrefix', '_invCopyParentNum', '_buildInvDocCopy', '_copyInvDocExec', 'copyInvDocAsNew'].forEach(n => (0, eval)(grabFunction(src, n)));

const C = {
  company: '株式会社アドスタッフ博報堂', contact: '山入端', dept: '営業部', honorific: '御中', zip: '900-0000', addr: '那覇市',
  title: '琉球ダイハツ CM改訂', staff: '平岡', workDate: '2026/10/05', memo: '備考\n2行目', docMode: 'estimate', discount: 5000,
  lines: [{ code: 'Z020', name: '編集費', qty: 1, unit: '式', price: 50000, taxable: true, note: 'メモ' }, { spacer: true }], outsourceList: []
};

console.log('=== 見積書のコピー（同じ案件の別パターン） ===');
let st = _buildInvDocCopy(C, 'EST-26011', { parentNum: 'E26082', billed: true, paid: true, estimated: true }, 'estimate', '2026/11/12', '2026-11-12T01:00:00Z', '2026/11/12 10:00:00');
ok(st.docMode === 'estimate' && st.estimated === true && st.parentNum === 'E26082', '見積書のまま・元の案件（parentNum）を引き継ぐ');
ok(st.copiedFrom === 'EST-26011', 'どこからコピーしたかを残す');
ok(st.title === C.title && st.company === C.company && st.contact === '山入端' && st.dept === '営業部' && st.zip === '900-0000' && st.addr === '那覇市' && st.staff === '平岡' && st.memo === C.memo && st.discount === 5000, '宛先・件名・担当・備考・値引きを引き継ぐ');
ok(st.lines.length === 2 && st.lines[0].price === 50000 && st.lines[0].note === 'メモ' && st.lines[0] !== C.lines[0], '明細は数量・単価ごと深いコピー');
ok(st.workDate === '2026/10/05' && st.invDate === '2026/11/12', '見積書は作業日を残し、見積日は今日');
ok(st.billed === undefined && st.paid === undefined, '請求済・入金済は引き継がない');
ok(st._updatedAt === '2026-11-12T01:00:00Z' && st.savedAt === '2026/11/12 10:00:00', 'すぐ保存するので更新時刻を打つ');
st.lines[0].price = 1;
ok(C.lines[0].price === 50000, '元の明細は変わらない');

let st2 = _buildInvDocCopy(C, 'T26150', {}, 'estimate', '2026/11/12', 'x', 'y');
ok(st2.parentNum === 'T26150', '受注番号（T/E/P）で作った見積書のコピーは、その番号を元の案件にする');
ok(_buildInvDocCopy(C, 'EST-26001', {}, 'estimate', '', '', '').parentNum === undefined, '元の案件が分からない見積書は parentNum を付けない');
ok(_invCopyParentNum('D26005', {}) === 'D26005' && _invCopyParentNum('INV-26001', {}) === '', '旧番号 D も元の案件として扱う／INV- は扱わない');

console.log('\n=== 請求書のコピー（似た別の案件） ===');
let st3 = _buildInvDocCopy(Object.assign({}, C, { docMode: 'invoice' }), 'T26139', { parentNum: 'X', billed: true }, 'invoice', '2026/11/12', 'iso', 'loc');
ok(st3.docMode === 'invoice' && st3.workDate === '' && st3.invDate === '2026/11/12', '作業日は空・請求日は今日');
ok(st3.parentNum === undefined && st3.estimated === undefined && st3.billed === undefined, '元の案件・発行状態は付けない');
ok(st3._updatedAt === undefined, '未保存で開くので更新時刻は打たない（保存は saveInvDoc が行う）');
ok(st3.lines.length === 2 && st3.title === C.title, '明細・件名は引き継ぐ');
ok(_buildInvDocCopy(C, 'DLV-26001', { parentNum: 'T26100' }, 'delivery', 'd', 'i', 'l').delivered === true, '納品書のコピーは納品書のまま');

console.log('\n=== 動かしてみる ===');
// 画面・保存まわりの代役
let saved = {}, shown = null, alerts = [], dirty = false, marked = [];
global.document = { getElementById: () => null, querySelector: () => null };
global._collectInvEditorContent = () => JSON.parse(JSON.stringify(C));
global.loadInvStatus = n => ({ 'EST-26011': { parentNum: 'E26082' }, 'T26139': { billed: true } })[n] || {};
global.generateNewInvNum = mode => (mode === 'estimate' ? 'EST-26012' : 'DLV-26003');
global.getNextOrderNum = p => '26151'; // 実物と同じく接頭辞なしの数字を返す
global.saveInvStatus = (n, s) => { saved[n] = s; };
global._showInvCopyInEditor = (n, s, ed) => { shown = { n, s, ed }; global._invCopySrc = ''; };
global._markDirty = () => { marked.push('dirty'); };
global._markClean = () => { marked.push('clean'); };
global.renderDocList = () => {};
global.alert = m => alerts.push(m);
global._invCopySrc = '';

global._docMode = 'estimate';
_copyInvDocExec('EST-26011');
ok(saved['EST-26012'] && saved['EST-26012'].parentNum === 'E26082' && saved['EST-26012'].copiedFrom === 'EST-26011', '見積書：新しい EST- 番号ですぐ保存');
ok(shown.n === 'EST-26012' && shown.ed === false && /EST-26012/.test(alerts[0]), '見積書：コピーの方を開いて知らせる');

saved = {}; alerts = []; marked = [];
global._docMode = 'invoice';
_copyInvDocExec('P26139');
ok(Object.keys(saved).length === 0, '請求書：その場では保存しない（未保存の新規）');
ok(shown.n === 'P26151' && shown.ed === true, '請求書：同じ接頭辞の次の番号・番号は編集可');
ok(_invCopySrc === 'P26139', '請求書：保存時に残すコピー元を控える（画面を作り直した後に入れる）');
ok(marked.includes('dirty') && /まだ保存していません/.test(alerts[0]), '請求書：閉じるときに確認が出るよう「未保存」にする');
_copyInvDocExec('D26005');
ok(shown.n === 'P26151', '旧番号 D の請求書は P で作る');

console.log('\n=== 入口のチェック ===');
alerts = [];
global._isDirty = () => false;
let ran = 0;
const realExec = _copyInvDocExec;
global._copyInvDocExec = () => { ran++; };
global.document = { getElementById: id => (id === 'inv-detail-num' ? { textContent: 'T26139' } : null) };
global._invIsNew = true;
copyInvDocAsNew();
ok(ran === 0 && /保存していない書類はコピーできません/.test(alerts[0]), '新規で未保存の書類はコピーしない');
global._invIsNew = false;
copyInvDocAsNew();
ok(ran === 1, '保存済みならすぐコピー');
let confirmOpts = null;
global._isDirty = () => true;
global.showConfirm = (m, onOk, opts) => { confirmOpts = { m, onOk, opts }; };
copyInvDocAsNew();
ok(ran === 1 && confirmOpts && /保存していない変更/.test(confirmOpts.m) && confirmOpts.opts.middleText, '編集中なら「保存してからコピー／保存せずにコピー」を聞く');
global.saveInvDoc = () => {}; // 保存に失敗して未保存のまま
confirmOpts.opts.onMiddle();
ok(ran === 1, '保存に失敗したらコピーしない');
confirmOpts.onOk();
ok(ran === 2, '「元は保存せずにコピー」ならコピーする');
global._copyInvDocExec = realExec;

console.log('\n=== 配線 ===');
ok(/id="invd-copy-btn"[^>]*onclick="copyInvDocAsNew\(\)"/.test(src), '編集画面の上に「コピーして新規」ボタン');
const save = grabFunction(src, 'saveInvDoc');
ok(/_invIsNew && _invCopySrc && !status\.copiedFrom\) status\.copiedFrom = _invCopySrc/.test(save), '請求書のコピーは保存時に copiedFrom を残す');
const fld = grabFunction(src, '_setInvOrderField');
ok(/_invCopySrc = ''/.test(fld), '別の書類を開いたらコピー元の控えを消す');
ok(src.indexOf("var _invCopySrc") > 0 && src.indexOf("var _invCopySrc") < src.indexOf('function _setInvOrderField('), '控えの変数は使う関数より前で宣言');
const list = grabFunction(src, 'renderDocList');
ok(/status\.copiedFrom/.test(list) && /escapeHtml\(status\.copiedFrom\)/.test(list), '書類一覧に「〇〇からコピー」を出す（エスケープ付き）');
const show = grabFunction(src, '_showInvCopyInEditor');
ok(/setDocMode\(st\.docMode\)/.test(show) && /_setInvOrderField\(num, !!editable\)/.test(show), 'コピー先の種類で画面を開く');

ok.done();
