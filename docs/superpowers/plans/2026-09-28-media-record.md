# メディア（カード）使用記録 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LINE bot でやっていたカード（CFexpress）の持ち出し・使用・バックアップ・返却の記録を、ワークシート（通常＋簡易）で記入し、管理室の「メディア管理」で一覧とカードの現在地を見られるようにする。

**Architecture:** 記録はワークシート本体（`ws_${num}` ／ `simple_ws` の各レコード）の `media` に持ち、既存の同期（`child` / `simpleWS` kind）に乗せる。カードの一覧は `config` kind のキー `mediaCards`（受注分類 `orderTypes` と同じ経路）。記入欄の DOM は `_mediaFormRowsHtml(prefix)` で1か所から生成し、通常WS（prefix `wsd-media`）と簡易WS（prefix `sw-media`）で共用する。管理室の画面はワークシートを走査して一覧を組む（`_mediaRecords()`）。単独の「新規メディア記録」画面は廃止。

**Tech Stack:** 素の HTML/CSS/JS（依存なし・単一ファイル `index.html`）。テストは Node で `index.html` から関数を切り出して実行（`tests/kurosawa/_extract.js` の流儀）。設計書: `docs/superpowers/specs/2026-09-28-media-record-design.md`

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 本体。変更はすべてここ |
| `tests/media/_setup.js` | 切り出し＋スタブの共通準備（各テストが require） |
| `tests/media/test-cards.js` | Task 1：カード一覧（既定・追加・廃棄・選択肢） |
| `tests/media/test-core.js` | Task 1・3：正規化・印刷行・閲覧HTML・日付キー・機材カテゴリの除外 |
| `tests/media/test-structure.js` | Task 2〜8：HTML/JS の配線を正規表現で確認（各タスクで追記） |
| `tests/media/test-records.js` | Task 6：記録の集計・カードの現在地 |
| `tests/media/test-csv.js` | Task 8：CSV の読み取り・重複除外 |
| `tests/media/run.sh` | 上を順に実行 |
| `CLAUDE.md` | Task 9：仕様の追記 |

## コミットの作法（このリポジトリの決まり・必ず守る）

`index.html` には未コミットの「同期ガード強化」（`_pickNewer` 周辺）が残っている。**混ぜない**。
**`git commit -a` は絶対に使わない**（2026-09-28 に一度混入させた）。各タスクのコミットは次の手順。

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ
SP=/tmp/media-commit; mkdir -p "$SP"
# 0) テストが全部通っていること（1本でも落ちたらコミットしない）
for t in tests/kurosawa/test-*.js tests/login/test-*.js tests/staff/test-*.js tests/worksheet/test-*.js tests/media/test-*.js; do node "$t" >/dev/null 2>&1 || { echo "FAIL $t"; exit 1; }; done
# 1) 自分の変更だけをステージ（_pickNewer / _issued / データ保護 を含むハンクは除外）
git diff index.html > "$SP/full.patch"
node -e '
const fs=require("fs");const sp="/tmp/media-commit";
const t=fs.readFileSync(sp+"/full.patch","utf8").split("\n");
const head=[],hunks=[];let i=0;
for(;i<t.length;i++){if(t[i].startsWith("@@"))break;head.push(t[i]);}
let cur=null;for(;i<t.length;i++){if(t[i].startsWith("@@")){if(cur)hunks.push(cur);cur=[t[i]];}else if(cur)cur.push(t[i]);}
if(cur)hunks.push(cur);
const mine=hunks.filter(h=>!/_pickNewer|_issued|データ保護/.test(h.join("\n")));
fs.writeFileSync(sp+"/mine.patch",head.join("\n")+"\n"+mine.map(h=>h.join("\n")).join("\n")+"\n");
console.log("全ハンク:"+hunks.length+" / コミット:"+mine.length);'
git apply --cached "$SP/mine.patch"
git add tests/media          # テストを足したとき
# 2) ステージした版で構文チェック
git show :index.html > "$SP/staged.html"
node -e '
const fs=require("fs");const h=fs.readFileSync("/tmp/media-commit/staged.html","utf8");
const re=/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,o="";while((m=re.exec(h))){o+="\n"+m[1];}
fs.writeFileSync("/tmp/media-commit/staged.js",o);'
node --check /tmp/media-commit/staged.js && echo "構文OK"
# 3) コミット・push
git commit -q -m "<メッセージ>" && git push
git status --short index.html   # " M index.html" が残っていればガード分が作業ツリーに残っている＝正常
```

以下の各タスクの「Commit」はこの手順を指す。

### テストの落とし穴（`tests/kurosawa/_extract.js` の性質）
- `grabFunction` は `async function` の `async` を落とす → `async` の関数はテストで呼ばない
- `eval` した `const` はテストの外に出ない → 定数は `grabConst` で取る
- 関数どうしが呼び合うので、切り出しは **`(0, eval)`（間接 eval）でグローバルに定義**する（`_setup.js` がそうしている）
- トップレベル関数はこのファイルでは **2スペース字下げ**。4以上なら何かの関数の中に入ってしまっている

---

### Task 0: テストの共通準備

**Files:**
- Create: `tests/media/_setup.js`
- Create: `tests/media/run.sh`

- [ ] **Step 1: `_setup.js` を書く**

```js
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
```

- [ ] **Step 2: `run.sh` を書く**

```bash
#!/bin/bash
# tests/media/run.sh — メディア使用記録のテストを順に実行
cd "$(dirname "$0")/../.."
fail=0
for t in tests/media/test-*.js; do
  [ -f "$t" ] || continue
  echo "=== $t ==="
  node "$t" || fail=1
  echo
done
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "FAILED"; exit 1; }
```

- [ ] **Step 3: 空振りを確認**

Run: `chmod +x tests/media/run.sh && node -e "require('./tests/media/_setup.js'); console.log('setup ok', typeof escapeHtml, CREW_NAMES.length)"`
Expected: `setup ok function 10`

- [ ] **Step 4: Commit**（テストだけなので通常の `git add tests/media && git commit && git push`）

```bash
git add tests/media/_setup.js tests/media/run.sh
git commit -m "test(メディア): テスト用の共通準備を追加"
git push
```

---

### Task 1: カード一覧と記録の中核（データ層）

**Files:**
- Modify: `index.html` — `function getCachedMedia() { return _getCached('media_cache'); }` の直後（約 13519 行）
- Test: `tests/media/test-cards.js`, `tests/media/test-core.js`

- [ ] **Step 1: 失敗するテストを書く（カード）**

```js
// tests/media/test-cards.js — カードの一覧（既定・追加・廃棄・選択肢）
const S = require('./_setup');
const ok = S.makeOk();
S.loadConst('_DEFAULT_MEDIA_CARDS');
S.load(['_isValidMediaCardId', 'getMediaCards', '_saveMediaCards', '_addMediaCard', '_setMediaCardRetired', '_mediaCardChoices']);
global.MEDIA_CARDS_CONFIG_KEY = 'mediaCards';

console.log('=== 既定 ===');
global.localStorage = S.fakeStorage();
ok(_DEFAULT_MEDIA_CARDS.length === 6, '既定は6枚');
ok(_DEFAULT_MEDIA_CARDS.map(c => c.id).join(',') === 'CF160_1,CF160_2,CF160_3,CF160_4,CF256_1,CF256_2', 'id が bot と同じ形式');
ok(getMediaCards().length === 6 && getMediaCards()[4].type === 'CFexpress Type A 256GB', '設定が無ければ既定が出る');

console.log('\n=== 設定があればそれを使う ===');
global.localStorage = S.fakeStorage({ app_config_records: JSON.stringify([{ 'キー': 'mediaCards', list: [{ id: 'SD64_1', type: 'SD 64GB', retired: false }, { id: 'bad id', type: '' }] }]) });
ok(getMediaCards().length === 1 && getMediaCards()[0].id === 'SD64_1', '設定の一覧が出る（形式違いの id は捨てる）');
global.localStorage = S.fakeStorage({ app_config_records: JSON.stringify([{ 'キー': 'orderTypes', list: ['配信'] }]) });
ok(getMediaCards().length === 6, '別キーの設定しか無ければ既定');

console.log('\n=== 追加 ===');
global.localStorage = S.fakeStorage(); _calls.push = []; _calls.pendingAdd = [];
ok(_isValidMediaCardId('CF256_3') && !_isValidMediaCardId('CF 256') && !_isValidMediaCardId('') && !_isValidMediaCardId('a'.repeat(21)), 'id の形式チェック');
let r = _addMediaCard('CF256_3', 'CFexpress Type A 256GB');
ok(r.ok && r.card.id === 'CF256_3', '追加できる');
ok(getMediaCards().length === 7 && getMediaCards()[6].id === 'CF256_3', '既定6枚＋1で保存される');
ok(JSON.parse(localStorage.getItem('app_config_records')).some(x => x['キー'] === 'mediaCards'), 'config レコードに書かれる');
ok(_calls.pendingAdd.some(c => c.kind === 'config' && c.id === 'mediaCards'), 'URL未設定なら未送信キューへ');
r = _addMediaCard('CF256_3', '');
ok(!r.ok && /既に/.test(r.error), '重複は拒否');
r = _addMediaCard('CF 1', '');
ok(!r.ok && /英数字/.test(r.error), '形式違いは拒否');
ok(getMediaCards().filter(c => c.id === 'CF256_3').length === 1, '拒否されたときは増えない');

console.log('\n=== 廃棄／復活 ===');
ok(_setMediaCardRetired('CF160_4', true) && getMediaCards().find(c => c.id === 'CF160_4').retired === true, '廃棄できる');
ok(_setMediaCardRetired('CF160_4', false) && getMediaCards().find(c => c.id === 'CF160_4').retired === false, '復活できる');
ok(_setMediaCardRetired('NOPE', true) === false, '無い id は false');

console.log('\n=== 選択ボタンに出すカード ===');
_setMediaCardRetired('CF160_4', true);
let ch = _mediaCardChoices([]);
ok(!ch.some(c => c.id === 'CF160_4'), '廃棄カードは出ない');
ch = _mediaCardChoices(['CF160_4']);
ok(ch.some(c => c.id === 'CF160_4'), '既に選ばれていれば廃棄でも出る');
ch = _mediaCardChoices(['OLD_9']);
ok(ch.some(c => c.id === 'OLD_9' && c.retired), '一覧に無い id が選ばれていれば末尾に出る');
ok(_mediaCardChoices(['CF160_1']).findIndex(c => c.id === 'CF160_1') === 0, '順番は一覧の順');
ok.done();
```

- [ ] **Step 2: 失敗するテストを書く（中核）**

```js
// tests/media/test-core.js — 記録の正規化・印刷行・閲覧HTML・機材カテゴリの除外
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_normalizeMedia', '_mediaHasRecord', '_mediaPrintLine', '_mediaStatusBadges', '_mediaViewHtml']);

console.log('=== 正規化 ===');
let m = _normalizeMedia(null);
ok(Array.isArray(m.out) && m.out.length === 0 && m.bu === false && m.date === '' && m.memo === '', '無ければ空の形');
m = _normalizeMedia({ date: ' 2026/08/17 ', out: ['CF160_1', '', ' CF160_2 '], used: 'x', user: ' 城間', bu: 1, buBy: '平岡', returnBy: '', memo: 'a' });
ok(m.date === '2026/08/17' && m.out.join(',') === 'CF160_1,CF160_2' && m.used.length === 0 && m.user === '城間' && m.bu === true, '空や余白を整える。配列でない used は空');
ok(_mediaHasRecord({ out: ['CF160_1'] }) && _mediaHasRecord({ used: ['CF160_1'] }) && !_mediaHasRecord({ user: '城間' }) && !_mediaHasRecord(null), '記録あり＝持出か使用が1枚以上');

console.log('\n=== 印刷の1行（持ち出しだけ） ===');
ok(_mediaPrintLine({ out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], bu: true, buBy: '平岡', returnBy: '城間' }) === '持ち出し: CF160_1, CF160_2', '持ち出しだけを出す');
ok(_mediaPrintLine({ used: ['CF160_1'] }) === '', '持ち出しが無ければ空');
ok(_mediaPrintLine({ out: ['<b>'] }) === '持ち出し: &lt;b&gt;', 'escapeHtml を通す');

console.log('\n=== 状態バッジ ===');
ok(/返却未/.test(_mediaStatusBadges({ out: ['CF160_1'] })) && !/BU未/.test(_mediaStatusBadges({ out: ['CF160_1'] })), '持出あり・返却者空 → 返却未');
ok(/BU未/.test(_mediaStatusBadges({ out: ['CF160_1'], used: ['CF160_1'], returnBy: '城間' })), '使用あり・BU未');
ok(_mediaStatusBadges({ out: ['CF160_1'], used: ['CF160_1'], returnBy: '城間', bu: true }) === '', '返却済・BU済ならバッジ無し');

console.log('\n=== 閲覧HTML ===');
const v = _mediaViewHtml({ out: ['CF160_1'], used: ['CF160_1'], user: '城間', bu: true, buBy: '平岡', returnBy: '城間', memo: '約80GB' });
ok(/持出:.*CF160_1/.test(v) && /使用:.*CF160_1/.test(v) && /使用者: 城間/.test(v) && /BU: ○ 平岡/.test(v) && /返却: 城間/.test(v) && /約80GB/.test(v), '全項目が出る');
ok(/BU: 未/.test(_mediaViewHtml({ out: ['CF160_1'] })) && /返却: 未/.test(_mediaViewHtml({ out: ['CF160_1'] })), '未の表記');
ok(/&lt;s&gt;/.test(_mediaViewHtml({ out: ['<s>'] })), 'escapeHtml を通す');
ok.done();
```

- [ ] **Step 3: 落ちることを確認**

Run: `node tests/media/test-cards.js; node tests/media/test-core.js`
Expected: `関数が見つからない: _isValidMediaCardId` のエラーで止まる

- [ ] **Step 4: 実装（`getCachedMedia` の直後に挿入）**

```js
  // ===== メディア（カード）使用記録（2026-09-28）=====
  // LINE の「Sat メディア管理 Bot」を卒業し、記録はワークシート本体（ws_ / simple_ws）の media に持つ。
  // 設計: docs/superpowers/specs/2026-09-28-media-record-design.md
  const _DEFAULT_MEDIA_CARDS = [
    { id: 'CF160_1', type: 'CFexpress Type A 160GB', retired: false },
    { id: 'CF160_2', type: 'CFexpress Type A 160GB', retired: false },
    { id: 'CF160_3', type: 'CFexpress Type A 160GB', retired: false },
    { id: 'CF160_4', type: 'CFexpress Type A 160GB', retired: false },
    { id: 'CF256_1', type: 'CFexpress Type A 256GB', retired: false },
    { id: 'CF256_2', type: 'CFexpress Type A 256GB', retired: false }
  ];
  const MEDIA_CARDS_CONFIG_KEY = 'mediaCards'; // config kind のキー（受注分類 orderTypes と同じ経路で全端末共有）
  function _isValidMediaCardId(id) { return /^[A-Za-z0-9_]{1,20}$/.test(String(id || '')); }
  function getMediaCards() {
    let list = null;
    try {
      const r = _loadConfigRecords().find(x => String(x['キー']) === MEDIA_CARDS_CONFIG_KEY);
      if (r && Array.isArray(r.list) && r.list.length) list = r.list;
    } catch (e) {}
    return (list || _DEFAULT_MEDIA_CARDS)
      .map(c => ({ id: String((c && c.id) || '').trim(), type: String((c && c.type) || ''), retired: !!(c && c.retired) }))
      .filter(c => _isValidMediaCardId(c.id));
  }
  function _saveMediaCards(list) {
    const recs = _loadConfigRecords().filter(x => String(x['キー']) !== MEDIA_CARDS_CONFIG_KEY);
    const rec = { 'キー': MEDIA_CARDS_CONFIG_KEY, list: list, _updatedAt: new Date().toISOString() };
    recs.push(rec);
    _saveConfigRecords(recs);
    try {
      if (_gasUrlOne() && typeof pushKind === 'function') {
        pushKind('config', [rec]).then(() => pendingClear('config', MEDIA_CARDS_CONFIG_KEY)).catch(() => pendingAdd('config', MEDIA_CARDS_CONFIG_KEY));
      } else { pendingAdd('config', MEDIA_CARDS_CONFIG_KEY); }
    } catch (e) {}
  }
  // 追加。戻り値 {ok, error, card}。名前変更は付けない（過去の記録に当時の id で残るため。廃棄→新規追加で対応）
  function _addMediaCard(id, type) {
    id = String(id || '').trim(); type = String(type || '').trim();
    if (!_isValidMediaCardId(id)) return { ok: false, error: 'カードの名前は英数字と _ だけ（20文字まで）で入力してください' };
    const list = getMediaCards();
    if (list.some(c => c.id === id)) return { ok: false, error: '「' + id + '」は既にあります' };
    const card = { id, type, retired: false };
    list.push(card);
    _saveMediaCards(list);
    return { ok: true, card };
  }
  function _setMediaCardRetired(id, retired) {
    const list = getMediaCards();
    const c = list.find(x => x.id === id);
    if (!c) return false;
    c.retired = !!retired;
    _saveMediaCards(list);
    return true;
  }
  // 選択ボタンに出すカード：廃棄していないもの＋（廃棄済みでも）既に選ばれているもの＋一覧に無いのに選ばれているもの
  function _mediaCardChoices(selectedIds) {
    const sel = (selectedIds || []).map(s => String(s || '').trim()).filter(Boolean);
    const out = getMediaCards().filter(c => !c.retired || sel.includes(c.id));
    sel.forEach(id => { if (!out.some(c => c.id === id)) out.push({ id, type: '', retired: true }); });
    return out;
  }
  function _normalizeMedia(m) {
    const arr = v => Array.isArray(v) ? v.map(s => String(s || '').trim()).filter(Boolean) : [];
    m = (m && typeof m === 'object') ? m : {};
    return {
      date: String(m.date || '').trim(), out: arr(m.out), used: arr(m.used),
      user: String(m.user || '').trim(), bu: !!m.bu, buBy: String(m.buBy || '').trim(),
      returnBy: String(m.returnBy || '').trim(), memo: String(m.memo || '')
    };
  }
  function _mediaHasRecord(m) { const n = _normalizeMedia(m); return n.out.length > 0 || n.used.length > 0; }
  // 印刷用の1行（持ち出しだけ・本人決定 2026-09-28）。無ければ ''。escapeHtml 済みの文字列を返す
  function _mediaPrintLine(m) {
    const n = _normalizeMedia(m);
    return n.out.length ? '持ち出し: ' + escapeHtml(n.out.join(', ')) : '';
  }
  function _mediaStatusBadges(m) {
    const n = _normalizeMedia(m); const b = [];
    if (n.out.length && !n.returnBy) b.push('<span style="background:#c0392b;color:white;font-size:10px;padding:1px 6px;border-radius:8px;white-space:nowrap;">🔴 返却未</span>');
    if (n.used.length && !n.bu)      b.push('<span style="background:#f39c12;color:white;font-size:10px;padding:1px 6px;border-radius:8px;white-space:nowrap;">🟡 BU未</span>');
    return b.join(' ');
  }
  // 閲覧画面用
  function _mediaViewHtml(m) {
    const n = _normalizeMedia(m); const esc = escapeHtml;
    const row = (lbl, val) => `<div style="padding:2px 0;border-bottom:1px dashed #eee;">${lbl} ${val}</div>`;
    return [
      n.out.length  ? row('📤 持出:', esc(n.out.join(', ')))  : '',
      n.used.length ? row('💾 使用:', esc(n.used.join(', '))) : '',
      row('👤 使用者: ' + esc(n.user || '―') + '　💿 BU: ' + (n.bu ? '○ ' + esc(n.buBy || '') : '未') + '　🔁 返却: ' + (n.returnBy ? esc(n.returnBy) : '未'), _mediaStatusBadges(n)),
      n.memo ? row('📝', esc(n.memo)) : ''
    ].join('');
  }
```

- [ ] **Step 5: 通ることを確認**

Run: `node tests/media/test-cards.js && node tests/media/test-core.js`
Expected: すべて ✅・終了コード 0

- [ ] **Step 6: 構文チェックと既存テスト**

Run: `node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const re=/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,o='';while((m=re.exec(h))){o+='\n'+m[1];}fs.writeFileSync('/tmp/wt.js',o);" && node --check /tmp/wt.js && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**（「コミットの作法」の手順）

メッセージ: `feat(メディア): カード一覧と記録の中核（config 同期・正規化・印刷行）`

---

### Task 2: 記入欄の共通部品（DOM）

**Files:**
- Modify: `index.html` — Task 1 で入れたブロックの直後
- Test: `tests/media/test-structure.js`（新規）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/media/test-structure.js — HTML/JS の配線を正規表現で確認（Task 2〜8 で追記していく）
const S = require('./_setup');
const ok = S.makeOk();
const src = S.src;
const top = fn => { const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm')); return !!m && m[1].length === 2; };

console.log('=== Task 2: 記入欄の共通部品 ===');
['_mediaFormRowsHtml', '_renderMediaCardGroup', '_getMediaCardSel', '_toggleMediaCard', '_copyMediaOutToUsed', '_promptNewMediaCard',
 '_addMediaCardFromForm', '_renderMediaNameGroup', '_pickMediaName', '_onMediaNameInput', '_renderMediaBuGroup', '_pickMediaBu',
 '_getMediaBu', '_renderMediaForm', '_collectMediaForm'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
const rows = S.grabFunction(src, '_mediaFormRowsHtml');
// 名前の3欄（user/buby/return）は nameRow で `${prefix}-${which}` として作られる
['-date"', '-out-group"', '-used-group"', '-bu-group"', '-memo"', '-${which}-group"', '-${which}"'].forEach(id =>
  ok(rows.indexOf('${prefix}' + id) >= 0, '記入欄に ' + id + ' がある'));
["'user'", "'buby'", "'return'"].forEach(w => ok(rows.indexOf(w) >= 0, 'nameRow を ' + w + ' で呼んでいる'));
ok(/持ち出しと同じ/.test(rows), '「持ち出しと同じ」ボタンがある');
ok(/＋ 追加/.test(S.grabFunction(src, '_renderMediaCardGroup')), '持ち出し欄に「＋ 追加」がある');
ok.done();
```

- [ ] **Step 2: 落ちることを確認**

Run: `node tests/media/test-structure.js`
Expected: `_mediaFormRowsHtml がトップレベル` などが ❌

- [ ] **Step 3: 実装（Task 1 のブロックの直後に挿入）**

```js
  // ---- 記入欄（通常WS: prefix 'wsd-media' ／ 簡易WS: prefix 'sw-media'）----
  // 要素 id は `${prefix}-date / -out-group / -used-group / -user-group / -user / -bu-group / -buby-group / -buby / -return-group / -return / -memo`。
  // 中身は _mediaFormRowsHtml で1か所から作り、`${prefix}-body` に最初の描画時に流し込む（HTML を2か所に書かない）。
  function _mediaFormRowsHtml(prefix, screenId) {
    const nameRow = (icon, lbl, which, ph) => `
        <div class="wsd-field-row">
          <label class="wsd-label">${icon} ${lbl}</label>
          <div class="np-btn-group" id="${prefix}-${which}-group" style="margin-top:3px;"></div>
          <input id="${prefix}-${which}" class="wsd-input" type="text" autocomplete="off" placeholder="${ph}" style="margin-top:4px;" oninput="_onMediaNameInput('${prefix}','${which}')">
        </div>`;
    return `
        <div class="wsd-field-row">
          <label class="wsd-label">📅 使用日</label>
          <input id="${prefix}-date" class="wsd-input" type="text" autocomplete="off" placeholder="空なら日程と同じ（例: 2026/08/17, 08/18）">
        </div>
        <div class="wsd-field-row">
          <label class="wsd-label">📤 持ち出したカード</label>
          <div class="np-btn-group" id="${prefix}-out-group" style="margin-top:3px;"></div>
        </div>
        <div class="wsd-field-row">
          <label class="wsd-label">💾 使用したカード <button type="button" onclick="_copyMediaOutToUsed('${prefix}','${screenId}')" style="font-family:'DotGothic16',monospace;font-size:11px;margin-left:8px;padding:3px 8px;border:1px solid #16a085;background:#e8f8f4;color:#117a65;border-radius:3px;cursor:pointer;">持ち出しと同じ</button></label>
          <div class="np-btn-group" id="${prefix}-used-group" style="margin-top:3px;"></div>
        </div>
        ${nameRow('👤', '使用者', 'user', 'または直接入力')}
        <div class="wsd-field-row">
          <label class="wsd-label">💿 バックアップ</label>
          <div class="np-btn-group" id="${prefix}-bu-group" style="margin-top:3px;"></div>
        </div>
        ${nameRow('🧑‍💻', 'バックアップした人', 'buby', 'または直接入力')}
        ${nameRow('🔁', '返却者（空＝返却未）', 'return', 'または直接入力')}
        <div class="wsd-field-row">
          <label class="wsd-label">📝 備考</label>
          <textarea id="${prefix}-memo" class="wsd-textarea" rows="2" placeholder="素材の容量など"></textarea>
        </div>`;
  }
  function _mediaBtn(label, selected, attrs) {
    return `<button type="button" class="np-select-btn${selected ? ' selected' : ''}" ${attrs}>${escapeHtml(label)}</button>`;
  }
  function _renderMediaCardGroup(prefix, which, selectedIds, screenId) {
    const g = document.getElementById(prefix + '-' + which + '-group'); if (!g) return;
    const sel = new Set(selectedIds || []);
    let html = _mediaCardChoices([...sel]).map(c =>
      _mediaBtn(c.id, sel.has(c.id), `data-card="${escapeHtml(c.id)}" title="${escapeHtml(c.type)}" onclick="_toggleMediaCard(this,'${prefix}','${screenId}')"`)).join('');
    if (which === 'out') {
      html += `<button type="button" onclick="_addMediaCardFromForm('${prefix}','${screenId}')" title="新しいカードを追加（全員に同期されます）"
        style="font-family:'DotGothic16',monospace;font-size:13px;padding:6px 12px;border:2px dashed #27ae60;background:#f2fbf5;color:#1a7a40;border-radius:4px;cursor:pointer;">＋ 追加</button>`;
    }
    g.innerHTML = html;
  }
  function _getMediaCardSel(prefix, which) {
    const g = document.getElementById(prefix + '-' + which + '-group'); if (!g) return [];
    return [...g.querySelectorAll('.np-select-btn.selected')].map(b => String(b.dataset.card || '').trim()).filter(Boolean);
  }
  function _afterMediaChange(prefix, screenId) {
    try { _markDirty(screenId); } catch (e) {}
    if (prefix === 'wsd-media') { try { _updateWsdMediaCount(); } catch (e) {} }
  }
  function _toggleMediaCard(btn, prefix, screenId) {
    btn.classList.toggle('selected');
    _afterMediaChange(prefix, screenId);
  }
  function _copyMediaOutToUsed(prefix, screenId) {
    _renderMediaCardGroup(prefix, 'used', _getMediaCardSel(prefix, 'out'), screenId);
    _afterMediaChange(prefix, screenId);
  }
  // 「＋ 追加」の対話（記入欄・カード一覧の両方から使う）。追加できたら card、やめたら null
  function _promptNewMediaCard() {
    const id = (prompt('新しいカードの名前（例：CF256_3）\n英数字と _ だけ。追加すると全員のボタンに同期されます') || '').trim();
    if (!id) return null;
    const type = (prompt('種類（例：CFexpress Type A 256GB）※省略可') || '').trim();
    const r = _addMediaCard(id, type);
    if (!r.ok) { alert(r.error); return null; }
    return r.card;
  }
  function _addMediaCardFromForm(prefix, screenId) {
    const card = _promptNewMediaCard();
    if (!card) return;
    const out = _getMediaCardSel(prefix, 'out'); out.push(card.id);
    _renderMediaCardGroup(prefix, 'out',  out, screenId);
    _renderMediaCardGroup(prefix, 'used', _getMediaCardSel(prefix, 'used'), screenId);
    _afterMediaChange(prefix, screenId);
  }
  // 名前ボタン（単一選択・もう一度押すと解除）＋直接入力。入力欄の値が正
  function _renderMediaNameGroup(prefix, which, value, screenId) {
    const g = document.getElementById(prefix + '-' + which + '-group');
    const inp = document.getElementById(prefix + '-' + which);
    if (inp) inp.value = value || '';
    if (!g) return;
    g.innerHTML = CREW_NAMES.map(n => _mediaBtn(n, n === value, `onclick="_pickMediaName(this,'${prefix}','${which}','${screenId}')"`)).join('');
  }
  function _pickMediaName(btn, prefix, which, screenId) {
    const g = document.getElementById(prefix + '-' + which + '-group');
    const inp = document.getElementById(prefix + '-' + which);
    const wasSel = btn.classList.contains('selected');
    if (g) g.querySelectorAll('.np-select-btn').forEach(b => b.classList.remove('selected'));
    if (!wasSel) btn.classList.add('selected');
    if (inp) inp.value = wasSel ? '' : btn.textContent.trim();
    _afterMediaChange(prefix, screenId);
  }
  function _onMediaNameInput(prefix, which) {
    const g = document.getElementById(prefix + '-' + which + '-group');
    const inp = document.getElementById(prefix + '-' + which);
    const v = inp ? inp.value.trim() : '';
    if (g) g.querySelectorAll('.np-select-btn').forEach(b => b.classList.toggle('selected', v !== '' && b.textContent.trim() === v));
    if (prefix === 'wsd-media') { try { _updateWsdMediaCount(); } catch (e) {} }
  }
  function _renderMediaBuGroup(prefix, bu, screenId) {
    const g = document.getElementById(prefix + '-bu-group'); if (!g) return;
    g.innerHTML = _mediaBtn('未', !bu, `data-bu="0" onclick="_pickMediaBu(this,'${prefix}','${screenId}')"`)
                + _mediaBtn('○ 完了', !!bu, `data-bu="1" onclick="_pickMediaBu(this,'${prefix}','${screenId}')"`);
  }
  function _pickMediaBu(btn, prefix, screenId) {
    const g = document.getElementById(prefix + '-bu-group');
    if (g) g.querySelectorAll('.np-select-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _afterMediaChange(prefix, screenId);
  }
  function _getMediaBu(prefix) {
    const g = document.getElementById(prefix + '-bu-group'); if (!g) return false;
    const s = g.querySelector('.np-select-btn.selected');
    return !!(s && s.dataset.bu === '1');
  }
  // 記入欄に media を流し込む（`${prefix}-body` が空なら中身の HTML を先に作る）
  function _renderMediaForm(prefix, media, screenId) {
    const body = document.getElementById(prefix + '-body');
    if (body && !body.dataset.built) { body.innerHTML = _mediaFormRowsHtml(prefix, screenId); body.dataset.built = '1'; }
    const m = _normalizeMedia(media);
    const d = document.getElementById(prefix + '-date'); if (d) d.value = m.date;
    _renderMediaCardGroup(prefix, 'out',  m.out,  screenId);
    _renderMediaCardGroup(prefix, 'used', m.used, screenId);
    _renderMediaNameGroup(prefix, 'user',   m.user,     screenId);
    _renderMediaBuGroup(prefix, m.bu, screenId);
    _renderMediaNameGroup(prefix, 'buby',   m.buBy,     screenId);
    _renderMediaNameGroup(prefix, 'return', m.returnBy, screenId);
    const memo = document.getElementById(prefix + '-memo'); if (memo) memo.value = m.memo;
  }
  function _collectMediaForm(prefix) {
    const v = id => { const el = document.getElementById(prefix + '-' + id); return el ? String(el.value || '').trim() : ''; };
    return _normalizeMedia({
      date: v('date'), out: _getMediaCardSel(prefix, 'out'), used: _getMediaCardSel(prefix, 'used'),
      user: v('user'), bu: _getMediaBu(prefix), buBy: v('buby'), returnBy: v('return'), memo: v('memo')
    });
  }
```

- [ ] **Step 4: 通ることを確認**

Run: `node tests/media/test-structure.js`
Expected: すべて ✅

- [ ] **Step 5: 構文チェック → Commit**

メッセージ: `feat(メディア): 記入欄の共通部品（カード・名前・BUのボタン群、流し込みと回収）`

---

### Task 3: ワークシート記入画面に組み込む

**Files:**
- Modify: `index.html` — 記入画面 HTML（`#wsd-equip-checklist` の直後・約 6967 行、作業後記入の `#wsd-media` textarea・約 7006 行）
- Modify: `index.html` — `saveWS`（`const fields = [...]` と `data['edit_order'] = ...` の直後）
- Modify: `index.html` — `openWS`（復元リストと `renderEquipChecklist(num, saved.equip || {});` の直後）
- Modify: `index.html` — `renderEquipChecklist`（カテゴリ算出と折りたたみ既定）、`_setWsdEquipOpen` の隣
- Modify: `index.html` — `_hasRealData` 系（`// リスト系・機材選択があれば実データあり` の直前）
- Test: `tests/media/test-structure.js`（追記）, `tests/media/test-core.js`（追記）

- [ ] **Step 1: テストを追記（`test-structure.js` の `ok.done();` の前）**

```js
console.log('\n=== Task 3: ワークシート記入画面 ===');
ok(!/id="wsd-media"/.test(src), '旧「メディア使用記録」textarea（#wsd-media）が無い');
ok(/id="wsd-media-toggle"/.test(src) && /id="wsd-media-body"/.test(src) && /id="wsd-media-count"/.test(src), '折りたたみバーと本体がある');
ok(src.indexOf('id="wsd-equip-checklist"') < src.indexOf('id="wsd-media-toggle"') && src.indexOf('id="wsd-media-body"') < src.indexOf('👤 私物機材'), '機材リストの後・私物機材の前にある');
['_setWsdMediaOpen', 'toggleWsdMedia', '_updateWsdMediaCount', '_wsEquipCats'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
const saveWS = S.grabFunction(src, 'saveWS');
ok(/data\.media = _collectMediaForm\('wsd-media'\)/.test(saveWS) && /data\['wsd-media'\] = ''/.test(saveWS), 'saveWS が media を保存し旧欄を空にする');
ok(!/const fields = \[[^\]]*'wsd-media'/.test(saveWS), 'saveWS の fields から wsd-media を外した');
const openWS = S.grabFunction(src, 'openWS');
ok(/_renderMediaForm\('wsd-media'/.test(openWS) && /saved\['wsd-media'\]/.test(openWS) && /crew_c/.test(openWS), 'openWS が記入欄を復元し、旧欄の文と使用者の初期値を入れる');
const rec = S.grabFunction(src, 'renderEquipChecklist');
ok(/_wsEquipCats\(master, savedEquip\)/.test(rec), '機材チェックリストが _wsEquipCats を使う');
ok(/_setWsdMediaOpen\(open\)/.test(rec), '開閉の既定にメディア欄も含む');
ok(/_mediaHasRecord\(s\.media\)/.test(src.slice(src.indexOf('リスト系・機材選択があれば実データあり') - 300, src.indexOf('リスト系・機材選択があれば実データあり'))), '実データ判定に media を含む');
```

- [ ] **Step 2: テストを追記（`test-core.js` の `ok.done();` の前）**

```js
console.log('\n=== 機材チェックリストから「💾 メディア」を外す ===');
S.load(['_wsEquipCats']); S.loadConst('_EQUIP_CATS_HIDDEN_IN_WS');
const master = [{ id: 'a', cat: '📷 カメラ' }, { id: 'b', cat: '💾 メディア' }, { id: 'c', cat: '🧪 その他独自' }];
let cats = _wsEquipCats(master, {});
ok(cats.includes('📷 カメラ') && !cats.includes('💾 メディア') && cats.includes('🧪 その他独自'), '通常はメディアを出さない（独自カテゴリは末尾に出る）');
cats = _wsEquipCats(master, { b: { checked: true } });
ok(cats.includes('💾 メディア'), '既にチェック済みなら出す（外せるように）');
cats = _wsEquipCats(master, { b: { checked: false } });
ok(!cats.includes('💾 メディア'), 'チェックが外れていれば出さない');
ok(_wsEquipCats([], {}).length === 0, 'マスタが空なら空');
```

- [ ] **Step 3: 落ちることを確認**

Run: `node tests/media/test-structure.js; node tests/media/test-core.js`
Expected: Task 3 の項目が ❌

- [ ] **Step 4: HTML — 折りたたみバーと本体を入れる**

`#wsd-equip-checklist` のブロック

```html
      <div id="wsd-equip-checklist" class="wsd-field-group" style="padding:8px;">
        <!-- JSで動的生成 -->
      </div>
```

の**直後**に挿入:

```html
      <!-- 💾 メディア（カード）使用記録（2026-09-28）。機材リストと同じ折りたたみ。中身は _mediaFormRowsHtml で生成 -->
      <div id="wsd-media-toggle" onclick="toggleWsdMedia()" role="button" tabindex="0"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleWsdMedia();}"
        style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 8px 0;padding:10px 12px;background:#eaf5ee;border:2px solid #27ae60;border-radius:4px;cursor:pointer;font-family:'DotGothic16',monospace;font-size:13px;color:#1a7a40;font-weight:bold;">
        <span style="min-width:0;">💾 メディア<span id="wsd-media-count" style="color:#7f8c8d;font-size:11px;font-weight:normal;margin-left:8px;white-space:nowrap;"></span></span>
        <span id="wsd-media-caret" style="font-size:12px;flex-shrink:0;">▼</span>
      </div>
      <div id="wsd-media-body" class="wsd-field-group" style="display:flex;flex-direction:column;gap:10px;"></div>
```

- [ ] **Step 5: HTML — 作業後記入の旧欄を消す**

```html
      <div class="wsd-field-group">
        <div class="wsd-field-row">
          <label class="wsd-label">💾 メディア使用記録</label>
          <textarea id="wsd-media" class="wsd-textarea" rows="2"
            placeholder="例: SDカード64GB × 2枚使用&#10;素材: 約80GB"></textarea>
        </div>
        <div class="wsd-field-row" style="margin-top:8px;">
          <label class="wsd-label">📝 報告事項</label>
```

を

```html
      <div class="wsd-field-group">
        <div class="wsd-field-row">
          <label class="wsd-label">📝 報告事項</label>
```

にする（「メディア使用記録」は上の新欄へ移した。旧データの文は開いたとき備考へ引き継ぐ）。

- [ ] **Step 6: JS — 開閉と件数（`toggleWsdEquip` の直後に挿入）**

```js
  // 💾 メディア欄の開閉（機材リストと同じ作り・2026-09-28）
  function _setWsdMediaOpen(open) {
    const box = document.getElementById('wsd-media-body');
    if (box) box.style.display = open ? 'flex' : 'none';
    const car = document.getElementById('wsd-media-caret');
    if (car) car.textContent = open ? '▼' : '▶';
  }
  function toggleWsdMedia() {
    const box = document.getElementById('wsd-media-body');
    if (!box) return;
    _setWsdMediaOpen(box.style.display === 'none');
  }
  // 畳んでいても状態が分かるようにバーへ出す
  function _updateWsdMediaCount() {
    const el = document.getElementById('wsd-media-count');
    if (!el) return;
    const m = _collectMediaForm('wsd-media');
    const parts = [m.out.length ? '持出 ' + m.out.length + '枚' : '未記録'];
    if (m.out.length && !m.returnBy) parts.push('🔴 返却未');
    if (m.used.length && !m.bu) parts.push('🟡 BU未');
    el.textContent = parts.join('　');
  }
```

- [ ] **Step 7: JS — 機材カテゴリの除外（`renderEquipChecklist` の直前に挿入し、中を書き換え）**

挿入:

```js
  // ワークシートの機材チェックリストに出すカテゴリ。「💾 メディア」はカードの記録欄に移したので出さない（2026-09-28）。
  // ただし、そのワークシートで既にチェック済みの品目があれば出す（外せなくなるのを防ぐ）。機材マスタ自体は変えない。
  const _EQUIP_CATS_HIDDEN_IN_WS = ['💾 メディア'];
  function _wsEquipCats(master, savedEquip) {
    const cats    = CAT_ORDER.filter(c => master.some(e => e.cat === c));
    const others  = [...new Set(master.map(e => e.cat))].filter(c => !CAT_ORDER.includes(c));
    const eq = savedEquip || {};
    const hasChecked = cat => master.some(e => e.cat === cat && eq[e.id] && eq[e.id].checked);
    return [...cats, ...others].filter(c => !_EQUIP_CATS_HIDDEN_IN_WS.includes(c) || hasChecked(c));
  }
```

`renderEquipChecklist` の先頭

```js
    const master  = loadEquipMaster();
    const cats    = CAT_ORDER.filter(c => master.some(e => e.cat === c));
    const others  = [...new Set(master.map(e => e.cat))].filter(c => !CAT_ORDER.includes(c));
    const allCats = [...cats, ...others];
```

を

```js
    const master  = loadEquipMaster();
    const allCats = _wsEquipCats(master, savedEquip);
```

にする。同じ関数の末尾の

```js
      _setWsdEquipOpen(open);
      _setWsdCrewOpen(open); // 担当クルーも同じ既定（機材と別々にタップで開閉できる）
```

を

```js
      _setWsdEquipOpen(open);
      _setWsdCrewOpen(open); // 担当クルーも同じ既定（機材と別々にタップで開閉できる）
      _setWsdMediaOpen(open); // メディア欄も同じ既定（編集部は畳む）
```

にする。

- [ ] **Step 8: JS — `saveWS`**

```js
    const fields = ['wsd-private','wsd-media','wsd-report','wsd-memo','wsd-shootdate','wsd-order-amount'];
```
を
```js
    const fields = ['wsd-private','wsd-report','wsd-memo','wsd-shootdate','wsd-order-amount'];
```
にし、`data['edit_order']     = _getWsEditOrder();` の直後に

```js
    // 💾 メディア（カード）使用記録（2026-09-28）。旧テキスト欄 wsd-media は開いたとき備考へ引き継いでいるので空にする（二重に残さない）
    data.media = _collectMediaForm('wsd-media');
    data['wsd-media'] = '';
```

- [ ] **Step 9: JS — `openWS`**

復元リスト

```js
    ['wsd-private','wsd-media','wsd-report','wsd-memo','wsd-shootdate','wsd-crew-extra','wsd-order-amount'].forEach(id => {
```
を
```js
    ['wsd-private','wsd-report','wsd-memo','wsd-shootdate','wsd-crew-extra','wsd-order-amount'].forEach(id => {
```
にし、`renderEquipChecklist(num, saved.equip || {});` の直後に

```js
    // 💾 メディア（2026-09-28）：旧テキスト欄の文は備考へ、使用者が空ならカメラマンを初期値に（上書きはしない）
    {
      const m = _normalizeMedia(saved.media);
      if (!m.memo && saved['wsd-media']) m.memo = String(saved['wsd-media']);
      if (!m.user) m.user = saved['crew_c'] || data.crewC || '';
      _renderMediaForm('wsd-media', m, 'ws-detail-screen');
      _updateWsdMediaCount();
    }
```

- [ ] **Step 10: JS — 実データ判定**

`// リスト系・機材選択があれば実データあり` の直前に

```js
    if (typeof _mediaHasRecord === 'function' && _mediaHasRecord(s.media)) return true; // 💾 メディアの記録（2026-09-28）
```

- [ ] **Step 11: 通ることを確認**

Run: `node tests/media/test-structure.js && node tests/media/test-core.js`
Expected: すべて ✅

- [ ] **Step 12: 構文チェック・既存テスト（`tests/worksheet/*` を含む全部）→ Commit**

メッセージ: `feat(ワークシート): 💾 メディア欄を追加（旧メディア使用記録を置換、機材リストからメディアを外す）`

- [ ] **Step 13: 実機確認（本人に依頼）**
ワークシートを開く → 機材リストの下に「💾 メディア」バー → 開くとカードのボタン → 保存 → 開き直して残っている。編集部（松田）でログインすると畳まれている。

---

### Task 4: 閲覧画面と印刷（通常ワークシート）

**Files:**
- Modify: `index.html` — 閲覧画面 HTML（`<!-- レンタル・私物 -->` の `#wsv-rental-section` の直前・約 6731 行）
- Modify: `index.html` — `renderWsView`（`// 私物・レンタル（レンタルは複数行対応…` の直前）
- Modify: `index.html` — `openWorksheetPrint`（`const outsourceTxt = ...` の直後と `${equipTable ? ...}` の行の直後）
- Test: `tests/media/test-structure.js`（追記）

- [ ] **Step 1: テストを追記**

```js
console.log('\n=== Task 4: 閲覧画面と印刷 ===');
ok(/id="wsv-media-section"/.test(src) && /id="wsv-media-val"/.test(src), '閲覧画面に節がある');
ok(src.indexOf('id="wsv-media-section"') < src.indexOf('id="wsv-rental-section"'), 'レンタル/私物の前にある');
const view = S.grabFunction(src, 'renderWsView');
ok(/_mediaViewHtml\(/.test(view) && /wsv-media-section/.test(view), 'renderWsView が節を描く');
const pr = S.grabFunction(src, 'openWorksheetPrint');
ok(/const mediaLine = _mediaPrintLine\(saved2\.media\)/.test(pr), '印刷が持ち出しの1行を作る');
ok(pr.indexOf("secBar('使用機材')") < pr.indexOf("secBar('メディア')") && pr.indexOf("secBar('メディア')") < pr.indexOf("secBar('レンタル・私物')"), '使用機材の直後に出る');
```

- [ ] **Step 2: 落ちることを確認** — Run: `node tests/media/test-structure.js` → Task 4 が ❌

- [ ] **Step 3: HTML — 閲覧画面の節（`<!-- レンタル・私物 -->` の直前に挿入）**

```html
      <!-- 💾 メディア（カード）使用記録（2026-09-28）。記録があるときだけ表示 -->
      <div class="wsv-section" id="wsv-media-section" style="display:none;">
        <div class="wsv-section-title">💾 メディア</div>
        <div id="wsv-media-val" style="font-size:12px;color:var(--text-dark);line-height:1.7;"></div>
      </div>
```

- [ ] **Step 4: JS — `renderWsView`（`// 私物・レンタル（レンタルは複数行対応、外注と同じ表示スタイル）` の直前に挿入）**

```js
    // 💾 メディア（2026-09-28）
    {
      const sec = document.getElementById('wsv-media-section');
      const val = document.getElementById('wsv-media-val');
      if (sec && val) {
        const m = _normalizeMedia(saved.media);
        if (_mediaHasRecord(m)) { sec.style.display = 'block'; val.innerHTML = _mediaViewHtml(m); }
        else sec.style.display = 'none';
      }
    }
```

- [ ] **Step 5: JS — `openWorksheetPrint`**

`.join('\n');`（`outsourceTxt` の末尾）の直後に

```js
    const mediaLine = _mediaPrintLine(saved2.media); // 持ち出しだけ（本人決定 2026-09-28）。escapeHtml 済み
```

HTML の

```js
  ${equipTable ? secBar('使用機材')              + equipTable     : ''}
```

の直後に

```js
  ${mediaLine  ? secBar('メディア')              + `<p style="margin:0;padding:5px 8px;font-size:12pt;line-height:1.8;">${mediaLine}</p>` : ''}
```

- [ ] **Step 6: 通ることを確認 → 構文チェック → Commit**

メッセージ: `feat(ワークシート): 閲覧画面にメディアの節、印刷に「持ち出し」の1行`

- [ ] **Step 7: 実機確認（本人）** 閲覧で節が出る・印刷プレビューに「メディア／持ち出し: …」だけ出る（使用・BU・返却は出ない）

---

### Task 5: 簡易ワークシート

**Files:**
- Modify: `index.html` — 簡易WS HTML（`<div id="sw-equip-checklist" ...></div>` の直後・約 6062 行）
- Modify: `index.html` — `openNewSimpleWS` / `openEditSimpleWS` / `saveSimpleWS` / `openSimpleWSPrint` / `renderSwEquipChecklist`、節のコメント（約 13640 行）
- Test: `tests/media/test-structure.js`（追記）

- [ ] **Step 1: テストを追記**

```js
console.log('\n=== Task 5: 簡易ワークシート ===');
ok(/id="sw-media-body"/.test(src), '簡易WSに記入欄の本体がある');
ok(src.indexOf('id="sw-equip-checklist"') < src.indexOf('id="sw-media-body"') && src.indexOf('id="sw-media-body"') < src.indexOf('id="sw-memo"'), '使用機材の後・備考の前');
ok(/_renderMediaForm\('sw-media', null, 'new-simple-ws-screen'\)/.test(S.grabFunction(src, 'openNewSimpleWS')), '新規で空の記入欄を描く');
const oe = S.grabFunction(src, 'openEditSimpleWS');
ok(/_renderMediaForm\('sw-media'/.test(oe) && /rec\.user/.test(oe), '編集で復元（使用者が空なら簡易WSの使用者）');
const ss = S.grabFunction(src, 'saveSimpleWS');
ok(/const media = _collectMediaForm\('sw-media'\)/.test(ss) && (ss.match(/\bmedia\b/g) || []).length >= 3, '保存が media を持つ（更新・新規の両方）');
ok(/_mediaPrintLine\(_collectMediaForm\('sw-media'\)\)/.test(S.grabFunction(src, 'openSimpleWSPrint')), '印刷に持ち出しの行');
ok(/_wsEquipCats\(master, _swEquip\)/.test(S.grabFunction(src, 'renderSwEquipChecklist')), '簡易WSの機材リストもメディアを出さない');
ok(!/簡易ワークシート（単発の機材使用記録・ローカル保存のみ）/.test(src), '節の古いコメント「ローカル保存のみ」を直した');
```

- [ ] **Step 2: 落ちることを確認** — Run: `node tests/media/test-structure.js` → Task 5 が ❌

- [ ] **Step 3: HTML（`<div id="sw-equip-checklist" class="wsd-field-group" style="padding:8px;"></div>` の直後に挿入）**

```html
      <!-- 💾 メディア（カード）使用記録（2026-09-28）。中身は _mediaFormRowsHtml で生成（通常WSと共通） -->
      <div class="wsd-section-head" style="background:#16a085;text-shadow:1px 1px 0 #0b5345;">💾 メディア</div>
      <div id="sw-media-body" class="wsd-field-group" style="display:flex;flex-direction:column;gap:10px;"></div>
```

- [ ] **Step 4: JS**

`openNewSimpleWS` の `renderSwEquipChecklist();` の直後:
```js
    _renderMediaForm('sw-media', null, 'new-simple-ws-screen');
```

`openEditSimpleWS` の末尾 `renderSwEquipChecklist();` の直後:
```js
    { const m = _normalizeMedia(rec.media); if (!m.user) m.user = rec.user || ''; _renderMediaForm('sw-media', m, 'new-simple-ws-screen'); }
```

`saveSimpleWS`：`const memo = document.getElementById('sw-memo').value.trim();` の直後に
```js
    const media = _collectMediaForm('sw-media'); // 💾 メディア（2026-09-28）
```
更新の行を
```js
        list[idx] = Object.assign({}, list[idx], { date, title, user, content, equip, memo, media, updatedAt: nowIso, _updatedAt: nowIso });
```
新規の行を
```js
      rec = { id: 'sw' + Date.now(), date, title, user, content, equip, memo, media, createdAt: nowIso, updatedAt: nowIso, _updatedAt: nowIso };
```

`openSimpleWSPrint`：`const equipRows = buildSwEquipPrintRows();` の直後に
```js
    const mediaLine = _mediaPrintLine(_collectMediaForm('sw-media')); // 持ち出しだけ（本人決定 2026-09-28）
```
HTML の `${secBar('使用機材')}${equipTable}` の直後に
```js
  ${mediaLine ? secBar('メディア') + `<p style="margin:0;padding:7px 10px;font-size:16pt;line-height:1.8;">${mediaLine}</p>` : ''}
```

`renderSwEquipChecklist` の
```js
    const master  = loadEquipMaster();
    const cats    = CAT_ORDER.filter(c => master.some(e => e.cat === c));
    const others  = [...new Set(master.map(e => e.cat))].filter(c => !CAT_ORDER.includes(c));
    const allCats = [...cats, ...others];
```
を
```js
    const master  = loadEquipMaster();
    const allCats = _wsEquipCats(master, _swEquip);
```

節のコメント `// ===== 簡易ワークシート（単発の機材使用記録・ローカル保存のみ） =====` を
`// ===== 簡易ワークシート（単発の機材使用記録・simpleWS kind で同期） =====` にする。

- [ ] **Step 5: 通ることを確認 → 構文チェック → Commit**

メッセージ: `feat(簡易ワークシート): 💾 メディア欄を追加（保存・印刷・機材リストからメディアを外す）`

- [ ] **Step 6: 実機確認（本人）** 簡易WSで記録→保存→開き直し→印刷

---

### Task 6: 管理室「メディア管理」画面の作り直し（一覧・現在地・更新）＋単独記録画面の廃止

**Files:**
- Modify: `index.html` — `#media-list-screen` の中身と `#new-media-screen`（約 5887〜5985 行）
- Modify: `index.html` — `_NAV_EDIT_PANELS`（`new-media-screen` の行）、`@media` の `#new-media-screen,`（3か所）
- Modify: `index.html` — メディア管理 JS（`fetchMediaList` 〜 `saveNewMedia`・約 13498〜13640 行）
- Modify: `index.html` — 管理室ボタンの副題（約 4404 行）
- Test: `tests/media/test-records.js`（新規）, `tests/media/test-structure.js`（追記）

- [ ] **Step 1: 失敗するテストを書く（集計）**

```js
// tests/media/test-records.js — 記録の集計（通常WS・簡易WS・旧記録）とカードの現在地
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_normalizeMedia', '_mediaHasRecord', '_mediaDateKey', '_splitCards', '_mediaBuFlag', '_mediaRecords', '_mediaCardStatus']);

console.log('=== 日付キー ===');
ok(_mediaDateKey('2026/08/17') === '2026-08-17' && _mediaDateKey('2026-8-7') === '2026-08-07' && _mediaDateKey('2026.08.17, 08/18') === '2026-08-17', '年付き');
ok(_mediaDateKey('8/17') === new Date().getFullYear() + '-08-17', '月日だけなら今年');
ok(_mediaDateKey('') === '' && _mediaDateKey('未定') === '', '読めなければ空');
console.log('\n=== 分割・BU判定 ===');
ok(_splitCards('CF160_1, CF160_2、CF160_3／CF256_1').join('|') === 'CF160_1|CF160_2|CF160_3|CF256_1', '区切りは , 、 ／ / 空白');
ok(_mediaBuFlag('○') && _mediaBuFlag('済') && _mediaBuFlag('OK') && !_mediaBuFlag('') && !_mediaBuFlag('未') && !_mediaBuFlag('×'), 'BU の印');

console.log('\n=== 集計 ===');
global.localStorage = S.fakeStorage({
  projects_saved: JSON.stringify([{ num: 'T26051', title: '島じかん', date: '2026/08/10' }, { num: 'T26052', title: '削除済み', date: '2026/08/12' }]),
  deleted_ws: JSON.stringify(['T26052']),
  ws_T26051: JSON.stringify({ 'wsd-shootdate': '2026/08/10', media: { out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], user: '城間', bu: false, returnBy: '' }, _updatedAt: '2026-08-10T10:00:00Z' }),
  ws_T26052: JSON.stringify({ media: { out: ['CF160_3'] } }),
  ws_T26053: JSON.stringify({ edit_title: '孤立だが記録あり', media: { date: '2026/08/20', out: ['CF256_1'], used: ['CF256_1'], bu: true, buBy: '平岡', returnBy: '城間' }, _updatedAt: '2026-08-20T10:00:00Z' }),
  ws_T26054: JSON.stringify({ edit_title: '記録なし', media: { user: '城間' } }),
  simple_ws: JSON.stringify([{ id: 'sw1', date: '2026/08/15', title: 'RBC中継', user: '上原', media: { out: ['CF160_4'], used: ['CF160_4'], bu: true, buBy: '上原', returnBy: '上原' }, _updatedAt: '2026-08-15T10:00:00Z' }]),
  media_cache: JSON.stringify({ at: 1, rows: [
    { 'ID': 'L0001', '使用日': '2026/08/17', 'メディア種別': 'LINE', '使用カード': 'CF160_1, CF160_2', '使用者': '城間', '現場名': '首里城VP', 'BU確認': '○', '返却者': '城間', '備考': '持出: CF160_1, CF160_2, CF160_3／BU担当: 平岡' },
    { 'ID': 'M001', '使用日': '2026/07/01', 'メディア種別': 'CFexpress', '使用カード': 'No.1', '使用者': '上原', '現場名': '旧アプリ記録', 'BU確認': '済', '返却者': '', '備考': '' }
  ] })
});
const recs = _mediaRecords();
ok(recs.length === 5, '5件（削除済みWSと記録なしWSは除外）: ' + recs.map(r => r.label).join(','));
ok(recs.map(r => r.key).join(',') === 'T26053,L0001,sw1,T26051,M001', '使用日の新しい順: ' + recs.map(r => r.key).join(','));
const t51 = recs.find(r => r.key === 'T26051');
ok(t51.src === 'ws' && t51.site === '島じかん' && t51.date === '2026/08/10', '通常WSは件名と日程を使う');
const l1 = recs.find(r => r.key === 'L0001');
ok(l1.src === 'line' && l1.label === 'LINE' && l1.media.out.join(',') === 'CF160_1,CF160_2,CF160_3' && l1.media.buBy === '平岡' && l1.media.bu === true, 'LINE 行は備考から持出とBU担当を戻す');
const m1 = recs.find(r => r.key === 'M001');
ok(m1.src === 'old' && m1.label === '旧' && m1.media.bu === true && m1.media.used.join(',') === 'No.1', '旧アプリ行は閲覧用に読める');
ok(recs.find(r => r.key === 'sw1').src === 'sw' && recs.find(r => r.key === 'sw1').site === 'RBC中継', '簡易WSも並ぶ');

console.log('\n=== カードの現在地 ===');
const cards = [{ id: 'CF160_1' }, { id: 'CF160_2' }, { id: 'CF160_3' }, { id: 'CF160_4' }, { id: 'CF256_1' }, { id: 'CF256_2' }];
const st = _mediaCardStatus(recs, cards);
const by = id => st.find(s => s.id === id);
ok(by('CF160_1').state === 'out' && by('CF160_1').rec.key === 'T26051', 'CF160_1: 返却者空 → 貸出中（LINE の返却済は使わない）');
ok(by('CF160_2').state === 'out', 'CF160_2: 貸出中');
ok(by('CF160_3').state === 'none', 'CF160_3: 削除済みWSと LINE だけ → 記録なし');
ok(by('CF160_4').state === 'ok', 'CF160_4: 返却済・BU済');
ok(by('CF256_1').state === 'ok' && by('CF256_2').state === 'none', 'CF256_1 返却済／CF256_2 記録なし');
// BU未
global.localStorage.setItem('ws_T26051', JSON.stringify({ media: { date: '2026/08/10', out: ['CF160_1'], used: ['CF160_1'], bu: false, returnBy: '城間' } }));
ok(_mediaCardStatus(_mediaRecords(), cards).find(s => s.id === 'CF160_1').state === 'bu', '返却済・使用あり・BU未 → BU未');
// 同日は更新日時の新しい方
global.localStorage.setItem('ws_T26051', JSON.stringify({ media: { date: '2026/08/20', out: ['CF256_1'], returnBy: '' }, _updatedAt: '2026-08-20T12:00:00Z' }));
ok(_mediaCardStatus(_mediaRecords(), cards).find(s => s.id === 'CF256_1').rec.key === 'T26051', '同じ使用日なら更新日時が新しい記録で決める');
ok.done();
```

- [ ] **Step 2: `test-structure.js` に追記**

```js
console.log('\n=== Task 6: メディア管理画面 ===');
ok(!/id="new-media-screen"/.test(src) && !/#new-media-screen/.test(src), '単独の記録画面（HTML・CSS）が無い');
['openNewMedia', 'closeNewMedia', 'saveNewMedia'].forEach(fn => ok(!new RegExp('function ' + fn + '\\(').test(src), fn + ' が無い'));
ok(!/new-media-screen/.test(S.grabConst(src, '_NAV_EDIT_PANELS').map(p => p.id).join(',')), '_NAV_EDIT_PANELS から外した');
ok(!/openNewMedia\(\)/.test(src), '「＋」ボタンが無い');
['id="media-refresh-btn"', 'id="media-cards-status"', 'id="media-filter-chips"', 'id="media-search"', 'id="media-items"'].forEach(id => ok(src.indexOf(id) >= 0, id + ' がある'));
['refreshMediaPage', 'setMediaFilter', 'renderMediaList', '_mediaRecords', '_mediaCardStatus'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
ok(/async function refreshMediaPage/.test(src) && /_setBtnBusy\(btn, true, '🔄 取得中…'\)/.test(S.grabFunction(src, 'refreshMediaPage')), '更新ボタンは処理中表示');
ok(/closeMediaList\(\); openWS\(/.test(S.grabFunction(src, 'renderMediaList')) && /openEditSimpleWS\(/.test(S.grabFunction(src, 'renderMediaList')), 'タップでワークシートを開く');
```

- [ ] **Step 3: 落ちることを確認** — Run: `node tests/media/test-records.js; node tests/media/test-structure.js`

- [ ] **Step 4: HTML — `#media-list-screen` を書き換え、`#new-media-screen` を削除**

`<!-- ========== メディア管理画面 ========== -->` から `<!-- ========== 簡易ワークシート 一覧画面 ========== -->` の直前までを、次に置き換える:

```html
  <!-- ========== メディア管理画面（2026-09-28 作り直し）==========
       記録の入口はワークシート（通常・簡易）の「💾 メディア」欄。ここは一覧とカードの現在地。
       単独の「新規メディア記録」画面は廃止（設計書 §5）。旧記録（M/L）は閲覧のみ -->
  <div id="media-list-screen" style="
    position:absolute; inset:0; z-index:173;
    background:var(--panel-bg);
    transform:translateX(100%);
    transition:transform 0.28s cubic-bezier(.4,0,0.2,1);
    display:flex; flex-direction:column; overflow:hidden;">
    <div style="display:flex;align-items:center;gap:6px;background:#16a085;padding:10px 12px;flex-shrink:0;border-bottom:3px solid #0b5345;flex-wrap:wrap;">
      <button class="wsd-back" onclick="closeMediaList()">◀ 戻る</button>
      <div class="wsd-header-info" style="flex:1;min-width:120px;">
        <div class="wsd-header-num" style="color:#d1f2eb;">💾 メディア管理</div>
        <div class="wsd-header-title" id="media-count-label">使用記録</div>
      </div>
      <button id="media-refresh-btn" onclick="refreshMediaPage()"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 8px;border-radius:3px;cursor:pointer;white-space:nowrap;">🔄 更新</button>
      <button onclick="openMediaCards()" title="カードの追加・廃棄（全端末で共有）"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 8px;border-radius:3px;cursor:pointer;white-space:nowrap;">🎴 カード一覧</button>
      <button onclick="document.getElementById('media-csv-file').click()" title="LINE bot のシートを CSV にしたものを取り込む"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 8px;border-radius:3px;cursor:pointer;white-space:nowrap;">📥 LINE取込</button>
      <input id="media-csv-file" type="file" accept=".csv,text/csv" style="display:none;" onchange="importMediaCsvFile(this.files && this.files[0]); this.value='';">
      <a href="https://docs.google.com/spreadsheets/d/1-4JZsI7Hq21cBYh9EUDX-CGErm5ba5Lj6gj86IQiWnE/edit#gid=1323418612" target="_blank" title="スプレッドシートを開く"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 8px;border-radius:3px;cursor:pointer;white-space:nowrap;text-decoration:none;">📊</a>
    </div>
    <div style="padding:8px 12px;background:#e8f8f4;border-bottom:2px solid #a3e4d7;flex-shrink:0;">
      <div id="media-cards-status" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
      <div class="np-btn-group" id="media-filter-chips" style="margin-bottom:6px;">
        <button type="button" class="np-select-btn selected" data-f="all" onclick="setMediaFilter('all')">すべて</button>
        <button type="button" class="np-select-btn" data-f="bu" onclick="setMediaFilter('bu')">🟡 BU未</button>
        <button type="button" class="np-select-btn" data-f="return" onclick="setMediaFilter('return')">🔴 返却未</button>
        <button type="button" class="np-select-btn" data-f="line" onclick="setMediaFilter('line')">LINE</button>
      </div>
      <input id="media-search" type="text" class="wsd-input" placeholder="🔍 現場・使用者・カード名で検索..." oninput="renderMediaList()" style="width:100%;font-size:14px;padding:8px;">
    </div>
    <div id="media-items" class="wsd-scroll" style="padding:6px 8px;"></div>
  </div>

  <!-- 🎴 カード一覧（Task 7 で中身を作る） -->
  <div id="media-cards-screen" style="
    position:absolute; inset:0; z-index:183;
    background:var(--panel-bg);
    transform:translateX(100%);
    transition:transform 0.28s cubic-bezier(.4,0,0.2,1);
    display:flex; flex-direction:column; overflow:hidden;">
    <div style="display:flex;align-items:center;gap:10px;background:#27ae60;padding:10px 12px;flex-shrink:0;border-bottom:3px solid #1a7a40;">
      <button class="wsd-back" onclick="closeMediaCards()">◀ 戻る</button>
      <div class="wsd-header-info" style="flex:1;">
        <div class="wsd-header-num" style="color:#a8f0c0;">🎴 カード一覧</div>
        <div class="wsd-header-title" id="media-cards-sub">全端末で共有</div>
      </div>
      <button onclick="addMediaCardFromList()"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 10px;border-radius:3px;cursor:pointer;white-space:nowrap;">＋ 追加</button>
    </div>
    <div class="wsd-scroll" style="padding:8px;">
      <div style="font-size:11px;color:#888;padding:4px 6px 8px;line-height:1.6;">名前の変更はできません（過去の記録に当時の名前で残るため）。変えたいときは「廃棄」して新しい名前で追加してください。廃棄したカードは選択ボタンに出なくなります。</div>
      <div id="media-cards-list"></div>
    </div>
  </div>

```

- [ ] **Step 5: CSS と登録の掃除**

`#new-media-screen,` を **3か所すべて** `#media-cards-screen,` に置き換える（`sed -i '' 's/#new-media-screen,/#media-cards-screen,/g' index.html`。置換後 `grep -c "#media-cards-screen," index.html` が 3）。
`_NAV_EDIT_PANELS` の行 `{ id: 'new-media-screen',  close: () => closeNewMedia(),   save: () => saveNewMedia(),        label: '新規メディア記録' },` を削除。
管理室ボタンの副題 `SD/CFexpress 等の使用記録` を `カードの持ち出し・BU・返却の一覧` にする。

- [ ] **Step 6: JS — メディア管理の関数を置き換える**

`async function fetchMediaList(showStatus) {` から `saveNewMedia` の閉じ `}`（`// ===== 簡易ワークシート` の直前）までを削除し、`function getCachedMedia() { return _getCached('media_cache'); }` と Task 1・2 のブロックは残す。削除した位置に次を入れる（Task 1・2 のブロックの後）:

```js
  // ---- 管理室：一覧とカードの現在地 ----
  function _mediaDateKey(s) {
    const t = String(s || '').trim();
    let m = t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = t.match(/(\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return new Date().getFullYear() + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    return '';
  }
  function _splitCards(s) { return String(s || '').split(/[,、，\/／\s]+/).map(x => x.trim()).filter(Boolean); }
  function _mediaBuFlag(v) { return /^(○|〇|⚪|OK|ok|済|完了)/.test(String(v || '').trim()); }
  // 出どころ3つ（通常WS・簡易WS・旧記録）を1本に並べる。使用日の新しい順（同日は更新日時）
  // 1件: { src:'ws'|'sw'|'line'|'old', key, label, date, site, media, updatedAt }
  function _mediaRecords() {
    const out = [];
    const deleted = new Set(getDeletedWS());
    const projects = getSavedProjects();
    const numSet = new Set(projects.map(p => String(p.num)));
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ws_')) numSet.add(k.substring(3)); }
    numSet.forEach(num => {
      if (deleted.has(num)) return;
      const s = loadWS(num);
      const m = _normalizeMedia(s.media);
      if (!_mediaHasRecord(m)) return;
      const p = projects.find(pp => String(pp.num) === num) || {};
      out.push({ src: 'ws', key: num, label: num, date: m.date || s['wsd-shootdate'] || p.date || '',
                 site: s['edit_title'] || p.title || '', media: m, updatedAt: String(s._updatedAt || '') });
    });
    loadSimpleWS().forEach(r => {
      if (!r || !r.id) return;
      const m = _normalizeMedia(r.media);
      if (!_mediaHasRecord(m)) return;
      out.push({ src: 'sw', key: String(r.id), label: '簡易', date: m.date || r.date || '',
                 site: r.title || r.content || '簡易ワークシート', media: m, updatedAt: String(r._updatedAt || r.updatedAt || '') });
    });
    getCachedMedia().forEach(r => {
      const isLine = String(r['メディア種別'] || '') === 'LINE';
      const memo = String(r['備考'] || '');
      const outM = isLine ? _splitCards((memo.match(/持出:\s*([^／\n]*)/) || [])[1]) : [];
      const buBy = isLine ? String((memo.match(/BU担当:\s*([^／\n]*)/) || [])[1] || '').trim() : '';
      out.push({ src: isLine ? 'line' : 'old', key: String(r['ID'] || ''), label: isLine ? 'LINE' : '旧',
                 date: String(r['使用日'] || ''), site: String(r['現場名'] || ''),
                 media: _normalizeMedia({ date: r['使用日'], out: outM, used: _splitCards(r['使用カード']), user: r['使用者'],
                                          bu: _mediaBuFlag(r['BU確認']), buBy, returnBy: r['返却者'], memo: isLine ? '' : memo }),
                 updatedAt: String(r['更新日時'] || r._updatedAt || '') });
    });
    out.sort((a, b) => _mediaDateKey(b.date).localeCompare(_mediaDateKey(a.date)) || b.updatedAt.localeCompare(a.updatedAt));
    return out;
  }
  // 各カードの現在地。records は _mediaRecords()（新しい順）。旧記録（LINE・旧アプリ）はカード名が揃っていないので使わない
  // state: 'out'（貸出中）| 'bu'（返却済だがBU未）| 'ok'（返却済）| 'none'（記録なし）
  function _mediaCardStatus(records, cards) {
    return cards.map(c => {
      const r = records.find(x => (x.src === 'ws' || x.src === 'sw') && x.media.out.includes(c.id));
      if (!r) return { id: c.id, type: c.type || '', state: 'none', rec: null };
      const m = r.media;
      const state = !m.returnBy ? 'out' : (m.used.includes(c.id) && !m.bu) ? 'bu' : 'ok';
      return { id: c.id, type: c.type || '', state, rec: r };
    });
  }
  let _mediaFilter = 'all';
  function setMediaFilter(f) { _mediaFilter = f; renderMediaList(); }
  function openMediaList() {
    const s = document.getElementById('media-search');
    if (s) s.value = '';
    _mediaFilter = 'all';
    renderMediaList();
    document.getElementById('media-list-screen').style.transform = 'translateX(0)';
  }
  function closeMediaList() {
    document.getElementById('media-list-screen').style.transform = 'translateX(100%)';
  }
  // 🔄 更新：記録が入っている4種類を取り込む。押した瞬間「取得中…」、終わったら（失敗でも）戻す
  async function refreshMediaPage() {
    const btn = document.getElementById('media-refresh-btn');
    if (btn && btn.disabled) return;
    _setBtnBusy(btn, true, '🔄 取得中…');
    try {
      if (!_gasUrlOne()) { setGasStatus('同期URLが未設定です', '#c0392b'); return; }
      for (const k of ['order', 'child', 'simpleWS', 'media']) { try { await pullKind(k); } catch (e) { console.warn('media refresh', k, e); } }
      setGasStatus('✅ メディアの記録を読み込みました', '#27ae60');
    } finally {
      _setBtnBusy(btn, false);
      renderMediaList();
    }
  }
  function renderMediaList() {
    const list = document.getElementById('media-items');
    if (!list) return;
    const q = _normalizeForSearch(document.getElementById('media-search')?.value || '');
    const all = _mediaRecords();
    // 上段：カードの現在地
    const st = document.getElementById('media-cards-status');
    if (st) {
      const STATE = { out: ['🔴 貸出中', '#c0392b', '#fdecea'], bu: ['🟡 BU未', '#d68910', '#fef5e7'], ok: ['🟢 返却済', '#1e8449', '#eafaf1'], none: ['⚪ 記録なし', '#7f8c8d', '#f4f6f6'] };
      st.innerHTML = _mediaCardStatus(all, getMediaCards().filter(c => !c.retired)).map(s => {
        const [lbl, col, bg] = STATE[s.state];
        const sub = !s.rec ? '' : (s.state === 'out' ? [s.rec.media.user, s.rec.site, s.rec.date] : [s.rec.site, s.rec.date]).filter(Boolean).join('・');
        return `<div style="flex:1 1 140px;min-width:0;background:${bg};border:2px solid ${col};border-radius:4px;padding:6px 8px;">
          <div style="font-weight:bold;color:${col};font-size:13px;">${escapeHtml(s.id)}</div>
          <div style="font-size:11px;color:${col};">${lbl}</div>
          ${sub ? `<div style="font-size:10px;color:#666;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(sub)}</div>` : ''}
        </div>`;
      }).join('') || '<div style="font-size:12px;color:#888;">カードが登録されていません（🎴 カード一覧から追加）</div>';
    }
    // 絞り込み・検索
    let rows = all;
    if (_mediaFilter === 'bu')     rows = rows.filter(r => r.media.used.length && !r.media.bu);
    if (_mediaFilter === 'return') rows = rows.filter(r => r.media.out.length && !r.media.returnBy);
    if (_mediaFilter === 'line')   rows = rows.filter(r => r.src === 'line');
    if (q) rows = rows.filter(r => _normalizeForSearch([r.date, r.site, r.label, r.media.out.join(' '), r.media.used.join(' '),
      r.media.user, r.media.buBy, r.media.returnBy, r.media.memo].join(' ')).indexOf(q) >= 0);
    document.querySelectorAll('#media-filter-chips .np-select-btn').forEach(b => b.classList.toggle('selected', b.dataset.f === _mediaFilter));
    const cnt = document.getElementById('media-count-label');
    if (cnt) cnt.textContent = `使用記録 ${rows.length} / ${all.length} 件`;
    if (!rows.length) {
      list.innerHTML = '<div style="padding:30px 14px;text-align:center;color:#888;font-size:13px;">記録がありません<br>ワークシートの「💾 メディア」欄から記録できます</div>';
      return;
    }
    const COLOR = { ws: '#8e44ad', sw: '#16a085', line: '#7f8c8d', old: '#95a5a6' };
    list.innerHTML = rows.slice(0, 500).map(r => {
      const m = r.media;
      const onclick = r.src === 'ws' ? `onclick="closeMediaList(); openWS('${escapeHtml(r.key)}')"`
                    : r.src === 'sw' ? `onclick="openEditSimpleWS('${escapeHtml(r.key)}')"` : '';
      return `<div ${onclick} style="background:white;border:2px solid #d1f2eb;border-left:4px solid #16a085;border-radius:3px;padding:8px 10px;margin-bottom:5px;box-shadow:2px 2px 0 #d1f2eb;${onclick ? 'cursor:pointer;' : 'opacity:.85;'}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:bold;color:#117a65;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.site || '(現場名なし)')}</div>
          <span style="font-size:10px;color:white;background:${COLOR[r.src]};padding:1px 6px;border-radius:8px;white-space:nowrap;">${escapeHtml(r.label)}</span>
        </div>
        <div style="font-size:11px;color:#666;margin-top:3px;">📅 ${escapeHtml(r.date || '―')}　👤 ${escapeHtml(m.user || '―')}　${_mediaStatusBadges(m)}</div>
        ${m.out.length ? `<div style="font-size:11px;color:#555;margin-top:2px;">📤 持出: ${escapeHtml(m.out.join(', '))}</div>` : ''}
        ${m.used.length ? `<div style="font-size:11px;color:#555;margin-top:1px;">💾 使用: ${escapeHtml(m.used.join(', '))}</div>` : ''}
        <div style="font-size:11px;color:#888;margin-top:1px;">💿 BU: ${m.bu ? '○ ' + escapeHtml(m.buBy || '') : '未'}　🔁 返却: ${m.returnBy ? escapeHtml(m.returnBy) : '未'}</div>
        ${m.memo ? `<div style="font-size:11px;color:#888;margin-top:1px;">📝 ${escapeHtml(m.memo)}</div>` : ''}
      </div>`;
    }).join('');
  }
  // 旧記録の ID 採番（LINE 取込 L0001〜 で使う。M 形式の旧記録と同じ関数）
  function _nextId(cached, prefix) {
    const re = new RegExp('^' + prefix + '(\\d+)$');
    const nums = cached.map(c => String(c['ID']||'').trim())
      .map(s => { const m = s.match(re); return m ? parseInt(m[1], 10) : NaN; })
      .filter(n => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return prefix + String(max + 1).padStart(4, '0');
  }
```

`_nextId` は運転記録でも使われているので**消さずにここへ移す**（元の位置の定義は削除して重複させない。`grep -c "function _nextId" index.html` が 1）。

- [ ] **Step 7: 通ることを確認**

Run: `node tests/media/test-records.js && node tests/media/test-structure.js`
Expected: すべて ✅（Task 7・8 の関数はまだ無いので、`test-structure.js` の Task 7・8 の節はまだ書かない）

- [ ] **Step 8: 構文チェック・既存テスト全部 → Commit**

メッセージ: `feat(メディア管理): 一覧とカードの現在地を作り直し、単独の記録画面を廃止`

- [ ] **Step 9: 実機確認（本人）** 管理室→メディア管理：上段に6枚のタイル、一覧にワークシートの記録、タップで開く、「🔄 更新」の処理中表示。スマホ幅／デスクトップ × 文字100%／150% でタイルとチップが折り返して収まる

---

### Task 7: 🎴 カード一覧の画面

**Files:**
- Modify: `index.html` — Task 6 のブロックの直後、`config` kind の `redraw`
- Test: `tests/media/test-structure.js`（追記）

- [ ] **Step 1: テストを追記**

```js
console.log('\n=== Task 7: カード一覧の画面 ===');
['openMediaCards', 'closeMediaCards', 'renderMediaCards', 'addMediaCardFromList', 'toggleMediaCardRetired'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
ok(/_promptNewMediaCard\(\)/.test(S.grabFunction(src, 'addMediaCardFromList')), '記入欄と同じ追加の対話を使う');
ok(/confirm\(/.test(S.grabFunction(src, 'toggleMediaCardRetired')), '廃棄は確認する');
ok(/_rerenderIfOpen\('media-cards-screen', renderMediaCards\)/.test(src), '設定が同期で届いたらカード一覧を描き直す');
ok((src.match(/#media-cards-screen,/g) || []).length === 3, 'デスクトップ幅のルール3か所に入っている');
```

- [ ] **Step 2: 落ちることを確認** — Run: `node tests/media/test-structure.js`

- [ ] **Step 3: JS（Task 6 のブロックの直後に挿入）**

```js
  // ---- 🎴 カード一覧（追加・廃棄・復活。名前変更は無し） ----
  function openMediaCards() { renderMediaCards(); document.getElementById('media-cards-screen').style.transform = 'translateX(0)'; }
  function closeMediaCards() { document.getElementById('media-cards-screen').style.transform = 'translateX(100%)'; renderMediaList(); }
  function renderMediaCards() {
    const el = document.getElementById('media-cards-list');
    if (!el) return;
    const cards = getMediaCards();
    const sub = document.getElementById('media-cards-sub');
    if (sub) sub.textContent = `${cards.filter(c => !c.retired).length} 枚（廃棄 ${cards.filter(c => c.retired).length}）・全端末で共有`;
    el.innerHTML = cards.map(c => `
      <div style="display:flex;align-items:center;gap:8px;background:white;border:2px solid ${c.retired ? '#ddd' : '#d1f2eb'};border-left:4px solid ${c.retired ? '#bbb' : '#16a085'};border-radius:3px;padding:8px 10px;margin-bottom:5px;${c.retired ? 'opacity:.6;' : ''}">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:bold;color:#117a65;font-size:14px;">${escapeHtml(c.id)}${c.retired ? ' <span style="font-size:10px;color:#999;">（廃棄）</span>' : ''}</div>
          <div style="font-size:11px;color:#666;">${escapeHtml(c.type || '―')}</div>
        </div>
        <button type="button" onclick="toggleMediaCardRetired('${escapeHtml(c.id)}')"
          style="font-family:'DotGothic16',monospace;font-size:11px;padding:5px 10px;border:1px solid ${c.retired ? '#27ae60' : '#c0392b'};background:white;color:${c.retired ? '#1a7a40' : '#c0392b'};border-radius:3px;cursor:pointer;white-space:nowrap;">${c.retired ? '復活' : '廃棄'}</button>
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:#888;font-size:12px;">カードがありません</div>';
  }
  function addMediaCardFromList() { if (_promptNewMediaCard()) renderMediaCards(); }
  function toggleMediaCardRetired(id) {
    const c = getMediaCards().find(x => x.id === id);
    if (!c) return;
    if (!c.retired && !confirm('「' + id + '」を廃棄しますか？\n選択ボタンに出なくなります（過去の記録は残ります）')) return;
    _setMediaCardRetired(id, !c.retired);
    renderMediaCards();
  }
```

`config` kind の `redraw: () => { try { _renderNpOrderButtons(); } catch(e) {} }` を

```js
      redraw: () => { try { _renderNpOrderButtons(); } catch(e) {} try { _rerenderIfOpen('media-cards-screen', renderMediaCards); } catch(e) {} }
```

にする。

- [ ] **Step 4: 通ることを確認 → 構文チェック → Commit**

メッセージ: `feat(メディア管理): 🎴 カード一覧（追加・廃棄・復活、全端末で共有）`

- [ ] **Step 5: 実機確認（本人）** カードを追加→ワークシートの記入欄に出る→別端末で「🔄 更新」後に出る。ワークシートの「＋ 追加」からも足せる

---

### Task 8: 📥 LINE取込（CSV）

**Files:**
- Modify: `index.html` — Task 7 のブロックの直後
- Test: `tests/media/test-csv.js`（新規）, `tests/media/test-structure.js`（追記）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/media/test-csv.js — LINE bot のシート（CSV）の読み取りと重複除外
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_mediaBuFlag', '_parseCsv', '_parseMediaCSV', '_importMediaCsvRows']);
S.loadConst('_MEDIA_CSV_COLS');

console.log('=== CSV の読み取り ===');
let rows = _parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2\n');
ok(rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'say "hi"' && rows[2][1] === '2', '引用符・カンマ・CRLF・空行');
ok(_parseCsv('﻿a,b\n1,2')[0][0] === 'a', 'BOM を落とす');

console.log('\n=== bot の列 → アプリの行 ===');
const csv = '現場名,使用日,持ち出したメディア,使用メディア,バックアップ,使用者,バックアップした人,返却者\n' +
            '首里城VP,2026/08/17,"CF160_1, CF160_2, CF160_3","CF160_1, CF160_2, CF160_3",○,城間,平岡,城間\n' +
            'ロケハン,2026/08/18,CF160_4,,,上原,,\n';
let p = _parseMediaCSV(csv);
ok(!p.error && p.rows.length === 2, '2行読める（見出しの順番が違ってもよい）');
const r0 = p.rows[0];
ok(r0['使用日'] === '2026/08/17' && r0['現場名'] === '首里城VP' && r0['メディア種別'] === 'LINE' && r0['使用カード'] === 'CF160_1, CF160_2, CF160_3'
   && r0['BU確認'] === '○' && r0['使用者'] === '城間' && r0['返却者'] === '城間' && r0['備考'] === '持出: CF160_1, CF160_2, CF160_3／BU担当: 平岡', '列の対応: ' + JSON.stringify(r0));
ok(p.rows[1]['BU確認'] === '' && p.rows[1]['備考'] === '持出: CF160_4', '空欄は空のまま');
p = _parseMediaCSV('使用日,使用したメディア,現場名\n2026/08/19,CF256_1,別名の見出し');
ok(!p.error && p.rows[0]['使用カード'] === 'CF256_1', '「使用したメディア」の見出しでも拾う');
ok(/使用日/.test(_parseMediaCSV('a,b\n1,2').error), '必要な見出しが無ければエラー');
ok(/空/.test(_parseMediaCSV('').error), '空ならエラー');

console.log('\n=== 重複除外と ID ===');
const existing = [{ 'ID': 'L0002', '使用日': '2026/08/17', '現場名': '首里城VP', '使用者': '城間' }, { 'ID': 'M001' }];
const res = _importMediaCsvRows(_parseMediaCSV(csv).rows, existing);
ok(res.dup === 1 && res.toAdd.length === 1, '使用日＋現場名＋使用者が同じ行は飛ばす');
ok(res.toAdd[0]['ID'] === 'L0003', 'ID は L の最大＋1 から');
const res2 = _importMediaCsvRows(_parseMediaCSV(csv + 'ロケハン,2026/08/18,CF160_4,,,上原,,\n').rows, []);
ok(res2.toAdd.length === 2 && res2.dup === 1 && res2.toAdd.map(r => r['ID']).join(',') === 'L0001,L0002', 'CSV の中の重複も飛ばす。ID は連番');
ok.done();
```

`test-structure.js` に追記:

```js
console.log('\n=== Task 8: LINE取込 ===');
ok(/id="media-csv-file"/.test(src) && /importMediaCsvFile\(this\.files/.test(src), 'ファイル選択がある');
ok(/async function importMediaCsvFile/.test(src), '取込関数がある');
const imp = S.grabFunction(src, 'importMediaCsvFile');
ok(/confirm\(/.test(imp) && /pushKind\('media'/.test(imp) && /media_cache/.test(imp), '確認→送信→キャッシュ反映');
```

- [ ] **Step 2: 落ちることを確認** — Run: `node tests/media/test-csv.js; node tests/media/test-structure.js`

- [ ] **Step 3: JS（Task 7 のブロックの直後に挿入）**

```js
  // ---- 📥 LINE取込：bot のシートを「ファイル → ダウンロード → CSV」したものを media kind に入れる（閲覧用・1回だけ） ----
  function _parseCsv(text) {
    const rows = []; let row = [], cell = '', inQ = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  // 見出しの候補（bot のシートの列名は順番も表記も揺れる可能性があるので複数）
  const _MEDIA_CSV_COLS = {
    date: ['使用日', '日付'],
    out:  ['持ち出したメディア', '持ち出し', '持出'],
    used: ['使用メディア', '使用したメディア', '使用'],
    site: ['現場名', '現場'],
    bu:   ['バックアップ', 'BU', 'BU確認'],
    user: ['使用者'],
    buBy: ['バックアップした人', 'BU担当'],
    ret:  ['返却者', '返却']
  };
  // CSV文字列 → media kind の行（10列に収める。持出とBU担当は備考へ、種別 'LINE' が取込の印）。{ rows, error }
  function _parseMediaCSV(text) {
    const rows = _parseCsv(text);
    if (!rows.length) return { rows: [], error: 'CSVが空です' };
    const head = rows[0].map(h => String(h || '').trim());
    const idx = {};
    Object.keys(_MEDIA_CSV_COLS).forEach(k => { idx[k] = head.findIndex(h => _MEDIA_CSV_COLS[k].includes(h)); });
    if (idx.date < 0 || idx.site < 0) return { rows: [], error: '見出しに「使用日」と「現場名」が必要です（1行目: ' + head.join(' | ') + '）' };
    const get = (r, k) => idx[k] >= 0 ? String(r[idx[k]] || '').trim() : '';
    const out = rows.slice(1).map(r => {
      const memo = [get(r, 'out') ? '持出: ' + get(r, 'out') : '', get(r, 'buBy') ? 'BU担当: ' + get(r, 'buBy') : ''].filter(Boolean).join('／');
      return {
        '使用日': get(r, 'date'), 'メディア種別': 'LINE', '使用カード': get(r, 'used'), '使用者': get(r, 'user'),
        '現場名': get(r, 'site'), '受注No': '', 'BU確認': _mediaBuFlag(get(r, 'bu')) ? '○' : '', '返却者': get(r, 'ret'), '備考': memo
      };
    }).filter(r => r['使用日'] || r['現場名']);
    return { rows: out, error: '' };
  }
  // 既存キャッシュ（と CSV の中）の重複＝使用日＋現場名＋使用者が同じ行を除き、ID（L0001〜）を振る。{ toAdd, dup }
  function _importMediaCsvRows(rows, existing) {
    const key = r => [r['使用日'], r['現場名'], r['使用者']].map(v => String(v || '').trim()).join('|');
    const seen = new Set((existing || []).map(key));
    let n = parseInt(String(_nextId(existing || [], 'L')).slice(1), 10);
    const toAdd = []; let dup = 0;
    rows.forEach(r => {
      const k = key(r);
      if (seen.has(k)) { dup++; return; }
      seen.add(k);
      toAdd.push(Object.assign({ 'ID': 'L' + String(n++).padStart(4, '0') }, r));
    });
    return { toAdd, dup };
  }
  async function importMediaCsvFile(file) {
    if (!file) return;
    if (!_gasUrlOne()) { alert('同期URLが未設定のため取り込めません（データ管理で合言葉を設定してください）'); return; }
    let text = '';
    try { text = await file.text(); } catch (e) { alert('ファイルを読めませんでした'); return; }
    const parsed = _parseMediaCSV(text);
    if (parsed.error) { alert('❌ ' + parsed.error); return; }
    const { toAdd, dup } = _importMediaCsvRows(parsed.rows, getCachedMedia());
    if (!toAdd.length) { alert('取り込む行がありません（重複 ' + dup + ' 件）'); return; }
    if (!confirm(toAdd.length + ' 件を取り込みます。よろしいですか？' + (dup ? '\n（重複 ' + dup + ' 件は飛ばします）' : ''))) return;
    setGasStatus('📤 LINEの記録を送信中…', '#2980b9');
    try {
      const stamped = toAdd.map(r => _stampNow(r));
      const data = await pushKind('media', stamped);
      if (!data.ok) throw new Error(data.error || '不明なエラー');
      localStorage.setItem('media_cache', JSON.stringify({ at: Date.now(), rows: getCachedMedia().concat(stamped) }));
      setGasStatus('✅ LINEの記録 ' + stamped.length + ' 件を取り込みました', '#27ae60');
      renderMediaList();
    } catch (err) {
      setGasStatus('❌ 取り込み失敗：' + err.message, '#c0392b');
      alert('取り込みに失敗しました: ' + err.message);
    }
  }
```

- [ ] **Step 4: 通ることを確認 → 構文チェック → Commit**

Run: `node tests/media/test-csv.js && tests/media/run.sh`
メッセージ: `feat(メディア管理): 📥 LINE取込（bot のシートを CSV で1回取り込む）`

- [ ] **Step 5: 実機確認（本人）** bot のシートを CSV でダウンロード → 📥 LINE取込 → 件数の確認 → 一覧に「LINE」の印で並ぶ

---

### Task 9: 仕様の記録と回帰

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-09-28-media-record.md`（チェックボックス）

- [ ] **Step 1: CLAUDE.md に追記**

「主な機能・タブ構成」の管理室の行 `メディア管理` の説明を「メディア管理（カードの持ち出し・BU・返却の一覧）」にし、「その他主要画面」の末尾に:

```markdown
- **💾 メディア（カード）使用記録（2026-09-28）**：LINE の「Sat メディア管理 Bot」を卒業。記入は**ワークシート**（通常＝機材リストの下の「💾 メディア」欄、簡易＝使用機材の下）で、`ws_*` / `simple_ws` の `media`（`{date,out,used,user,bu,buBy,returnBy,memo}`）に保存＝既存の `child`/`simpleWS` 同期に乗る（新シート不要）。管理室の「メディア管理」は一覧＋カードの現在地（`_mediaRecords`/`_mediaCardStatus`）。カード一覧は `config` kind のキー `mediaCards`（`getMediaCards`/`_addMediaCard`。名前変更は無し＝廃棄→追加）。機材チェックリストの「💾 メディア」カテゴリは `_wsEquipCats` で出さない（既チェックがあるWSだけ出す）。印刷は「持ち出し」の1行だけ。旧 `media` kind（M/L 形式）は閲覧のみ・LINE の過去記録は「📥 LINE取込」で CSV から1回入れる（種別 `LINE`）。単独の「新規メディア記録」画面は廃止。設計: `docs/superpowers/specs/2026-09-28-media-record-design.md`、テスト: `tests/media/run.sh`
```

「現在の同期対象 kind 一覧」の `media` の行の備考に「（2026-09-28〜 閲覧専用。新規はワークシートの media）」を足す。

- [ ] **Step 2: 全テスト・構文チェック**

Run: `for t in tests/kurosawa/test-*.js tests/login/test-*.js tests/staff/test-*.js tests/worksheet/test-*.js tests/media/test-*.js; do node "$t" >/dev/null 2>&1 && echo "✅ $t" || echo "❌ $t"; done`
Expected: すべて ✅

- [ ] **Step 3: Commit**（CLAUDE.md と計画のチェックボックス）

メッセージ: `docs: メディア使用記録の仕様を CLAUDE.md に追記`

- [ ] **Step 4: 本人へ最終確認を依頼（UI検証マトリクス）**
スマホ幅(390px)／デスクトップ × 文字100%／150% で、ワークシートのメディア欄・管理室のタイルとチップ・カード一覧の折り返しとはみ出しを見る。
