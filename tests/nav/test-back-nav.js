// tests/nav/test-back-nav.js — ブラウザの「戻る」でいちばん手前の画面を閉じる（2026-10-05）
// 擬似の「履歴」と「画面」を用意して、本体の関数を実際に動かす。
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

// ---- 擬似の画面 ----
const els = {};
const mkEl = id => { const c = new Set(); return els[id] = { id, style: { display: 'none', transform: '' }, classList: { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) } }; };
global.document = { getElementById: id => els[id] || null, readyState: 'loading' };
// ---- 擬似の履歴（go は非同期で popstate を出す＝本物と同じ） ----
const H = { entries: [{ state: null }], idx: 0, listeners: [] };
global.history = {
  get state() { return H.entries[H.idx].state; },
  pushState(st) { H.entries = H.entries.slice(0, H.idx + 1); H.entries.push({ state: st }); H.idx++; },
  replaceState(st) { H.entries[H.idx].state = st; },
  go(n) { const to = H.idx + n; if (to < 0 || to >= H.entries.length) return; setTimeout(() => { H.idx = to; H.listeners.forEach(f => f({ state: H.entries[H.idx].state })); }, 0); },
};
const userBack = () => history.go(-1), userForward = () => history.go(1);
global.window = { addEventListener: (t, f) => { if (t === 'popstate') H.listeners.push(f); } };
global.localStorage = { getItem: () => null };
global.MutationObserver = class { constructor(cb) { global._moCb = cb; } observe() {} };
// ---- 本体の部品 ----
const dirty = new Set(); const log = [];
global._isDirty = id => dirty.has(id);
global._NAV_LIST_PANELS = [{ id: 'media-list-screen', close: () => { log.push('close:media'); els['media-list-screen'].style.transform = 'translateX(100%)'; } }];
global._NAV_EDIT_PANELS = [{ id: 'ws-detail-screen', label: 'ワークシート', save: () => {}, close: () => { log.push('close:ws'); els['ws-detail-screen'].style.display = 'none'; } }];
global.hideConfirm = () => { log.push('hideConfirm'); els['confirm-overlay'].style.display = 'none'; };
global.showConfirm = () => { log.push('showConfirm'); els['confirm-overlay'].style.display = 'flex'; };
['closeInvTrash','closeOrderNumEditScreen','closeDupCleanupScreen','closeDashboard','closePrintPreview','closeDatePicker'].forEach(n => { global[n] = () => log.push(n); });
global.closeInvLineModal = () => { log.push('close:modal'); els['inv-line-modal'].classList.remove('open'); };
['media-list-screen','ws-detail-screen','confirm-overlay','inv-line-modal','dashboard-screen','inv-trash-screen'].forEach(mkEl);
els['media-list-screen'].style = { display: '', transform: 'translateX(100%)' };
els['inv-line-modal'].style = { display: '', transform: '' }; els['dashboard-screen'].style = { display: '', transform: '' }; // class で開閉する画面
els['inv-trash-screen'].style = { display: '', transform: 'translateX(100%)' };
(0, eval)(src.match(/const _BK_EXTRA = \[[\s\S]*?\n  \];/)[0].replace('const _BK_EXTRA', 'globalThis._BK_EXTRA'));
(0, eval)("globalThis._bk = { stack: [], depth: 0, ignore: 0, timer: null, on: false };");
['_isPanelOpen','_guardedClose','_bkEntries','_bkIsOpen','_bkRefreshStack','_bkSync','_bkScheduleSync','_bkOnPop','_initBackNav'].forEach(n => (0, eval)(grabFunction(src, n)));

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
const open = { media: () => { els['media-list-screen'].style.transform = 'translateX(0)'; _moCb(); }, ws: () => { els['ws-detail-screen'].style.display = 'flex'; _moCb(); },
               modal: () => { els['inv-line-modal'].classList.add('open'); _moCb(); } };
const state = () => `画面[${_bk.stack.map(s => s.replace(/-screen|-overlay/, '')).join('>')}] しおり${H.idx}`;

(async () => {
  _initBackNav();
  await tick();
  ok(_bk.on && H.idx === 0 && history.state.satDepth === 0, '起動：しおり0枚から始まる');

  console.log('\n=== 開くとしおりが増え、戻るで手前から閉じる ===');
  open.media(); await tick();
  ok(H.idx === 1 && _bk.stack.join() === 'media-list-screen', '一覧を開く → しおり1: ' + state());
  open.ws(); await tick();
  ok(H.idx === 2 && _bk.stack.join() === 'media-list-screen,ws-detail-screen', 'その上にワークシート → しおり2: ' + state());
  userBack(); await tick();
  ok(log.join() === 'close:ws' && H.idx === 1 && _bk.stack.join() === 'media-list-screen', '戻る → ワークシートだけ閉じて一覧に戻る: ' + state());
  userBack(); await tick();
  ok(log.join() === 'close:ws,close:media' && H.idx === 0 && _bk.stack.length === 0, 'もう一度戻る → 一覧も閉じる: ' + state());

  console.log('\n=== 画面のボタンで閉じたら、しおりも抜く ===');
  log.length = 0; open.ws(); await tick();
  els['ws-detail-screen'].style.display = 'none'; _moCb(); await tick();
  ok(H.idx === 0 && _bk.depth === 0 && log.length === 0, '「◀ 戻る」ボタンで閉じる → しおりが残らない（次の戻るで何も起きない）: ' + state());

  console.log('\n=== 閉じてすぐ別の画面を開く（しおりの数は変わらない） ===');
  open.media(); await tick();
  els['media-list-screen'].style.transform = 'translateX(100%)'; els['ws-detail-screen'].style.display = 'flex'; _moCb(); await tick();
  ok(H.idx === 1 && _bk.stack.join() === 'ws-detail-screen', '一覧を閉じてワークシートを開く → しおり1のまま: ' + state());

  console.log('\n=== 編集中（未保存）で戻る → 確認が出て、キャンセルなら留まる ===');
  log.length = 0; dirty.add('ws-detail-screen');
  userBack(); await tick(); _moCb(); await tick();
  ok(log.join() === 'showConfirm' && els['ws-detail-screen'].style.display === 'flex', '確認ダイアログが出て、ワークシートは閉じない');
  ok(H.idx === 2 && _bk.stack.join() === 'ws-detail-screen,confirm-overlay', 'ワークシート＋確認の2枚ぶんのしおりに戻る: ' + state());
  hideConfirm(); _moCb(); await tick();
  ok(H.idx === 1 && _bk.stack.join() === 'ws-detail-screen', 'キャンセル → ワークシートに留まる: ' + state());
  userBack(); await tick(); _moCb(); await tick();
  userBack(); await tick(); _moCb(); await tick();
  ok(els['ws-detail-screen'].style.display === 'flex' && _bk.stack.join() === 'ws-detail-screen' && H.idx === 1, '確認が出ている間の戻る＝キャンセルと同じ: ' + state());
  dirty.clear(); log.length = 0;
  userBack(); await tick(); _moCb(); await tick();
  ok(log.join() === 'close:ws' && H.idx === 0, '未保存でなければそのまま閉じる: ' + state());

  console.log('\n=== class で開閉する画面（明細の編集） ===');
  log.length = 0; open.ws(); await tick(); open.modal(); await tick();
  ok(H.idx === 2 && _bk.stack.join() === 'ws-detail-screen,inv-line-modal', '明細の編集を開く: ' + state());
  userBack(); await tick(); _moCb(); await tick();
  ok(log.join() === 'close:modal' && H.idx === 1, '戻る → 明細の編集だけ閉じる: ' + state());

  console.log('\n=== 進むボタン（閉じた画面は開き直さない・数だけ合わせる） ===');
  userForward(); await tick(); await tick();
  ok(H.idx === 1 && _bk.stack.join() === 'ws-detail-screen' && _bk.depth === 1, '進む → 画面は変えず、しおりの位置を戻す: ' + state());
  userBack(); await tick(); _moCb(); await tick();
  ok(H.idx === 0 && _bk.stack.length === 0, 'そのあとの戻るは普通に効く: ' + state());

  console.log('\n=== 再読み込みで古いしおりが残っていた場合 ===');
  _bk.on = false; H.listeners.length = 0; H.entries = [{ state: { satDepth: 0 } }, { state: { satDepth: 1 } }, { state: { satDepth: 2 } }]; H.idx = 2;
  Object.assign(_bk, { stack: [], depth: 0, ignore: 0 });
  _initBackNav(); await tick(); await tick();
  ok(H.idx === 0 && _bk.depth === 0, '画面が1つも開いていなければ、しおり0枚の位置まで戻す: ' + state());

  console.log('\n=== 配線 ===');
  const ids = ['equip-master-screen','staff-edit-screen','staff-detail-screen','client-master-screen','product-master-screen','media-list-screen','media-cards-screen','simple-ws-list-screen','driving-list-screen','doc-list-screen','inv-template-screen','sales-screen','worksheet-list-screen','order-note-screen','settings-screen','ws-detail-screen','inv-detail-screen','new-project-screen','new-client-screen','new-product-screen','new-simple-ws-screen','new-driving-screen','inv-trash-screen','print-preview-overlay','date-picker-overlay','confirm-overlay','ordernum-edit-screen','dup-cleanup-screen'];
  ok(ids.every(id => { const m = src.match(new RegExp('id="' + id + '"\\s*style="([^"]*)"')); return m && (/translateX\(100%\)/.test(m[1]) || /display:\s*none/.test(m[1])); }), '対象の画面28個は、最初は必ず閉じた状態で書かれている（起動直後に「開いている」と数えない）');
  ok(/_NAV_EDIT_PANELS\.map\(p => \(\{ id: p\.id, close: \(\) => _guardedClose\(p\.id, p\.label, p\.save, p\.close\) \}\)\)/.test(grabFunction(src, '_bkEntries')), '編集画面は「◀ 戻る」と同じ確認つきで閉じる');
  ok(/localStorage\.getItem\('back_nav_off'\) === '1'/.test(grabFunction(src, '_initBackNav')), '止めるスイッチ（back_nav_off）がある');
  ok(!/history\.replaceState\(null,/.test(src), 'ダッシュボードが履歴の状態を消さない');
  ['_bkEntries','_bkIsOpen','_bkRefreshStack','_bkSync','_bkScheduleSync','_bkOnPop','_initBackNav'].forEach(fn => { const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm')); ok(!!m && m[1].length === 2, fn + ' がトップレベル'); });
  ok.done();
})();
