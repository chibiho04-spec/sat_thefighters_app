// tests/invoice/test-est-display.js — 見積書の見せる番号「受注番号-A/B/C」（2026-11-18）
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
['loadInvStatus', '_estLetterAt', '_estLetterIdx', '_estSiblings', '_estLetterOf', '_nextEstLetter', '_docDisplayNum', '_estParentNums'].forEach(n => (0, eval)(grabFunction(src, n)));
const J = o => JSON.stringify(o);

console.log('=== 記号 ===');
ok(_estLetterAt(0) === 'A' && _estLetterAt(1) === 'B' && _estLetterAt(25) === 'Z' && _estLetterAt(26) === 'Z1', 'A, B … Z の次は Z1');
ok(_estLetterIdx('A') === 0 && _estLetterIdx('c') === 2 && _estLetterIdx('Z1') === 26 && _estLetterIdx('') === -1 && _estLetterIdx('1') === -1, '記号から順番に戻せる');

console.log('\n=== 見せる番号 ===');
global.localStorage = storage({
  'inv_EST-26003': J({ parentNum: 'T26150', estLetter: 'A' }),
  'inv_EST-26007': J({ parentNum: 'T26150', estLetter: 'C' }),       // B は消した
  'trash_EST-26005': J({ inv: { parentNum: 'T26150', estLetter: 'B' } }),
  'inv_EST-26001': J({ docMode: 'estimate' }),                       // 案件の無い昔の見積書
  'inv_EST-26010': J({ parentNum: 'P26120' }),                       // 記号の無い昔の見積書（2枚）
  'inv_EST-26012': J({ parentNum: 'P26120' }),
  'inv_T26150':    J({ lines: [] }),
});
ok(_docDisplayNum('EST-26003') === 'T26150-A' && _docDisplayNum('EST-26007') === 'T26150-C', '案件のある見積書は「受注番号-記号」');
ok(_docDisplayNum('EST-26001') === 'EST-26001', '案件の無い昔の見積書は番号そのまま');
ok(_docDisplayNum('T26150') === 'T26150' && _docDisplayNum('DLV-26003') === 'DLV-26003' && _docDisplayNum('') === '', '請求書・納品書は変えない');
ok(_docDisplayNum('EST-26010') === 'P26120-A' && _docDisplayNum('EST-26012') === 'P26120-B', '記号の無い昔の見積書は EST- 番号の順に A, B');

console.log('\n=== 次の記号 ===');
ok(_nextEstLetter('T26150') === 'D', '消した B（ゴミ箱）も数え、いちばん後ろの次＝D（記号は使い回さない）');
ok(_nextEstLetter('P26120') === 'C', '記号の無い昔の見積書の後ろに続く');
ok(_nextEstLetter('E26999') === 'A', '初めての案件は A');
ok(_nextEstLetter('T26150', 'EST-26007') === 'C', '保存し直す本人は数えない（自分の記号を取り直さない）');
ok(_nextEstLetter('') === 'A', '案件が空でも落ちない');

console.log('\n=== 受注番号の採番で被らない ===');
ok(J(_estParentNums().sort()) === J(['P26120', 'P26120', 'T26150', 'T26150']), '見積書が使っている受注番号を集める（ゴミ箱は除く）');
const exists = grabFunction(src, '_orderNumExists');
ok(/_estParentNums\(\)\.indexOf\(String\(num\)\) >= 0/.test(exists), '受注番号の重複判定に見積書の受注番号も入る（保存時のシート確認も同じ判定を使う）');
global.wsData = {}; global.getSavedProjects = () => [];
(0, eval)(grabFunction(src, 'getNextOrderNum'));
const YY = String(new Date().getFullYear()).slice(-2);
global.localStorage = storage({ 'inv_EST-26020': J({ parentNum: 'T' + YY + '160' }), ['inv_T' + YY + '150']: '{}' });
ok(getNextOrderNum('T') === String(new Date().getFullYear()).slice(-2) + '161', '次の受注番号は、見積書だけが使っている番号の次から');

console.log('\n=== 配線 ===');
const rename = grabFunction(src, 'renameOrderNum');
ok(/k\.indexOf\('inv_EST-'\) !== 0/.test(rename) && /es\.parentNum = newNum;/.test(rename), '案件の受注番号を変えたら、見積書の受注番号も付け替える（見せる番号が一緒に変わる）');
ok(/ro\.textContent = _docDisplayNum\(num\)/.test(grabFunction(src, '_setInvOrderField')), '編集画面の番号は見せる番号');
ok(/escapeHtml\(_docDisplayNum\(it\.num\)\)/.test(grabFunction(src, 'renderDocList')) && /_docDisplayNum\(it\.num\)\)\.toLowerCase\(\)\.includes\(q\)/.test(grabFunction(src, 'renderDocList')), '書類一覧も見せる番号で表示・検索できる');
ok(/const numTxt = _docDisplayNum\(/.test(src), '印刷のファイル名も見せる番号');
ok(/status\.estLetter = _nextEstLetter\(num, newNum\)/.test(grabFunction(src, '_createEstimateFromWS')), 'ワークシートの「見積書」でも記号を付ける');
ok(/if \(mode === 'estimate' && st\.parentNum\) st\.estLetter = _nextEstLetter\(st\.parentNum, newNum\)/.test(grabFunction(src, '_copyInvDocExec')), 'コピーで作る見積書は次の記号');
ok(/!_invIsNew && \/\^\[TEPDB\]\\d\/i\.test\(num\)/.test(grabFunction(src, 'onDocModeBtn')), '未保存の新しい書類で「見積書」を押しても、別の見積書を開きに行かない');

ok(_docDisplayNum('EST-26099', { parentNum: 'T26150', estLetter: 'B' }) === 'T26150-B', 'ゴミ箱の見積書も、渡した中身から「受注番号-記号」で出せる');
const trash = grabFunction(src, 'renderTrashCards');
ok(/escapeHtml\(_docDisplayNum\(num, status\)\)/.test(trash), '削除した書類の一覧も見せる番号');
ok(!/'見積番号 ' \+ num/.test(src), '保存時のお知らせに EST- 番号を出さない');
ok.done();
