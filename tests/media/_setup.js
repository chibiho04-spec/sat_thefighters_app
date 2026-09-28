// tests/media/_setup.js — index.html から関数を切り出して Node で動かす準備（メディア用）
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('../kurosawa/_extract');
const src = html();

// 関数をグローバルに定義する（関数どうしが呼び合えるように間接 eval）
function load(names) { names.forEach(n => (0, eval)(grabFunction(src, n))); }
function loadConst(name) { global[name] = grabConst(src, name); return global[name]; }

// 擬似 localStorage に length / key(i) を足す（_mediaRecords が ws_ キーを走査するため）
function storage(init) {
  const s = fakeStorage(init);
  Object.defineProperty(s, 'length', { get: () => Object.keys(s._store).length });
  s.key = i => Object.keys(s._store)[i] ?? null;
  return s;
}

// 最小の document（getElementById は null＝画面なし）
global.document = { getElementById: () => null, querySelectorAll: () => [], body: { classList: { add(){}, remove(){}, contains(){ return false; } } } };
global.window = global;
global.localStorage = storage();

// 同期まわりのスタブ（呼ばれた回数を数える）
global._calls = { push: [], pendingAdd: [], pendingClear: [] };
global._gasUrlOne = () => '';
global.pushKind = (kind, rows) => { _calls.push.push({ kind, rows }); return Promise.resolve({ ok: true }); };
global.pendingAdd = (kind, id) => { _calls.pendingAdd.push({ kind, id }); };
global.pendingClear = (kind, id) => { _calls.pendingClear.push({ kind, id }); };
global.setGasStatus = () => {};
global._markDirty = () => {};
global.alert = () => {}; global.confirm = () => true; global.prompt = () => '';

// 本体の小さな関数（依存が少ないもの）を先に読む
load(['escapeHtml', '_normalizeForSearch', '_loadConfigRecords', '_saveConfigRecords', '_stampNow',
      'loadWS', 'getSavedProjects', 'getDeletedWS', 'loadSimpleWS', '_getCached', 'getCachedMedia', '_nextId']);
loadConst('CAT_ORDER'); loadConst('CREW_NAMES');

module.exports = { src, load, loadConst, fakeStorage: storage, makeOk, grabFunction, grabConst };
