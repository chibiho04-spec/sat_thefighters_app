// tests/worksheet/test-busy-buttons.js — 通信を待つボタンの「処理中」表示（共通部品と3か所）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const asyncGrab = (n) => 'async ' + grabFunction(src, n);

const els = {};
const mk = (id, text) => (els[id] = { id, textContent: text, disabled: false, style: {}, dataset: {} });
global.document = { getElementById: (id) => els[id] || null };
global.console = Object.assign({}, console, { warn: () => {} });
eval(grabFunction(src, '_setBtnBusy'));
eval(grabFunction(src, '_setRegisterBusy'));

(async () => {
  console.log('=== 共通部品 _setBtnBusy ===');
  const b = mk('x', '💾 保存する');
  _setBtnBusy('x', true, '⏳ 処理中…');
  ok(b.disabled && b.textContent === '⏳ 処理中…' && b.style.cursor === 'wait', 'id で指定して処理中にできる');
  _setBtnBusy(b, false);
  ok(!b.disabled && b.textContent === '💾 保存する' && b.style.cursor === '', '要素で指定して元に戻せる（元の文言を覚えている）');
  _setBtnBusy('nothing', true); ok(true, '存在しない id でも落ちない');
  const r = mk('np-register-btn', '✚ 登録してワークシートを入力する →');
  _setRegisterBusy(true); ok(r.textContent === '⏳ 登録中… ワークシートを作成しています', '登録ボタンは共通部品経由で同じ文言');
  _setRegisterBusy(false); ok(r.textContent === '✚ 登録してワークシートを入力する →', '登録ボタンも戻る');

  console.log('\n=== ワークシート一覧の「🔄 更新」 ===');
  const wb = mk('wsl-refresh-btn', '🔄 更新');
  let release; global.pullKind = () => new Promise(res => { release = res; });
  global._gasUrlOne = () => 'https://script.google.com/x';
  global.renderWorksheetList = () => { calls.render++; }; const calls = { render: 0 };
  eval(asyncGrab('refreshWorksheetListFromSheet'));
  const p = refreshWorksheetListFromSheet();
  ok(wb.disabled && wb.textContent === '🔄 取得中…', '押した瞬間に「🔄 取得中…」で押せなくなる');
  await refreshWorksheetListFromSheet();
  ok(wb.textContent === '🔄 取得中…', '取得中の二重押しは無視');
  release({}); await p;
  ok(!wb.disabled && wb.textContent === '🔄 更新' && calls.render === 1, '終わったら戻り、一覧を描き直す');
  global.pullKind = () => Promise.reject(new Error('x'));
  await refreshWorksheetListFromSheet();
  ok(!wb.disabled && wb.textContent === '🔄 更新', '取得に失敗しても戻る');
  ok(/<button id="wsl-refresh-btn" onclick="refreshWorksheetListFromSheet\(\)"/.test(src), 'ボタンに id が付いている');

  console.log('\n=== 共通の取得（運転記録・取引先・商品・メディアの「🔄 更新」）===');
  const gf = grabFunction(src, '_genericFetch');
  const startIdx = gf.indexOf("setGasStatus('🔄 ' + statusMsgPrefix + '取得中…'");
  ok(startIdx > 0 && startIdx < gf.indexOf('await fetch('), '取りに行く前に「🔄 …取得中…」を出す');
  ok(/if \(showStatus\) setGasStatus\('🔄 '/.test(gf), '表示するのは showStatus のときだけ（裏の自動取得では出さない）');

  console.log('\n=== 請求書の保存（新規の単独書類：番号確認の間）===');
  const sv = grabFunction(src, 'saveInvDoc');
  const busyIdx = sv.indexOf("_setBtnBusy('invd-save-btn', true, '⏳ 受注番号を確認中…')");
  const verifyIdx = sv.indexOf('_verifyOrderNumFreeRemote(num, _invOrderPrefix).then(');
  ok(busyIdx > 0 && busyIdx < verifyIdx, '通信に出る前に「⏳ 受注番号を確認中…」');
  ok(/\.then\(chk => \{\s*_setBtnBusy\('invd-save-btn', false\);/.test(sv), '返ってきたら最初に戻す（衝突の警告や再保存の前）');
  ok(/\.catch\(e => \{ _setBtnBusy\('invd-save-btn', false\);/.test(sv), '通信に失敗しても戻す');
  ok(/id="invd-save-btn"/.test(src), '請求書の保存ボタンに id がある（既存）');

  console.log('\n=== スコープ ===');
  ['_setBtnBusy', '_setRegisterBusy'].forEach(fn => { const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm')); ok(!!m && m[1].length === 2, fn + ' がトップレベル'); });
  ok.done();
})();
