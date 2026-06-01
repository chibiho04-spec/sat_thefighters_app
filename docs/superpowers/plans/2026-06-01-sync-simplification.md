# 同期シンプル化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8個のバラバラなGoogleスプレッドシート同期を、1スプレッドシート＋1 Apps Script＋1 URL＋1合言葉に統合し、全タブ共通のサーバ側LWW（更新日時で後勝ち＋削除フラグ）と1つの同期エンジンに刷新する。読める列構成は維持する。

**Architecture:** サーバ側は `kind` でタブを振り分ける共通 Apps Script 1本。各タブは「キー列・更新日時・削除フラグ」の3列を必ず持ち、それ以外は今の読める列のまま。アプリ側は `SYNC_KINDS` 登録表＋共通 `pushKind/pullKind/syncAll` で全種類を回す。旧 per-type 関数・削除管理キー（deleted_ws/deleted_inv/equip_deleted）・機材 union/墓標処理は撤去する。

**Tech Stack:** 単一HTML（`index.html`、インラインHTML/CSS/JS）、Google Apps Script（`Code.gs`）、localStorage、GitHub Pages。テスト枠組みは無いため検証は `node --check`（インラインJS抽出）＋ Chrome MCP タブでのブラウザ機能確認＋ `curl` による GAS 動作確認で行う。

**設計根拠:** `docs/superpowers/specs/2026-06-01-sync-simplification-design.md`

---

## 前提・共通ルール（全タスクで厳守）

- **編集対象アプリは `index.html` 1ファイルのみ**（HTML/CSS/JSすべてインライン）。
- **JS構文チェック手順**（各コード変更タスクの検証で使う）:
  ```bash
  cd "<repoルート>" && node -e '
  const fs=require("fs");const html=fs.readFileSync("index.html","utf8");
  const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m,out="";while((m=re.exec(html))){out+=m[1]+"\n;\n";}
  fs.writeFileSync("/tmp/_check.js",out);console.log("bytes",out.length);'
  node --check /tmp/_check.js && echo "✅ 構文チェックOK"
  ```
- **git push のログは必ずフィルタ**: `git push origin main 2>&1 | grep -viE "github.com|ghp_|token|x-access"`。
- リモートURLに個人アクセストークンが埋まっている。**URLを表示・複製しない**。
- コミットは都度ローカル→push。コミットメッセージ末尾に必ず:
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- ユーザーの実データ（file:// および github.io オリジン）の localStorage を消さない。
  ブラウザ検証は localhost:8765 オリジンで行い、テストデータは後始末する。
- Chrome MCP の検証タブURL: `http://localhost:8765/index.html`（ユーザーデータとは別オリジン）。
- ローカルHTTPサーバ: `cd "<repoルート>" && python3 -m http.server 8765`（未起動時のみ起動）。

## ファイル構成（このプランで作成/変更するもの）

- **作成** `docs/superpowers/unified-sheet-Code.gs` — 共通 Apps Script 本体（ユーザーが貼り付ける）。
- **作成** `docs/superpowers/unified-sheet-setup.md` — 初心者向けセットアップ＆移行手順。
- **作成** `tests/sync-engine.test.mjs` — 純粋関数（LWWマージ・行変換）の node 標準テスト。
- **作成** `src/sync-engine.mjs` — 純粋関数のみを切り出したモジュール（テスト可能にするため）。
  index.html へは「このファイルの中身をインライン化したコピー」を貼る。両者は同一実装を保つ。
- **変更** `index.html` — 統合同期エンジンの埋め込み、登録表、設定UIの1URL化、保存/削除フック差し替え、初回シードボタン、旧コード撤去。

> 補足: 単一HTMLにはモジュール読込が無いため、純粋ロジックは `src/sync-engine.mjs` で TDD し、
> 同じ関数本体を index.html のインライン `<script>` にコピーする。テストはモジュール側で担保する。

---

## Task 1: 純粋ロジック — LWWマージ関数（TDD）

**Files:**
- Create: `src/sync-engine.mjs`
- Test: `tests/sync-engine.test.mjs`

純粋関数 `pickNewer(a, b)` と `mergeRecordsLWW(localList, sheetList, keyField)` を作る。
更新日時（ISO文字列）の単純比較で後勝ち。`削除フラグ==='1'` の行は「削除レコード」として扱い、
ローカルに残っていてシートの削除が新しければローカルから除く。

- [ ] **Step 1: Write the failing test**

`tests/sync-engine.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNewer, mergeRecordsLWW } from '../src/sync-engine.mjs';

test('pickNewer は更新日時が新しい方を返す', () => {
  const a = { k: 'x', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const b = { k: 'x', _updatedAt: '2026-06-01T11:00:00.000Z' };
  assert.equal(pickNewer(a, b), b);
  assert.equal(pickNewer(b, a), b);
});

test('pickNewer は同値ならローカル(a)を優先', () => {
  const a = { _updatedAt: '2026-06-01T10:00:00.000Z', src: 'local' };
  const b = { _updatedAt: '2026-06-01T10:00:00.000Z', src: 'sheet' };
  assert.equal(pickNewer(a, b).src, 'local');
});

test('mergeRecordsLWW: シートが新しいレコードで上書き', () => {
  const local = [{ id: '1', v: 'old', _updatedAt: '2026-06-01T10:00:00.000Z' }];
  const sheet = [{ id: '1', v: 'new', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 'new');
});

test('mergeRecordsLWW: ローカルが新しければシートを無視', () => {
  const local = [{ id: '1', v: 'localnew', _updatedAt: '2026-06-01T12:00:00.000Z' }];
  const sheet = [{ id: '1', v: 'sheetold', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out[0].v, 'localnew');
});

test('mergeRecordsLWW: シート新規はローカルへ追加', () => {
  const out = mergeRecordsLWW([], [{ id: '2', _updatedAt: '2026-06-01T10:00:00.000Z' }], 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '2');
});

test('mergeRecordsLWW: シート削除(削除フラグ=1)が新しければローカルから除く', () => {
  const local = [{ id: '1', v: 'x', _updatedAt: '2026-06-01T10:00:00.000Z' }];
  const sheet = [{ id: '1', 削除フラグ: '1', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 0);
});

test('mergeRecordsLWW: 古い削除はローカルの新しい編集を消さない', () => {
  const local = [{ id: '1', v: 'edited', _updatedAt: '2026-06-01T12:00:00.000Z' }];
  const sheet = [{ id: '1', 削除フラグ: '1', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 'edited');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "<repoルート>" && node --test tests/*.test.mjs`
Expected: FAIL（`Cannot find module '../src/sync-engine.mjs'`）

- [ ] **Step 3: Write minimal implementation**

`src/sync-engine.mjs`:
```js
// 純粋ロジック。index.html のインライン <script> にも同じ本体をコピーして使う。
export function pickNewer(a, b) {
  const ua = String((a && a._updatedAt) || '');
  const ub = String((b && b._updatedAt) || '');
  return ub > ua ? b : a; // 同値はローカル(a)優先
}

// localList/sheetList は { [keyField]:..., _updatedAt, 削除フラグ? } の配列。
// 戻り値は「生き残ったレコード」の配列（削除フラグの勝ったものは除外）。
export function mergeRecordsLWW(localList, sheetList, keyField) {
  const byKey = new Map();
  for (const r of localList) {
    const k = String((r && r[keyField]) || '').trim();
    if (k) byKey.set(k, r);
  }
  for (const s of sheetList) {
    const k = String((s && s[keyField]) || '').trim();
    if (!k) continue;
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, s); continue; }
    byKey.set(k, pickNewer(cur, s));
  }
  const out = [];
  for (const r of byKey.values()) {
    if (String((r && r['削除フラグ']) || '') === '1') continue; // 削除が勝ったものは除外
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "<repoルート>" && node --test tests/*.test.mjs`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.mjs tests/sync-engine.test.mjs
git commit -m "$(cat <<'EOF'
feat(sync): LWWマージの純粋関数とテストを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 純粋ロジック — 行変換ヘルパ（TDD）

**Files:**
- Modify: `src/sync-engine.mjs`
- Test: `tests/sync-engine.test.mjs`

JSONブロブ型（invoice/staff/child）と読める列型（client/product/media/equip）の汎用変換を作る。
`stampNow(record)` は `_updatedAt` をISOで付ける。`jsonToRow/jsonFromRow` はJSON方式、
`plainToRow/plainFromRow` は列passthrough方式。

- [ ] **Step 1: Write the failing test**

`tests/sync-engine.test.mjs` に追記:
```js
import { stampNow, jsonToRow, jsonFromRow, plainToRow, plainFromRow } from '../src/sync-engine.mjs';

test('stampNow は _updatedAt をISOで付ける', () => {
  const r = stampNow({ id: '1' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r._updatedAt));
  assert.equal(r.id, '1');
});

test('jsonToRow/jsonFromRow は往復する', () => {
  const rec = { id: 'shin', name: '城間', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const row = jsonToRow(rec, 'キー', 'id');
  assert.equal(row['キー'], 'shin');
  assert.equal(row['更新日時'], '2026-06-01T10:00:00.000Z');
  assert.equal(row['削除フラグ'], '');
  const back = jsonFromRow(row, 'キー');
  assert.equal(back.name, '城間');
  assert.equal(back._updatedAt, '2026-06-01T10:00:00.000Z');
});

test('jsonToRow は削除フラグを反映', () => {
  const row = jsonToRow({ id: 'x', _deleted: true, _updatedAt: '2026-06-01T10:00:00.000Z' }, 'キー', 'id');
  assert.equal(row['削除フラグ'], '1');
});

test('plainToRow は列passthrough＋共通3列付与', () => {
  const rec = { '取引先コード': 'C001', '取引先名': 'A社', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const row = plainToRow(rec, '取引先コード');
  assert.equal(row['取引先コード'], 'C001');
  assert.equal(row['取引先名'], 'A社');
  assert.equal(row['更新日時'], '2026-06-01T10:00:00.000Z');
  assert.equal(row['削除フラグ'], '');
  assert.ok(!('_updatedAt' in row)); // 内部フィールドはシートに出さない
});

test('plainFromRow は共通列を内部フィールドへ戻す', () => {
  const row = { '取引先コード': 'C001', '取引先名': 'A社', '更新日時': '2026-06-01T10:00:00.000Z', '削除フラグ': '' };
  const rec = plainFromRow(row);
  assert.equal(rec['取引先名'], 'A社');
  assert.equal(rec._updatedAt, '2026-06-01T10:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "<repoルート>" && node --test tests/*.test.mjs`
Expected: FAIL（`stampNow is not exported` / undefined）

- [ ] **Step 3: Write minimal implementation**

`src/sync-engine.mjs` に追記:
```js
export function stampNow(record) {
  return Object.assign({}, record, { _updatedAt: new Date().toISOString() });
}

// JSONブロブ方式（invoice/staff/child）: データ列に丸ごと入れる
export function jsonToRow(record, keyHeader, keyField) {
  return {
    [keyHeader]: String(record[keyField] || ''),
    'データ': JSON.stringify(record),
    '更新日時': record._updatedAt || new Date().toISOString(),
    '削除フラグ': record._deleted ? '1' : ''
  };
}
export function jsonFromRow(row, keyHeader) {
  let rec = {};
  try { rec = JSON.parse(row['データ'] || '{}'); } catch (e) { rec = {}; }
  rec._updatedAt = String(row['更新日時'] || rec._updatedAt || '');
  if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
  return rec;
}

// 読める列方式（client/product/media/equip）: レコードのキーがそのままシート列
const _INTERNAL = new Set(['_updatedAt', '_deleted']);
export function plainToRow(record, keyField) {
  const row = {};
  for (const k of Object.keys(record)) {
    if (_INTERNAL.has(k)) continue;
    row[k] = record[k];
  }
  row['更新日時'] = record._updatedAt || new Date().toISOString();
  row['削除フラグ'] = record._deleted ? '1' : '';
  return row;
}
export function plainFromRow(row) {
  const rec = {};
  for (const k of Object.keys(row)) {
    if (k === '更新日時' || k === '削除フラグ') continue;
    rec[k] = row[k];
  }
  rec._updatedAt = String(row['更新日時'] || '');
  if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
  return rec;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "<repoルート>" && node --test tests/*.test.mjs`
Expected: PASS（全12 tests）

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.mjs tests/sync-engine.test.mjs
git commit -m "$(cat <<'EOF'
feat(sync): 行変換ヘルパ(JSON/列passthrough)とテストを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 共通 Apps Script（unified-sheet-Code.gs）

**Files:**
- Create: `docs/superpowers/unified-sheet-Code.gs`

`kind` でタブを振り分ける1本のGAS。GET=list、POST=upsert（サーバ側LWW＋Lock＋dedup）。
このファイルはユーザーが Apps Script に貼り付ける（リポジトリは保管用）。

- [ ] **Step 1: ファイルを作成**

`docs/superpowers/unified-sheet-Code.gs`:
```javascript
/**
 * 統合同期 Apps Script — Sat the Fighters
 * 1スプレッドシートの中の複数タブを kind で振り分けて読み書きする。
 * 全タブ共通: キー列 + 「更新日時」列 + 「削除フラグ」列を必ず持つ。
 * サーバ側 LWW: 受信行の更新日時がシート行より新しい時だけ上書きする。
 */
var SYNC_SECRET = 'ここに合言葉'; // ← 他端末の gas_token と完全一致させる

// kind → { tab: タブ名, key: キー列ヘッダ, headers: 既定ヘッダ行 }
var KINDS = {
  order:   { tab: '案件',     key: '受注No',
    headers: ['受注No','受注日','受注担当','取引先','取引先コード','件名・作品名','撮影日程','作品分類','受注分類','備考','P（プロデューサー）','D（監督）','PM1','PM2','C（カメラマン）','CA1','CA2','S（音声）','E（編集）','更新日時','削除フラグ'] },
  child:   { tab: '子',       key: '受注No',   headers: ['受注No','データ','更新日時','削除フラグ'] },
  client:  { tab: '取引先',   key: '取引先コード',
    headers: ['取引先コード','取引先名','取引先名カナ','担当者','担当者部署','担当者役職','電話番号','FAX','メール','郵便番号','住所','請求書宛先名','備考','更新日時','削除フラグ'] },
  product: { tab: '商品',     key: '商品コード', headers: ['商品コード','商品名','単価','更新日時','削除フラグ'] },
  media:   { tab: 'メディア', key: 'メディアID', headers: ['メディアID','内容','更新日時','削除フラグ'] },
  equip:   { tab: '機材',     key: 'id',       headers: ['id','cat','name','code','qty','price','更新日時','削除フラグ'] },
  invoice: { tab: '請求書',   key: '受注No',   headers: ['受注No','データ','更新日時','削除フラグ'] },
  staff:   { tab: 'スタッフ', key: 'キー',     headers: ['キー','データ','更新日時','削除フラグ'] }
};

function _authOK(e) {
  var t = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  return t === SYNC_SECRET;
}
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _kindCfg(kind) { return KINDS[kind] || null; }

function _sheetFor(cfg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(cfg.tab);
  if (!sh) { sh = ss.insertSheet(cfg.tab); }
  var firstRow = sh.getRange(1, 1, 1, cfg.headers.length).getValues()[0];
  var empty = firstRow.every(function (v) { return v === '' || v == null; });
  if (empty) sh.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
  return sh;
}
function _headers(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }
function _colIndex(headers, name) { return headers.indexOf(name); } // 0始まり、無ければ-1

function doGet(e) {
  if (!_authOK(e)) return _json({ ok: false, error: 'unauthorized' });
  try {
    var action = (e.parameter.action || 'list');
    if (action !== 'list') return _json({ ok: false, error: 'unknown action: ' + action });
    var cfg = _kindCfg(e.parameter.kind);
    if (!cfg) return _json({ ok: false, error: 'unknown kind: ' + e.parameter.kind });
    var sh = _sheetFor(cfg);
    var headers = _headers(sh);
    var keyCol = _colIndex(headers, cfg.key);
    var last = sh.getLastRow();
    var rows = [];
    if (last >= 2 && keyCol >= 0) {
      var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
      values.forEach(function (r) {
        var key = String(r[keyCol] || '').trim();
        if (!key) return;
        var obj = {};
        for (var c = 0; c < headers.length; c++) obj[headers[c]] = r[c];
        rows.push(obj);
      });
    }
    return _json({ ok: true, rows: rows });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  if (!_authOK(e)) return _json({ ok: false, error: 'unauthorized' });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (lockErr) { return _json({ ok: false, error: 'busy' }); }
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if ((body.action || 'upsert') !== 'upsert') return _json({ ok: false, error: 'unknown action: ' + body.action });
    var cfg = _kindCfg(body.kind);
    if (!cfg) return _json({ ok: false, error: 'unknown kind: ' + body.kind });
    var sh = _sheetFor(cfg);
    var headers = _headers(sh);
    var keyCol = _colIndex(headers, cfg.key);
    var updCol = _colIndex(headers, '更新日時');
    if (keyCol < 0) return _json({ ok: false, error: 'key column missing: ' + cfg.key });

    var last = sh.getLastRow();
    var keyToRow = {}, dupRows = [];
    if (last >= 2) {
      var existing = sh.getRange(2, 1, last - 1, headers.length).getValues();
      for (var i = 0; i < existing.length; i++) {
        var k = String(existing[i][keyCol] || '').trim();
        if (!k) continue;
        if (keyToRow[k]) dupRows.push(i + 2); else keyToRow[k] = { rowNum: i + 2, upd: String(existing[i][updCol] || '') };
      }
    }

    var updated = 0, added = 0, skipped = 0;
    (body.rows || []).forEach(function (row) {
      var key = String(row[cfg.key] || '').trim();
      if (!key) return;
      var line = headers.map(function (h) { return (row[h] !== undefined && row[h] !== null) ? row[h] : ''; });
      var incomingUpd = String(row['更新日時'] || '');
      if (keyToRow[key]) {
        if (updCol >= 0 && incomingUpd <= keyToRow[key].upd) { skipped++; return; } // 古い/同値は無視（LWW）
        sh.getRange(keyToRow[key].rowNum, 1, 1, headers.length).setValues([line]);
        keyToRow[key].upd = incomingUpd;
        updated++;
      } else {
        sh.appendRow(line);
        keyToRow[key] = { rowNum: sh.getLastRow(), upd: incomingUpd };
        added++;
      }
    });

    dupRows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    return _json({ ok: true, updated: updated, added: added, skipped: skipped, removedDup: dupRows.length });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 2: 構文を目視確認**

GASはローカル実行できないため、`docs/superpowers/staff-sheet-Code.gs` と構造（doGet/doPost/Lock/dedup）が
一致していること、`KINDS` の全 kind にタブ名・キー列・headers があることを確認する。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/unified-sheet-Code.gs
git commit -m "$(cat <<'EOF'
feat(sync): kind振り分け＋サーバ側LWWの統合Apps Scriptを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 同期エンジンを index.html に埋め込む（登録表＋共通関数）

**Files:**
- Modify: `index.html`（既存の同期モジュール群の直前、`projectToOrderRow` 定義より前のスクリプト内）

Task1/2 の純粋関数本体を index.html のインライン `<script>` にコピーし、その上に登録表
`SYNC_KINDS` と共通 `pushKind/pullKind/syncAll` を実装する。**この時点では既存の同期を壊さない**
（新関数を追加するだけ。差し替えは後続タスク）。

> 既存の保存系関数の所在（差し替え対象の参照用）:
> `sendOrderToSheet`(12057), `projectToOrderRow`(9958)/`orderRowToProject`(9984),
> `sendWorksheetToChild`(11901), `sendInvoiceToSheet`(9719)/`syncFromInvoiceSheet`(9860),
> `sendStaffToSheet`(9620)/`syncFromStaffSheet`(9648)/`loadStaffMaster`(9488)/`saveStaffMaster`(9501),
> `fetchEquipMaster`(12683)/`sendEquipMasterToSheet`(12732), `fetchClientMaster`(10009),
> `fetchProductMaster`(10240), `fetchMediaList`(10493)。
> ローカルキャッシュキー: `client_master_cache`/`product_master_cache`/`media_list_cache`（`{at, rows:[...]}`）、
> `equip_master`（配列）、`staff_master`（配列）、`ws_${num}`/`inv_${num}`/`projects_saved`。

- [ ] **Step 1: 純粋関数とエンジンを追加**

`index.html` の同期モジュール内（`function projectToOrderRow` の直前）に次を挿入:
```javascript
  // ===== 統合同期エンジン（src/sync-engine.mjs と同一実装をインライン化） =====
  function _pickNewer(a, b) {
    const ua = String((a && a._updatedAt) || ''); const ub = String((b && b._updatedAt) || '');
    return ub > ua ? b : a;
  }
  function _mergeRecordsLWW(localList, sheetList, keyField) {
    const byKey = new Map();
    for (const r of localList) { const k = String((r && r[keyField]) || '').trim(); if (k) byKey.set(k, r); }
    for (const s of sheetList) {
      const k = String((s && s[keyField]) || '').trim(); if (!k) continue;
      const cur = byKey.get(k); byKey.set(k, cur ? _pickNewer(cur, s) : s);
    }
    const out = [];
    for (const r of byKey.values()) { if (String((r && r['削除フラグ']) || '') === '1') continue; out.push(r); }
    return out;
  }
  function _stampNow(record) { return Object.assign({}, record, { _updatedAt: new Date().toISOString() }); }
  function _jsonToRow(record, keyHeader, keyField) {
    return { [keyHeader]: String(record[keyField] || ''), 'データ': JSON.stringify(record),
      '更新日時': record._updatedAt || new Date().toISOString(), '削除フラグ': record._deleted ? '1' : '' };
  }
  function _jsonFromRow(row) {
    let rec = {}; try { rec = JSON.parse(row['データ'] || '{}'); } catch (e) { rec = {}; }
    rec._updatedAt = String(row['更新日時'] || rec._updatedAt || '');
    if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
    return rec;
  }
  const _INTERNAL_FIELDS = new Set(['_updatedAt', '_deleted']);
  function _plainToRow(record) {
    const row = {};
    for (const k of Object.keys(record)) { if (_INTERNAL_FIELDS.has(k)) continue; row[k] = record[k]; }
    row['更新日時'] = record._updatedAt || new Date().toISOString();
    row['削除フラグ'] = record._deleted ? '1' : '';
    return row;
  }
  function _plainFromRow(row) {
    const rec = {};
    for (const k of Object.keys(row)) { if (k === '更新日時' || k === '削除フラグ') continue; rec[k] = row[k]; }
    rec._updatedAt = String(row['更新日時'] || '');
    if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
    return rec;
  }
```

- [ ] **Step 2: 登録表 SYNC_KINDS を追加（同じ場所の直後）**

```javascript
  // kind ごとの設定。loadLocal=全レコード取得 / saveLocal=書き戻し / keyField=キー / toRow/fromRow=行変換
  const SYNC_KINDS = {
    invoice: {
      keyField: '受注No', keyHeader: '受注No',
      loadLocal: () => _loadAllInvoices(),         // 既存の請求書ローダを使う（Step4で配線）
      saveLocal: (list) => _saveAllInvoices(list),
      toRow: (rec) => _jsonToRow(rec, '受注No', '受注No'),
      fromRow: (row) => _jsonFromRow(row),
      redraw: () => { try { renderInvoiceList(); } catch (e) {} }
    },
    staff: {
      keyField: 'key', keyHeader: 'キー',
      loadLocal: () => loadStaffMaster(),
      saveLocal: (list) => saveStaffMaster(list),
      toRow: (rec) => _jsonToRow(rec, 'キー', 'key'),
      fromRow: (row) => { const r = _jsonFromRow(row); r.key = String(row['キー'] || r.key || ''); return r; },
      redraw: () => { try { applyStaffToCards(loadStaffMaster()); } catch (e) {} }
    },
    client: {
      keyField: '取引先コード', keyHeader: '取引先コード',
      loadLocal: () => _loadClientRows(), saveLocal: (list) => _saveClientRows(list),
      toRow: (rec) => _plainToRow(rec), fromRow: (row) => _plainFromRow(row),
      redraw: () => {}
    },
    product: {
      keyField: '商品コード', keyHeader: '商品コード',
      loadLocal: () => _loadProductRows(), saveLocal: (list) => _saveProductRows(list),
      toRow: (rec) => _plainToRow(rec), fromRow: (row) => _plainFromRow(row),
      redraw: () => {}
    },
    media: {
      keyField: 'メディアID', keyHeader: 'メディアID',
      loadLocal: () => _loadMediaRows(), saveLocal: (list) => _saveMediaRows(list),
      toRow: (rec) => _plainToRow(rec), fromRow: (row) => _plainFromRow(row),
      redraw: () => {}
    },
    equip: {
      keyField: 'id', keyHeader: 'id',
      loadLocal: () => _loadEquipRows(), saveLocal: (list) => _saveEquipRows(list),
      toRow: (rec) => _plainToRow(rec), fromRow: (row) => _plainFromRow(row),
      redraw: () => { try { renderEquipMaster(); } catch (e) {} }
    },
    order: {
      keyField: '受注No', keyHeader: '受注No',
      loadLocal: () => _loadOrderRecords(), saveLocal: (list) => _saveOrderRecords(list),
      toRow: (rec) => Object.assign(projectToOrderRow(rec.受注No, rec._project),
                                    { '更新日時': rec._updatedAt || new Date().toISOString(), '削除フラグ': rec._deleted ? '1' : '' }),
      fromRow: (row) => { const p = orderRowToProject(row); return { 受注No: String(row['受注No'] || ''), _project: p,
                                    _updatedAt: String(row['更新日時'] || ''), 削除フラグ: String(row['削除フラグ'] || '') }; },
      redraw: () => { try { renderProjects(); } catch (e) {} }
    },
    child: {
      keyField: '受注No', keyHeader: '受注No',
      loadLocal: () => _loadChildRecords(), saveLocal: (list) => _saveChildRecords(list),
      toRow: (rec) => _jsonToRow(rec, '受注No', '受注No'),
      fromRow: (row) => _jsonFromRow(row),
      redraw: () => {}
    }
  };
```

> 注: `loadLocal/saveLocal` が参照する `_loadAllInvoices` 等のアダプタは Task5〜7 で各 kind の配線時に定義する。
> このタスクでは SYNC_KINDS の形だけ確定させ、共通関数（次Step）を実装する。アダプタ未定義の kind は
> Task5以降で実関数に接続するまで syncAll から除外する `SYNC_ENABLED` 配列で制御する（次Step）。

- [ ] **Step 3: 共通 push/pull/syncAll を追加**

```javascript
  let SYNC_ENABLED = []; // 配線済み kind だけを順次ここへ足す（Task5〜7）
  function _gasUrlOne() { return (localStorage.getItem('gas_url') || '').trim(); }

  async function pullKind(kind) {
    const cfg = SYNC_KINDS[kind]; const url = _gasUrlOne();
    if (!cfg || !url) return { pulled: 0 };
    const res = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=list&kind=' + kind + '&_ts=' + Date.now(),
      { method: 'GET', redirect: 'follow', cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'list失敗');
    const sheetRecs = (data.rows || []).map(cfg.fromRow);
    const merged = _mergeRecordsLWW(cfg.loadLocal(), sheetRecs, cfg.keyField);
    cfg.saveLocal(merged);
    cfg.redraw();
    return { pulled: sheetRecs.length };
  }

  async function pushKind(kind, records) {
    const cfg = SYNC_KINDS[kind]; const url = _gasUrlOne();
    if (!cfg || !url) return { ok: false };
    const list = records || cfg.loadLocal();
    const rows = list.map(cfg.toRow);
    if (!rows.length) return { ok: true, added: 0 };
    const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'upsert', kind: kind, rows: rows }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'upsert失敗');
    return data;
  }

  async function syncAll() {
    const url = _gasUrlOne();
    if (!url) return { ok: false, reason: 'no-url' };
    let pulled = 0, pushed = 0;
    for (const kind of SYNC_ENABLED) { try { const r = await pullKind(kind); pulled += (r.pulled || 0); } catch (e) { console.warn('pull', kind, e); } }
    for (const kind of SYNC_ENABLED) { try { const r = await pushKind(kind); pushed += (r.updated || 0) + (r.added || 0); } catch (e) { console.warn('push', kind, e); } }
    return { ok: true, pulled, pushed };
  }
  window._syncDebug = { pullKind, pushKind, syncAll, SYNC_KINDS };
```

- [ ] **Step 4: 構文チェック**

Run: 前提セクションの構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): 統合同期エンジン(登録表＋push/pull/syncAll)を追加（未配線）

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: staff と invoice を新エンジンへ配線（JSONブロブ型）

**Files:**
- Modify: `index.html`

最も整っている2種類を最初に新エンジンへ載せ替える。アダプタ関数を定義し `SYNC_ENABLED` に追加。
staff の `saveStaffEdit`、invoice の保存フックが `pushKind` を呼ぶよう差し替える。

- [ ] **Step 1: アダプタ関数を追加**

`index.html`（SYNC_KINDS定義の後ろ）に:
```javascript
  // ---- invoice アダプタ（inv_${num} と一覧から全件取得/保存）----
  function _loadAllInvoices() {
    const out = [];
    const list = JSON.parse(localStorage.getItem('invoices_saved') || '[]'); // 既存の請求書番号一覧キーに合わせる
    for (const num of list) {
      const raw = localStorage.getItem('inv_' + num); if (!raw) continue;
      let rec; try { rec = JSON.parse(raw); } catch (e) { continue; }
      rec['受注No'] = String(num); out.push(rec);
    }
    return out;
  }
  function _saveAllInvoices(recList) {
    const nums = [];
    for (const rec of recList) {
      const num = String(rec['受注No'] || ''); if (!num) continue;
      localStorage.setItem('inv_' + num, JSON.stringify(rec)); nums.push(num);
    }
    localStorage.setItem('invoices_saved', JSON.stringify(nums));
  }
```

> ⚠️ 実装時に確認: 請求書一覧のキー名（`invoices_saved` か別名か）と `inv_${num}` のJSON構造を
> 既存の `syncFromInvoiceSheet`(9860) と `sendInvoiceToSheet`(9719) を読んで合わせること。
> staff は既存の `loadStaffMaster`/`saveStaffMaster` をそのまま使うためアダプタ不要。

- [ ] **Step 2: SYNC_ENABLED に追加**

`SYNC_ENABLED` の行を次に変更:
```javascript
  let SYNC_ENABLED = ['staff', 'invoice'];
```

- [ ] **Step 3: 保存フックを差し替え**

`saveStaffEdit`(9590付近) 末尾の `scheduleStaffPush(key)` を次に置換:
```javascript
    // 旧 scheduleStaffPush は廃止。新エンジンで該当1件だけ送る。
    const _row = loadStaffMaster().find(s => s.key === key);
    if (_row && _gasUrlOne()) { pushKind('staff', [_row]).catch(e => { pendingAdd('staff', key); }); }
```
請求書の保存処理（`scheduleInvoicePush`→`sendInvoiceToSheet` の呼び出し箇所）を次の方針で置換:
保存直後に `pushKind('invoice', [savedInvoiceRecord]).catch(e => pendingAdd('invoice', num));`
（`savedInvoiceRecord` は `_updatedAt` を `_stampNow` 済みのもの）。

- [ ] **Step 4: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: ブラウザ機能確認（stub fetch）**

ローカルサーバ起動後、Chrome MCP タブ `http://localhost:8765/index.html` で:
```js
// fetch をスタブして pull/push の入出力を検証（localStorage はテスト用に別キーを使うため実害なし）
const calls = [];
const realFetch = window.fetch;
window.fetch = async (u, opt) => { calls.push({ u: String(u), opt });
  if (String(u).includes('action=list')) return { json: async () => ({ ok: true, rows: [
    { 'キー':'shin', 'データ': JSON.stringify({ key:'shin', name:'TEST城間', _updatedAt:'2099-01-01T00:00:00.000Z' }), '更新日時':'2099-01-01T00:00:00.000Z', '削除フラグ':'' }
  ] }) };
  return { json: async () => ({ ok: true, updated: 1, added: 0 }) };
};
localStorage.setItem('gas_url','https://script.google.com/macros/s/TEST/exec');
await window._syncDebug.pullKind('staff');
const after = JSON.parse(localStorage.getItem('staff_master')).find(s=>s.key==='shin');
console.log('PULL適用:', after && after.name); // → 'TEST城間'（更新日時2099が勝つ）
window.fetch = realFetch;
```
Expected: コンソールに `PULL適用: TEST城間`。確認後、テストで書き換えた staff_master を元に戻す
（`location.reload()` 後に再 pull、または事前に控えた値で復元）。localhost のテストデータは消す。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): staff/invoiceを統合エンジンへ配線

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: client / product / media / equip を新エンジンへ配線（読める列型）

**Files:**
- Modify: `index.html`

4つのマスタ系アダプタを定義し `SYNC_ENABLED` に追加。各保存箇所の単発 upsert を `pushKind` 経由に統一。
equip は `action:'sync'`（全置換）→ `pushKind('equip')`（1件1行upsert）へ置換し、union/墓標処理を撤去。

- [ ] **Step 1: アダプタ関数を追加**

```javascript
  // client/product/media は localStorage の {at, rows:[...]} キャッシュを使う。rows のキーがシート列。
  function _cacheLoad(key) { try { return (JSON.parse(localStorage.getItem(key) || '{}').rows) || []; } catch (e) { return []; } }
  function _cacheSave(key, rows) { localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows })); }
  function _loadClientRows()  { return _cacheLoad('client_master_cache'); }
  function _saveClientRows(l) { _cacheSave('client_master_cache', l); }
  function _loadProductRows()  { return _cacheLoad('product_master_cache'); }
  function _saveProductRows(l) { _cacheSave('product_master_cache', l); }
  function _loadMediaRows()  { return _cacheLoad('media_list_cache'); }
  function _saveMediaRows(l) { _cacheSave('media_list_cache', l); }
  // equip は equip_master 配列（{id,cat,name,code,qty,price}）
  function _loadEquipRows()  { try { return JSON.parse(localStorage.getItem('equip_master') || '[]'); } catch (e) { return []; } }
  function _saveEquipRows(l) { localStorage.setItem('equip_master', JSON.stringify(l)); }
```

> ⚠️ 実装時に確認: 各キャッシュキー名（`client_master_cache`/`product_master_cache`/`media_list_cache`）と
> rows の列名が、新シートの KINDS.headers と一致するか。media のキー列ヘッダ（`メディアID`）と取引先キー
> （`取引先コード`）は既存 `fetchMediaList`(10493)/`fetchClientMaster`(10009) を読んで実列名に合わせ、
> 必要なら KINDS.headers と SYNC_KINDS の keyField/keyHeader を実列名へ修正する。

- [ ] **Step 2: SYNC_ENABLED に追加**

```javascript
  let SYNC_ENABLED = ['staff', 'invoice', 'client', 'product', 'media', 'equip'];
```

- [ ] **Step 3: 保存フックを差し替え／equip特殊処理を撤去**

- 取引先登録（10198付近の `fetch(... action:'upsert' ...)`）→ 保存後 `pushKind('client', [_stampNow(row)])` に置換。
- 商品・メディアの保存箇所も同様に該当レコードを `_stampNow` して `pushKind('product'|'media', [rec])`。
- `sendEquipMasterToSheet`(12732, `action:'sync'`) の呼び出しを全廃し、機材保存箇所で
  `pushKind('equip', [_stampNow(changedItem)])` を呼ぶ。`fetchEquipMaster` の取り込みは `pullKind('equip')` に置換。
- 機材の union マージ・`equip_deleted` 墓標ロジック（12785付近〜）を削除。機材削除は該当 id を
  `_deleted:true` 付きで `pushKind('equip', [{ id, _deleted:true, _updatedAt:new Date().toISOString() }])`。

- [ ] **Step 4: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: ブラウザ機能確認（stub fetch、equipのLWWと削除）**

`http://localhost:8765/index.html` で fetch をスタブし、`pullKind('equip')` がシート新レコードを
追加し、`削除フラグ:'1'` のレコードでローカルから消えることをコンソールで確認（Task5 Step5と同型）。
確認後 localStorage の equip_master をテスト前の値へ復元し、localhost のテストデータを消す。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): client/product/media/equipを統合エンジンへ配線し機材の特殊処理を撤去

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: order（親）と child（子）を新エンジンへ配線

**Files:**
- Modify: `index.html`

案件（読める列）と子（JSONブロブ）を配線。案件の削除を `action:'delete'`＋`deleted_ws` から
論理削除（削除フラグ）へ移行。

- [ ] **Step 1: アダプタ関数を追加**

```javascript
  // order: projects_saved（案件番号配列）＋ ws_${num}（案件本体）。_project に本体を、受注No にキーを持つ。
  function _loadOrderRecords() {
    const out = [];
    const nums = JSON.parse(localStorage.getItem('projects_saved') || '[]');
    for (const num of nums) {
      const raw = localStorage.getItem('ws_' + num); if (!raw) continue;
      let p; try { p = JSON.parse(raw); } catch (e) { continue; }
      out.push({ 受注No: String(num), _project: p, _updatedAt: p._updatedAt || '' });
    }
    return out;
  }
  function _saveOrderRecords(recList) {
    const nums = [];
    for (const rec of recList) {
      const num = String(rec['受注No'] || ''); if (!num) continue;
      const p = rec._project || {}; p._updatedAt = rec._updatedAt || p._updatedAt || '';
      localStorage.setItem('ws_' + num, JSON.stringify(p)); nums.push(num);
    }
    localStorage.setItem('projects_saved', JSON.stringify(nums));
  }
  // child: ワークシート詳細。order と同じ ws_${num} を使うなら child は order に統合可能。
  // 別保存（詳細専用キー）がある場合のみ実装する。詳細は sendWorksheetToChild(11901) を読んで判断。
  function _loadChildRecords() { return []; }   // ← 実装時に子の保存実態に合わせて定義
  function _saveChildRecords() {}               //    （order と同一なら child を SYNC_ENABLED に入れない）
```

> ⚠️ 実装時に確認: `ws_${num}` が案件本体か詳細かを確認し、`_project` のキー構造が
> `projectToOrderRow`/`orderRowToProject` の入出力（9958/9984）と一致するよう合わせる。
> 子シートが親と同じ `ws_${num}` を補完するだけなら child kind は使わず order に一本化する
> （YAGNI: 重複配線を避ける）。

- [ ] **Step 2: SYNC_ENABLED を確定**

子を別管理しないなら:
```javascript
  let SYNC_ENABLED = ['staff', 'invoice', 'client', 'product', 'media', 'equip', 'order'];
```
子を別管理するなら末尾に `'child'` を追加。

- [ ] **Step 3: 案件の保存・削除フックを差し替え**

- 案件保存（`sendOrderToSheet`(12057) と `sendWorksheetToChild` の呼び出し箇所）→
  保存直後に該当案件本体へ `_updatedAt` を `_stampNow` 相当で付与し、
  `pushKind('order', [{ 受注No:num, _project:p, _updatedAt:p._updatedAt }]).catch(e => pendingAdd('order', num))`。
- 案件削除（14150付近、親に `action:'delete'`、`deleted_ws` 管理）→ 論理削除へ:
  ```javascript
  pushKind('order', [{ 受注No: num, _project: {}, _updatedAt: new Date().toISOString(), _deleted: true }])
    .catch(e => pendingAdd('order', num));
  ```
  ローカルでは `projects_saved` から番号を除去。`deleted_ws` への積み込みは廃止。

- [ ] **Step 4: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: ブラウザ機能確認**

`http://localhost:8765/index.html` で stub fetch を使い、`pullKind('order')` がシート行を
`orderRowToProject` 経由でローカルへ反映し、`削除フラグ:'1'` の案件がローカルから消えることを確認。
確認後 projects_saved / ws_* のテスト値を復元し、localhost テストデータを消す。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): order(親)/child(子)を統合エンジンへ配線し案件削除を論理削除化

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 起動時取り込み・再送・手動同期を新エンジンへ集約

**Files:**
- Modify: `index.html`（起動処理 12030付近、データ管理画面の同期ボタン群）

旧 per-type の起動取り込み（`fetchEquipMaster`/`fetchClientMaster`/…/`syncFromStaffSheet` 等）と
各手動ボタンを `syncAll()`／`pullKind()` に集約する。

- [ ] **Step 1: 起動時取り込みを置換**

起動処理（12030付近の `if (localStorage.getItem('gas_url_equip')) fetchEquipMaster(false)…` 群）を次に置換:
```javascript
    if (_gasUrlOne()) {
      setTimeout(() => { for (const k of SYNC_ENABLED) { pullKind(k).catch(e => console.warn('boot pull', k, e)); } }, 1500);
      setTimeout(() => { retrySyncPending(); }, 4000); // 既存の再送キュー処理を流用
    }
```

- [ ] **Step 2: 手動「全部同期」ボタンを追加/差し替え**

データ管理画面の同期ボタン群を1つの「🔄 全部同期」に集約し、ハンドラを:
```javascript
  async function manualSyncAll() {
    const el = document.getElementById('sync-status-all'); // データ管理画面に1つだけ置く
    const set = (m, c) => { if (el) { el.textContent = m; el.style.color = c || '#666'; } };
    if (!_gasUrlOne()) { set('⚠️ 同期URLが未設定です（設定画面で登録）', '#c0392b'); return; }
    set('🔄 全部同期中…', '#2980b9');
    try { const r = await syncAll(); set(`✅ 取得${r.pulled}・送信${r.pushed}（${new Date().toLocaleTimeString('ja-JP')}）`, '#1a7a40'); }
    catch (e) { set('❌ 同期失敗：' + e.message, '#c0392b'); }
  }
```

- [ ] **Step 3: 再送キュー retrySyncPending を kind 対応に**

`retrySyncPending`（既存）が `{kind, key}` を読んで `pushKind(kind, [該当1件])` を呼ぶよう修正。
該当1件は `SYNC_KINDS[kind].loadLocal().find(r => String(r[keyField])===key)` で最新版を作り直す。

- [ ] **Step 4: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: ブラウザ機能確認**

`http://localhost:8765/index.html` を reload し、コンソールに `boot pull` のエラーが出ないこと、
データ管理画面に「🔄 全部同期」ボタンが1つ表示されること、押すと status が更新されることを確認
（URL未設定なら警告表示）。localhost のテストデータは消す。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): 起動取り込み・再送・手動同期をsyncAll/pullKindへ集約

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 設定UIを「URL1個」に簡素化＋初回シードボタン

**Files:**
- Modify: `index.html`（設定画面 5733-5780、保存処理 9337-9344、起動時固定URL設定 6598-6675）

8個のURL入力欄を1個（`gas_url`）に統合。初回シード（全件送信）ボタンを追加。

- [ ] **Step 1: 設定画面のURL欄を1個に**

5733-5780 の8つの `<input id="gas-url-*-input">` を、説明文付きの1つだけに置換:
```html
        <input id="gas-url-input" type="text" class="wsd-input"
          placeholder="同期URL https://script.google.com/macros/s/.../exec">
        <div style="font-size:11px;color:#999;margin-top:4px;">統合シートのWeb App URLを1つだけ入力します</div>
```
旧 child/client/product/media/driving/invoice/staff 入力欄のHTMLを削除。

- [ ] **Step 2: 保存処理を1URLに**

9337-9344 の各 `localStorage.setItem('gas_url_*', ...)` を削除し、`gas_url` のみ保存に変更。
6598-6675 の起動時固定URL強制設定（8個のハードコードURL）を撤去し、`gas_url` のみ扱う。
（既存の `gas_url_*` キーは破壊的削除しない＝古い端末の保険。読まないだけ。）

- [ ] **Step 3: 初回シードボタンを追加**

データ管理画面に:
```html
  <button id="seed-all-btn" class="..." onclick="seedAllToSheet()">🚀 新シートへ全部送信（初回シード）</button>
  <div id="seed-status" style="font-size:12px;color:#666;margin-top:4px;"></div>
```
ハンドラ:
```javascript
  async function seedAllToSheet() {
    const el = document.getElementById('seed-status');
    const set = (m, c) => { if (el) { el.textContent = m; el.style.color = c || '#666'; } };
    if (!_gasUrlOne()) { set('⚠️ 先に同期URLを設定してください', '#c0392b'); return; }
    if (!confirm('この端末の全データを新シートへ送信します。よろしいですか？')) return;
    set('🚀 送信中…', '#2980b9');
    let total = 0;
    for (const kind of SYNC_ENABLED) {
      try { const r = await pushKind(kind); total += (r.added || 0) + (r.updated || 0); set('🚀 送信中… ' + kind, '#2980b9'); }
      catch (e) { console.warn('seed', kind, e); }
    }
    set('✅ シード完了：' + total + '件送信', '#1a7a40');
  }
```

- [ ] **Step 4: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 5: 影響範囲・ブラウザ確認**

`grep -n "gas_url_" index.html` で旧キー参照が残っていないこと（保険の保存除き読み取りが消えたこと）を確認。
`http://localhost:8765/index.html` の設定画面にURL欄が1個、データ管理にシードボタンが表示されることを確認。
デスクトップ＋モバイル幅（DevTools）でレイアウト崩れが無いこと（`@media (min-width:768px)` の該当画面）。
localhost テストデータは消す。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(sync): 設定UIをURL1個に簡素化し初回シードボタンを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 旧 per-type 同期コードと削除管理キーの撤去

**Files:**
- Modify: `index.html`

新エンジンへ移行済みなので、使われなくなった旧関数とローカルキーを削除する。

- [ ] **Step 1: 撤去対象を列挙して確認**

```bash
cd "<repoルート>" && grep -nE "sendOrderToSheet|sendWorksheetToChild|sendInvoiceToSheet|sendInvoiceDeleteToSheet|syncFromInvoiceSheet|syncFromChildSheet|syncFromSheet|sendStaffToSheet|syncFromStaffSheet|scheduleStaffPush|sendEquipMasterToSheet|deleted_ws|deleted_inv|equip_deleted|manualSyncStaff|manualSyncInvoices" index.html
```
それぞれが新エンジン（pushKind/pullKind/syncAll）に置換済みで、呼び出し元が無いことを確認してから削除。
**呼び出し元が残っている関数は消さない**（先に呼び出し元をTask5〜8で置換済みのはず。未置換なら戻って対応）。

- [ ] **Step 2: 関数本体を削除**

呼び出し元ゼロを確認した上で、上記の旧 send*/syncFrom*/manualSync* 関数本体と、
`deleted_ws`/`deleted_inv`/`equip_deleted` の読み書き箇所を削除。機材 union/墓標の残骸も削除。

- [ ] **Step 3: 構文チェック**

Run: 構文チェック手順
Expected: `✅ 構文チェックOK`

- [ ] **Step 4: 影響範囲確認**

```bash
grep -nE "sendOrderToSheet|syncFromStaffSheet|deleted_ws|equip_deleted" index.html
```
Expected: ヒット0件（完全撤去）。

`http://localhost:8765/index.html` を reload し、コンソールに `is not defined` 等のエラーが出ないこと、
案件/請求書/機材/取引先/スタッフの各画面が開けて表示が崩れないことを確認。localhost テストデータは消す。

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
refactor(sync): 旧per-type同期関数と削除管理キーを撤去

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: セットアップ＆移行手順ドキュメント

**Files:**
- Create: `docs/superpowers/unified-sheet-setup.md`

初心者向けに、新スプレッドシート作成→Code.gs貼付→デプロイ→URL設定→初回シード→他端末取り込み、を
画面の言葉で説明する。`staff-sheet-setup.md` の文体・粒度を踏襲。

- [ ] **Step 1: ドキュメントを作成**

`docs/superpowers/unified-sheet-setup.md` に次の章立てで記述（各章は具体的な操作手順を書く）:
```markdown
# 同期を1個にまとめる — セットアップ＆移行手順（初心者向け）

## これは何？
8個のスプレッドシート同期を、1個のスプレッドシート＋1個のApps Script＋URL1個にまとめる手順。
データは各端末のローカルに残っているので、新シートへ「全部送信」すれば移せる。消えない。

## 手順の全体像
1. 新しい空のスプレッドシートを1個作る
2. 拡張機能→Apps Script に unified-sheet-Code.gs を貼る
3. SYNC_SECRET を今までと同じ合言葉にする
4. ウェブアプリとしてデプロイ → URL1個をコピー
5. アプリの設定→「同期URL」にURL1個を貼る
6. 1台で「🚀 新シートへ全部送信（初回シード）」を押す
7. 他端末はURL1個を入れて起動 → 自動取り込み

## 1. スプレッドシートを作る
（タブは自動で作られるので空でOK、と明記）

## 2〜4. Code.gs貼付・合言葉・デプロイ
（staff-sheet-setup.md と同じ要領。次のユーザーとして実行=自分、アクセス=全員）

## 5. アプリにURLを登録
（設定画面の「同期URL」1欄に貼って保存。合言葉も確認）

## 6. 初回シード（1台だけ）
（データ管理→🚀新シートへ全部送信。✅件数が出ればOK）

## 7. 他端末
（URL1個を入れて起動、1.5秒後に自動取り込み）

## 動作確認
（1台で案件を保存→別端末で起動して反映を確認。削除も伝播することを確認）

## しくみ・既知の限界
- 全タブ共通の「更新日時で後勝ち（サーバ側LWW）」。
- 削除は削除フラグで論理削除（行は残る）。
- 合言葉はURLクエリに乗る（内部ツールとして許容）。
- 旧8シートは保険として残してよい。問題なければ後で削除。

## 関連ファイル
- docs/superpowers/unified-sheet-Code.gs（貼り付けるGAS）
- docs/superpowers/specs/2026-06-01-sync-simplification-design.md（設計）
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/unified-sheet-setup.md
git commit -m "$(cat <<'EOF'
docs(sync): 統合同期のセットアップ＆移行手順を追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 全体結合確認と本番反映

**Files:**
- 確認のみ（必要なら index.html 微修正）

- [ ] **Step 1: 構文チェック＋ユニットテスト**

```bash
cd "<repoルート>" && node --test tests/*.test.mjs && echo "---" && \
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,o="";while((m=re.exec(h))){o+=m[1]+"\n;\n";}fs.writeFileSync("/tmp/_check.js",o);' && node --check /tmp/_check.js && echo "✅ 構文OK"
```
Expected: 全テストPASS＋`✅ 構文OK`。

- [ ] **Step 2: ブラウザ通し確認（実GAS、任意）**

ユーザーが新GASをデプロイ済みなら、テスト用の合言葉/URLを localhost タブに入れて
`curl "<URL>?action=list&kind=staff&token=<合言葉>"` で `{ok:true,rows:[...]}` が返ることを確認。
確認後 localhost のURL/トークンは消す。

- [ ] **Step 3: 最終 push**

```bash
git push origin main 2>&1 | grep -viE "github.com|ghp_|token|x-access"
```

- [ ] **Step 4: ユーザーへ移行案内**

`unified-sheet-setup.md` の手順に沿って、新スプレッドシート作成→デプロイ→URL設定→初回シードを案内する。
旧8シートは当面残置でよい旨を伝える。
```
