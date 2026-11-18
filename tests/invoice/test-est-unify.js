// tests/invoice/test-est-unify.js — 見積書は必ず EST- 番号、受注番号（T/E/P）は請求書と案件だけ（2026-11-16）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
function storage(init) {
  const s = Object.assign({}, init || {});
  const hide = (k, v) => Object.defineProperty(s, k, { value: v, enumerable: false, configurable: true });
  hide('getItem', k => (Object.prototype.propertyIsEnumerable.call(s, k) ? s[k] : null));
  hide('setItem', (k, v) => { s[k] = String(v); });
  hide('removeItem', k => { delete s[k]; });
  return s;
}

console.log('=== 入口：案件の無い見積書も受注番号を選んで作る（2026-11-18） ===');
const blank = grabFunction(src, '_openBlankInvScreen');
ok(/_invIsNew = true;/.test(blank) && /const newNum = 'T' \+ getNextOrderNum\('T'\);/.test(blank) && /_setInvOrderField\(newNum, true\)/.test(blank) && !/generateNewInvNum/.test(blank), 'ホーム・一覧の「新規作成」：見積書も受注番号（T/E/P を選べる）');
const tpl = grabFunction(src, 'createInvoiceFromTemplate');
ok(/_invIsNew = true;/.test(tpl) && /'T' \+ getNextOrderNum\('T'\)/.test(tpl) && !/generateNewInvNum/.test(tpl), '見積書のテンプレートも受注番号を選んで作る');
ok(src.indexOf('function _switchNewDocNumber(') < 0, '種類を変えても番号は付け替えない（受注番号のまま）');

console.log('\n=== 保存：EST- 番号が他の端末と被っていないか ===');
(0, eval)(grabFunction(src, '_renumberNewEstimateIfTaken'));
global.localStorage = storage({ 'inv_EST-26020': '{}' });
const e3 = { 'inv-detail-num': { textContent: 'EST-26020' }, 'inv-screen-num': { textContent: 'EST-26020' }, 'inv-order-readonly': { textContent: 'EST-26020' } };
global.document = { getElementById: id => e3[id] || null };
global.generateNewInvNum = () => 'EST-26021';
ok(_renumberNewEstimateIfTaken('EST-26020') === true && e3['inv-detail-num'].textContent === 'EST-26021' && e3['inv-order-readonly'].textContent === 'EST-26021', '使われていたら空いている EST- 番号に付け替える');
ok(_renumberNewEstimateIfTaken('EST-26099') === false, '空いていればそのまま');
const save = grabFunction(src, 'saveInvDoc');
ok(/if \(_invIsNew && _docMode === 'estimate'\) \{\s*_caselessEstParent = num;\s*num = generateNewInvNum\('estimate'\);/.test(save), '受注番号を選んだ新しい見積書は、保存のとき中身を EST- の書類にする');
ok(/if \(_caselessEstParent\) status\.parentNum = _caselessEstParent;/.test(save) && /status\.estLetter = _nextEstLetter\(status\.parentNum, num\)/.test(save), '受注番号は parentNum に、記号（A）は最初の保存で決める');
ok(/claimNew: _invIsNew && !_caselessEstParent/.test(save), '見積書は受注番号の先取り主張を付けない（EST- のキーで保存するため）');
ok(/if \(_invEstNew && !_invIsNew\) \{[\s\S]*?pullKind\('invoice'\)[\s\S]*?_renumberNewEstimateIfTaken\(num\);\s*saveInvDoc\(\);/.test(save), 'シート最新を取り込んでから確かめ、もう一度保存する');
ok(/status\.fromEstimate = _estLink/.test(save) && /es\.parentNum = num; saveInvStatus\(_estLink, es\)/.test(save), '見積書から作った請求書を保存したら、見積書をその案件に結ぶ');
ok(/if \(_estParent && !String\(status\.parentNum \|\| ''\)\.trim\(\)\) status\.parentNum = _estParent;/.test(save) && /_markCaseEstimated\(_estParent\)/.test(save), '案件の新しい見積書を保存したら parentNum を入れ、案件に「見積書あり」の印');

console.log('\n=== 案件の無い見積書 →「請求書」 ===');
(0, eval)(grabFunction(src, '_buildInvDocCopy'));
(0, eval)(grabFunction(src, '_invCopyParentNum'));
(0, eval)(grabFunction(src, '_openNewInvoiceFromEstimate'));
let shown = null, marks = [];
global._collectInvEditorContent = () => ({ title: '件名', company: 'A社', workDate: '2026/11/20', lines: [{ name: '撮影費', qty: 1, price: 100000 }], discount: 0 });
global._markClean = () => marks.push('clean'); global._markDirty = () => marks.push('dirty');
global._invCopyAnimate = f => f();
global._showInvCopyInEditor = (n, st, ed) => { shown = { n, st, ed }; global._invFromEstimate = ''; };
global._updateInvCopyBanner = () => {};
global.getNextOrderNum = () => '26153';
_openNewInvoiceFromEstimate('EST-26008');
ok(shown.n === 'T26153' && shown.ed === true && shown.st.docMode === 'invoice', '新しい受注番号の請求書（未保存・T/E/P を選べる）');
ok(shown.st.workDate === '2026/11/20' && shown.st.copiedFrom === undefined && shown.st.lines[0].price === 100000, '同じ仕事なので作業日・明細はそのまま。「コピー」扱いにはしない');
ok(_invFromEstimate === 'EST-26008' && marks.includes('dirty'), '元の見積書を控え、未保存として扱う');

console.log('\n=== 案件の見積書を開く ===');
(0, eval)(grabFunction(src, '_openCaseEstimate'));
global._nextEstLetter = () => 'A';
let opened = [];
global._findEstimateForCase = n => (n === 'T26100' ? 'EST-26005' : '');
global._openBlankInvFromWS = (n, a) => opened.push(n + ':' + a);
global._isPanelOpen = () => true;
global.loadInvStatus = () => ({});
global._buildEstimateStatusForCase = n => ({ title: 'WSから', lines: [], parentNum: n, docMode: 'estimate' });
global.generateNewInvNum = () => 'EST-26030';
global.document = { getElementById: () => ({ style: {} }) };
_openCaseEstimate('T26100');
ok(opened[0] === 'EST-26005:estimate', '既に見積書があれば、それを開く（増やさない）');
shown = null; marks = [];
_openCaseEstimate('T26200', { title: '請求書の中身', lines: [{ name: '編集費', qty: 1, price: 50000 }] });
ok(shown.n === 'EST-26030' && shown.ed === false && shown.st.docMode === 'estimate' && shown.st.title === '請求書の中身', '無ければ今の内容で EST- の見積書を作る');
ok(_invEstNew === true && _invEstParent === 'T26200' && marks.includes('dirty'), 'その場では保存せず（保存で確定）、案件を控える');
_openCaseEstimate('T26201', { lines: [] });
ok(shown.st.title === 'WSから', '今の画面が空なら、ワークシートの内容から作る');

console.log('\n=== 配線 ===');
const list = grabFunction(src, 'openDocFromList');
ok(/action === 'estimate' && \/\^\[TEPDB\]\\d\/i\.test\(String\(num\)\) && \(loadInvStatus\(num\) \|\| \{\}\)\.docMode !== 'estimate'/.test(list) && /_openCaseEstimate\(String\(num\)\)/.test(list), '見積書一覧で案件を選ぶと、その案件の EST- 見積書（昔の受注番号の見積書はそのまま）');
ok(/\$\{\(\/\^EST-\/\.test\(rawNum\) \|\| type === 'estimate'\) \? '見積No\.' : '受注No\.'\} \$\{num\}/.test(src) && /const num      = escapeHtml\(_docDisplayNum\(rawNum\)\)/.test(src), '印刷物：見積書は「見積No. T26150-A」');
const fld = grabFunction(src, '_setInvOrderField');
ok(/lb\.textContent = \/\^EST-\/\.test\(String\(num \|\| ''\)\) \? '見積番号' : '受注番号'/.test(fld) && /_invEstNew = false;/.test(fld) && /_invEstParent = '';/.test(fld) && /_invFromEstimate = '';/.test(fld), '編集画面の見出しも「見積番号」。開き直すたびに控えを消す');
ok(src.indexOf('var _invEstNew') > 0 && src.indexOf('var _invEstNew') < src.indexOf('function _setInvOrderField('), '控えの変数は使う関数より前で宣言');
const banner = grabFunction(src, '_updateInvCopyBanner');
ok(/_invFromEstimate \|\| st\.fromEstimate/.test(banner), '見積書から作った請求書には目印の帯');
ok(/_createEstimateFromWS\(num\)/.test(grabFunction(src, 'openEstimateFromWS')) && /_buildEstimateStatusForCase\(num\)/.test(grabFunction(src, '_createEstimateFromWS')), 'ワークシートの「見積書」ボタンは今までどおり（中身の作り方を共通化）');

ok.done();
