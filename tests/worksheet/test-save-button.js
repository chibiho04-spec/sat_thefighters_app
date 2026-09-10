// tests/worksheet/test-save-button.js — ワークシート保存ボタンの表示の流れ
const { html, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

// saveWS の「ボタン表示〜閉じる」部分だけ切り出す
const a = src.indexOf("    const btn = document.getElementById('wsd-save-btn');");
const b = src.indexOf("\n  }\n", src.indexOf("      }, 8000);", a));
const snippet = src.slice(a, b);

// 制御できるタイマー
function makeEnv(pushResults, hasUrl = true) {
  const timers = [];
  const btn = { textContent: '', style: {} };
  const calls = { render: 0, toggle: [] };
  const env = {
    btn, calls, timers,
    document: { getElementById: () => btn },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    _gasUrlOne: () => (hasUrl ? 'https://script.google.com/x' : ''),
    pushKind: (kind) => pushResults[kind] instanceof Error ? Promise.reject(pushResults[kind]) : Promise.resolve(pushResults[kind]),
    pendingAdd: () => {},
    renderWsView: () => { calls.render++; },
    toggleWsEdit: (v) => { calls.toggle.push(v); },
    console: { warn: () => {} },
    num: 'T26001', data: {}, wsData: {}, _now: '2026-09-10T00:00:00Z',
  };
  return env;
}
function run(env) {
  // btn は切り出したコード自身が document.getElementById で取るので引数にしない（二重定義になる）
  const keys = Object.keys(env).filter(k => !['btn', 'calls', 'timers'].includes(k));
  const fn = new Function(...keys, snippet);
  fn(...keys.map(k => env[k]));
}
const flush = () => new Promise(r => setImmediate(r));
const fire = (env, pred) => { const t = env.timers.filter(pred); t.forEach(x => x.fn()); return t.length; };

(async () => {
  console.log('=== 正常：同期成功 ===');
  let env = makeEnv({ order: { ok: true }, child: { ok: true } });
  run(env);
  ok(env.btn.textContent === '📤 同期中…', '押した直後は「📤 同期中…」（保存しました！は出ない）');
  ok(!/保存しました/.test(env.btn.textContent), '同時に「保存しました」を出さない ★今回の要望');
  await flush(); await flush();
  ok(env.btn.textContent === '✓ 保存しました！', '同期が終わったら「✓ 保存しました！」');
  ok(env.calls.toggle.length === 0, 'この時点ではまだ編集画面を閉じていない（見せる時間がある）');
  const closeT = env.timers.find(t => t.ms === 1500);
  ok(!!closeT, '1.5秒見せてから閉じる予約がある');
  closeT.fn();
  ok(env.btn.textContent === '💾 保存する（Sheets同期）' && env.calls.toggle[0] === false && env.calls.render === 1, '閉じるときにボタンを元に戻し、閲覧に切り替える');

  console.log('\n=== 一部失敗 ===');
  env = makeEnv({ order: { ok: true }, child: { ok: false } });
  run(env); await flush(); await flush();
  ok(/一部同期失敗/.test(env.btn.textContent) && /保存済み/.test(env.btn.textContent), '失敗でも「保存済み」と分かる文言');
  ok(env.timers.some(t => t.ms === 2500), '失敗時は少し長め（2.5秒）に見せる');

  console.log('\n=== 送信エラー（例外）===');
  env = makeEnv({ order: new Error('ネットなし'), child: { ok: true } });
  run(env); await flush(); await flush();
  ok(/一部同期失敗|同期エラー/.test(env.btn.textContent), '例外でも文言が出て閉じる予約がある');

  console.log('\n=== 8秒たっても返事が無い ===');
  let hang;
  env = makeEnv({}, true);
  env.pushKind = () => new Promise(r => { hang = r; });
  run(env);
  ok(env.btn.textContent === '📤 同期中…', '返事待ちの間は「同期中…」のまま');
  ok(fire(env, t => t.ms === 8000) === 1, '8秒の安全弁がある');
  ok(/保存しました（同期は続行中）/.test(env.btn.textContent), '打ち切り時は「保存しました（同期は続行中）」');
  const t1200 = env.timers.find(t => t.ms === 1200); ok(!!t1200, 'その後 1.2 秒で閉じる');
  t1200.fn();
  ok(env.calls.toggle[0] === false, '編集画面が閉じる');
  hang({ ok: true }); await flush(); await flush();
  ok(env.btn.textContent === '💾 保存する（Sheets同期）', '遅れて届いた結果で、閉じたあとのボタン文字を上書きしない');

  console.log('\n=== URL未設定 ===');
  env = makeEnv({}, false);
  run(env);
  ok(/保存しました/.test(env.btn.textContent) && !/同期中/.test(env.btn.textContent), 'URL未設定なら同期せず「保存しました」');
  ok(env.timers.some(t => t.ms === 1500), '1.5秒で閉じる');

  console.log('\n=== 古い表示が残っていないか ===');
  ok(!/保存しました！ 📤 同期中/.test(src), '「保存しました！ 同期中…」の同時表示が無い');
  ok(!/'✓ 同期OK'/.test(src), '「同期OK」の表示は無い（保存しました！に統一）');
  ok.done();
})();
