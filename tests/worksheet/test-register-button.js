// tests/worksheet/test-register-button.js — 受注ノート登録ボタンの「処理中」表示
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

const btn = { textContent: '✚ 登録してワークシートを入力する →', disabled: false, style: {}, dataset: {} };
global.document = { getElementById: (id) => (id === 'np-register-btn' ? btn : null) };
global.console = Object.assign({}, console, { warn: () => {} });
let alerts = []; global.alert = (m) => alerts.push(m);
eval(grabFunction(src, '_setBtnBusy'));      // _setRegisterBusy はこれを使う
eval(grabFunction(src, '_setRegisterBusy'));
eval('async ' + grabFunction(src, 'registerNewProject')); // grabFunction は先頭の async を含めないので付け直す

(async () => {
  console.log('=== 押した瞬間の表示 ===');
  let resolveInner; global._registerNewProjectInner = () => new Promise(r => { resolveInner = r; });
  const p = registerNewProject();
  ok(btn.disabled === true, '押した瞬間にボタンが押せなくなる');
  ok(btn.textContent === '⏳ 登録中… ワークシートを作成しています', '文言が「登録中… ワークシートを作成しています」になる');
  ok(btn.style.cursor === 'wait' && btn.style.opacity === '0.75', '見た目も処理中（薄く・待ちカーソル）');
  const before = btn.textContent;
  await registerNewProject();            // 処理中にもう一度押す
  ok(btn.textContent === before && btn.disabled === true, '処理中の二重押しは無視される');
  resolveInner(); await p;
  ok(btn.disabled === false, '終わったら押せるようになる');
  ok(btn.textContent === '✚ 登録してワークシートを入力する →', '文言が元に戻る');
  ok(btn.style.opacity === '' && btn.style.cursor === '', '見た目も戻る');

  console.log('\n=== 途中で失敗しても戻る ===');
  global._registerNewProjectInner = async () => { throw new Error('boom'); };
  await registerNewProject();
  ok(btn.disabled === false && btn.textContent === '✚ 登録してワークシートを入力する →', '例外が起きてもボタンが戻る（押せなくなったままにならない）');
  ok(alerts.some(m => /登録中にエラー/.test(m)), '例外はユーザーに知らせる');

  console.log('\n=== 入力不足で止まった場合（元の処理が alert して return）===');
  alerts = [];
  global._registerNewProjectInner = async () => { alert('件名を入力してください'); return; };
  await registerNewProject();
  ok(btn.disabled === false, '入力不足で止まってもボタンが戻る');
  ok(alerts[0] === '件名を入力してください', '元の入力チェックの alert はそのまま出る');

  console.log('\n=== 配線 ===');
  ok(/id="np-register-btn"[\s\S]{0,200}onclick="registerNewProject\(\)"/.test(src), 'ボタンに id が付き、入口の関数を呼ぶ');
  ok(/async function _registerNewProjectInner\(\)/.test(src), '元の処理は _registerNewProjectInner に残っている');
  ok(/await _verifyOrderNumFreeRemote\(num, _npPrefix\)/.test(grabFunction(src, '_registerNewProjectInner')), '番号確認（時間のかかる処理）は中身の関数にそのまま');
  ok(/finally \{\s*_setRegisterBusy\(false\);/.test(grabFunction(src, 'registerNewProject')), 'finally で必ず戻す');
  ['_setRegisterBusy', 'registerNewProject', '_registerNewProjectInner'].forEach(fn => {
    const m = src.match(new RegExp('^( *)(async )?function ' + fn + '\\(', 'm'));
    ok(!!m && m[1].length === 2, fn + ' がトップレベル');
  });
  ok.done();
})();
