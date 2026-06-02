# 納品書（delivery note）機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 請求書／見積書の編集画面（`#inv-detail-screen`）に3つ目のモード「納品書」を追加し、請求書とほぼ同一内容の納品書を最小の手間で発行できるようにする。

**Architecture:** 既存の `_docMode`（'invoice'/'estimate'）に 'delivery' を足す。明細・宛先・金額計算・印刷テンプレートは請求書からまるごと流用し、納品書で変えるのはラベル（タイトル・日付・金額）とテーマ色だけ。採番は `DLV-{年2桁}{連番3桁}`、保存先は既存の `inv_${num}`、同期は既存 `SYNC_KINDS.invoice` にそのまま乗るため GAS 側の変更は不要。請求書編集画面に「📦 この内容で納品書を作成」ボタンを足すのが本機能の肝。

**Tech Stack:** 単一HTMLファイル（`index.html`、HTML/CSS/JSすべてインライン）。テストフレームワークは無い。各タスクの自動検証は `node --check`（インライン `<script>` を抽出して構文チェック）、機能確認はブラウザでの手動テスト。

**設計書（承認済み）:** `docs/superpowers/specs/2026-06-02-delivery-note-design.md`

---

## このプロジェクト特有の進め方（重要）

- **編集対象は `index.html` 1ファイルのみ。** HTML/CSS/JS すべてインライン。
- このプロジェクトにテストランナーは無い。**各タスクの「テスト」は (a) `node --check` による構文チェック ＋ (b) ブラウザでの手動確認** とする（CLAUDE.md の必須チェック工程に準拠）。TDD の「赤→緑」は、構文エラーを出さずに目的の挙動が出ることで代替する。
- **構文チェックの共通コマンド**（各タスクで使う。`index.html` のディレクトリで実行）:

```bash
python3 - <<'PY'
import re
html = open('index.html', encoding='utf-8').read()
blocks = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
open('/tmp/inline.js', 'w', encoding='utf-8').write('\n;\n'.join(b for b in blocks if 'function' in b))
PY
node --check /tmp/inline.js && echo "SYNTAX OK"
```

- コミットメッセージ末尾は必ず `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`。
- main への push は許可済み（フィルタ `grep -viE "github.com|ghp_|token|x-access"` 経由）。ただし**各タスクではコミットまで**を行い、push はユーザーの指示時にまとめて行う（または最後にまとめて）。
- **既存の請求書・見積書の挙動を壊さないこと。** 'delivery' は既存の二分岐に「足す」形で実装し、未知値は 'invoice' にフォールバックする。

---

## ファイル構成（どこを触るか）

すべて `index.html` 内。タスク順に並べた、触る関数／要素と現在の行番号（おおよそ）:

| Task | 対象 | 現在地 | 役割 |
|---|---|---|---|
| 1 | `generateNewInvNum(mode)` | ~8257 | 採番。`DLV-` を3系統目として追加 |
| 2 | `_actionToMode()`（新規）＋ 各 action 分岐 | ~8280, 8298, 8605, 13372, 13472, 10968, 11777 | action→mode の3値正規化 |
| 3 | `setDocMode(mode)` | ~8546 | 編集画面ラベルの3値化＋未知値フォールバック |
| 4 | `buildDocHTML(type)` | ~12186 | 印刷テンプレの3値化 |
| 5 | `openPrintPreview(type)` | ~9210 | プレビュー分岐の3値化 |
| 6 | `openDocList(mode)` / `renderDocList()` / `_docListMode` | ~10923 | 一覧画面の青テーマ分岐 |
| 7 | モードトグルボタン（HTML） | ~4738 | `data-mode="delivery"` ボタン追加 |
| 8 | 納品書ボタン（HTML）＋ `openNewDelivery()` | ~3973, ~10569 | プレースホルダを `openDocList('delivery')` に差し替え |
| 9 | `createDeliveryFromCurrent()`（新規）＋ 起動ボタン（HTML） | ~8455 付近に関数, 編集画面ヘッダにボタン | ⭐請求書からワンタップ作成 |
| 10 | 全体結合確認 | — | 7観点の手動テスト＋最終コミット |

---

### Task 1: 採番に `DLV-` を追加（`generateNewInvNum`）

**Files:**
- Modify: `index.html`（`generateNewInvNum` 関数、現 ~8257-8278）

- [ ] **Step 1: 現状を確認（赤に相当）**

現在の `generateNewInvNum` は 2系統のみ:

```javascript
  function generateNewInvNum(mode) {
    const prefix = (mode === 'estimate') ? 'EST-' : 'INV-';
```

`generateNewInvNum('delivery')` を呼ぶと `INV-` になってしまう（これが直す対象）。

- [ ] **Step 2: prefix を3系統に拡張**

`index.html` の以下を置換する。

旧:
```javascript
    const prefix = (mode === 'estimate') ? 'EST-' : 'INV-';
```

新:
```javascript
    const prefix = (mode === 'estimate') ? 'EST-'
                 : (mode === 'delivery') ? 'DLV-'
                 : 'INV-';
```

採番ロジック（`head = prefix + year2`、`inv_${head}` の連番を走査、`padStart(3,'0')`）は系統ごとに `head` が違うため**そのままで系統別の独立連番**になる。変更不要。

- [ ] **Step 3: 構文チェック（緑）**

「構文チェックの共通コマンド」を実行。`SYNTAX OK` を確認。

- [ ] **Step 4: ブラウザ確認**

DevTools コンソールで `generateNewInvNum('delivery')` を実行 →
Expected: `"DLV-26001"` のような `DLV-` 始まりの番号が返る。
`generateNewInvNum('invoice')` → `INV-26xxx`、`generateNewInvNum('estimate')` → `EST-26xxx` が変わらないことも確認。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): 納品書の採番 DLV- を generateNewInvNum に追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: action→mode の3値正規化ヘルパー

請求書編集画面を開く各経路は `action`（'create'/'estimate'/'delivery'/'pdf'）を受け取り、`setDocMode` と `generateNewInvNum` に渡すモードへ変換している。現状は `action === 'estimate' ? 'estimate' : 'invoice'` の二分岐が散在する。共通ヘルパーで3値化する。

**Files:**
- Modify: `index.html`（ヘルパー新設＋呼び出し箇所5+1ヶ所）

- [ ] **Step 1: ヘルパー関数を新設**

`generateNewInvNum` の直前（現 ~8256、`function generateNewInvNum` の行の直前）に挿入する。

挿入する文字列（`  function generateNewInvNum(mode) {` の直前に置く）:

```javascript
  // 編集画面を開くときの action 値を docMode（'invoice'/'estimate'/'delivery'）へ正規化
  function _actionToMode(action) {
    if (action === 'estimate') return 'estimate';
    if (action === 'delivery') return 'delivery';
    return 'invoice'; // 'create' / 'pdf' / その他はすべて請求書扱い
  }

```

- [ ] **Step 2: `_openBlankInvScreen` の採番とモード設定を3値化**

`_openBlankInvScreen`（現 ~8280-8301）内の2ヶ所を置換する。

旧（採番、現 ~8285）:
```javascript
    const newNum = generateNewInvNum(action === 'estimate' ? 'estimate' : 'invoice');
```
新:
```javascript
    const newNum = generateNewInvNum(_actionToMode(action));
```

旧（モード設定、現 ~8298）:
```javascript
    setDocMode(action === 'estimate' ? 'estimate' : 'invoice');
```
新:
```javascript
    setDocMode(_actionToMode(action));
```

- [ ] **Step 3: `openInv` のモード設定を3値化**

`openInv`（現 ~8605）の以下を置換する。

旧:
```javascript
    // 見積書／請求書 どちらも編集画面を開く（編集可能）
    setDocMode(action === 'estimate' ? 'estimate' : 'invoice');
```
新:
```javascript
    // 見積書／請求書／納品書 いずれも編集画面を開く（編集可能）
    setDocMode(_actionToMode(action));
```

- [ ] **Step 4: `_openBlankInvFromWS` の2ヶ所を3値化**

`_openBlankInvFromWS`（現 ~13341-13475）内の2ヶ所を置換する。

旧（保存済み復元時、現 ~13372）:
```javascript
      setDocMode(savedStatus.docMode || (action === 'estimate' ? 'estimate' : 'invoice'));
```
新:
```javascript
      setDocMode(savedStatus.docMode || _actionToMode(action));
```

旧（新規生成時、現 ~13472）:
```javascript
    // 見積書・請求書 どちらも編集画面で開く（編集可能）
    setDocMode(action === 'estimate' ? 'estimate' : 'invoice');
```
新:
```javascript
    // 見積書・請求書・納品書 いずれも編集画面で開く（編集可能）
    setDocMode(_actionToMode(action));
```

- [ ] **Step 5: `createNewDoc` と `openDocFromList` の action 決定を3値化**

`createNewDoc`（現 ~10965-10969）の以下を置換する。

旧:
```javascript
    setTimeout(() => _openBlankInvScreen(_docListMode === 'estimate' ? 'estimate' : 'create'), 200);
```
新:
```javascript
    setTimeout(() => _openBlankInvScreen(
      _docListMode === 'estimate' ? 'estimate'
      : _docListMode === 'delivery' ? 'delivery'
      : 'create'), 200);
```

`openDocFromList`（現 ~11776-11786）の以下を置換する。

旧:
```javascript
    const action = _docListMode === 'estimate' ? 'estimate' : 'create';
```
新:
```javascript
    const action = _docListMode === 'estimate' ? 'estimate'
                 : _docListMode === 'delivery' ? 'delivery'
                 : 'create';
```

- [ ] **Step 6: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 7: ブラウザ確認（既存退行なし）**

請求書・見積書を従来どおり開けること（採番・ラベルが従来どおり）を確認。'delivery' 経路はまだ UI から呼べないので Task 6 以降で確認する。コンソールで `_actionToMode('delivery')` → `"delivery"`、`_actionToMode('estimate')` → `"estimate"`、`_actionToMode('create')` → `"invoice"` を確認。

- [ ] **Step 8: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
refactor(delivery): action→docMode を _actionToMode で3値正規化

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `setDocMode` を3値化（編集画面ラベル＋フォールバック）

**Files:**
- Modify: `index.html`（`setDocMode`、現 ~8546-8567）

- [ ] **Step 1: 現状を確認（赤に相当）**

現状は `_docMode = (mode === 'estimate') ? 'estimate' : 'invoice';` の二択。`setDocMode('delivery')` を呼んでも 'invoice' ラベルになってしまう（これが直す対象）。

- [ ] **Step 2: `setDocMode` 本体を値テーブル方式に置換**

`setDocMode` 関数全体（現 ~8546-8567）を以下で置換する。

旧:
```javascript
  function setDocMode(mode) {
    _docMode = (mode === 'estimate') ? 'estimate' : 'invoice';
    const isEstimate = _docMode === 'estimate';
    // ヘッダー
    const hdrTitle = document.getElementById('invd-header-title');
    if (hdrTitle) hdrTitle.textContent = isEstimate ? '🧮 御見積書' : '📄 御請求書';
    // 用紙タイトル
    const docTitle = document.getElementById('invd-title-row');
    if (docTitle) docTitle.textContent = isEstimate ? '御　見　積　書' : '御　請　求　書';
    // 日付ラベル
    const dateLbl = document.getElementById('invd-date-label');
    if (dateLbl) dateLbl.textContent = isEstimate ? '御見積日' : '御請求日';
    // 金額バナー
    const totalLbl = document.getElementById('invd-total-label');
    if (totalLbl) totalLbl.textContent = isEstimate ? '御見積金額（税込）' : '御請求金額（税込）';
    // モードトグルの見た目
    document.querySelectorAll('.invd-mode-btn').forEach(b => {
      const selected = b.dataset.mode === _docMode;
      b.style.background = selected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';
      b.style.fontWeight = selected ? 'bold' : 'normal';
    });
  }
```

新:
```javascript
  // モード別ラベルテーブル（invoice / estimate / delivery）
  const DOC_LABELS = {
    invoice:  { header: '📄 御請求書', title: '御　請　求　書', date: '御請求日', total: '御請求金額（税込）' },
    estimate: { header: '🧮 御見積書', title: '御　見　積　書', date: '御見積日', total: '御見積金額（税込）' },
    delivery: { header: '📦 御納品書', title: '御　納　品　書', date: '納品日',   total: '御納品金額（税込）' },
  };

  function setDocMode(mode) {
    // 未知の値は請求書にフォールバック（既存の二択フォールバック方針を踏襲）
    _docMode = DOC_LABELS[mode] ? mode : 'invoice';
    const L = DOC_LABELS[_docMode];
    // ヘッダー
    const hdrTitle = document.getElementById('invd-header-title');
    if (hdrTitle) hdrTitle.textContent = L.header;
    // 用紙タイトル
    const docTitle = document.getElementById('invd-title-row');
    if (docTitle) docTitle.textContent = L.title;
    // 日付ラベル
    const dateLbl = document.getElementById('invd-date-label');
    if (dateLbl) dateLbl.textContent = L.date;
    // 金額バナー
    const totalLbl = document.getElementById('invd-total-label');
    if (totalLbl) totalLbl.textContent = L.total;
    // モードトグルの見た目
    document.querySelectorAll('.invd-mode-btn').forEach(b => {
      const selected = b.dataset.mode === _docMode;
      b.style.background = selected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';
      b.style.fontWeight = selected ? 'bold' : 'normal';
    });
  }
```

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 4: ブラウザ確認**

請求書編集画面を開いた状態でコンソールから `setDocMode('delivery')` を実行 →
Expected: ヘッダーが「📦 御納品書」、用紙タイトルが「御　納　品　書」、日付ラベルが「納品日」、金額バナーが「御納品金額（税込）」に変わる。
`setDocMode('invoice')` / `setDocMode('estimate')` で従来ラベルに戻ることも確認。`setDocMode('zzz')` → 請求書ラベル（フォールバック）。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): setDocMode を3値化し納品書ラベルを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `buildDocHTML` を3値化（印刷テンプレート）

**Files:**
- Modify: `index.html`（`buildDocHTML` 冒頭、現 ~12186-12190）

- [ ] **Step 1: 現状を確認（赤に相当）**

現状は `const isInvoice = type === 'invoice';` で請求書／見積書の二分岐。`buildDocHTML('delivery')` は見積書のタイトルになってしまう。

- [ ] **Step 2: タイトル決定部を値テーブルに置換**

`buildDocHTML` 冒頭（現 ~12187-12190）の4行を置換する。

旧:
```javascript
    const isInvoice  = type === 'invoice';
    const docTitle   = isInvoice ? '御　請　求　書' : '御　見　積　書';
    const dateLabel  = isInvoice ? '御請求日' : '御見積日';
    const amtLabel   = isInvoice ? '御請求金額' : '御見積金額';
```

新:
```javascript
    const _T = {
      invoice:  { title: '御　請　求　書', date: '御請求日', amt: '御請求金額' },
      estimate: { title: '御　見　積　書', date: '御見積日', amt: '御見積金額' },
      delivery: { title: '御　納　品　書', date: '納品日',   amt: '御納品金額' },
    };
    const _L = _T[type] || _T.invoice;
    const docTitle   = _L.title;
    const dateLabel  = _L.date;
    const amtLabel   = _L.amt;
```

> 注意: `buildDocHTML` 関数内の他の場所で `isInvoice` 変数を参照していないか確認すること。冒頭定義以外で `isInvoice` を使っていれば、その分岐も `type === 'invoice'` 等に置き換える。明細表・空行補充（15行）・合計欄・振込先（口座）欄のレイアウトは**一切変えない**（納品書も中身は請求書と同一の方針）。

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。確認後、`grep -n "isInvoice" index.html` を実行し、`buildDocHTML` 内に `isInvoice` の取り残しがないこと（`openDocList`/`renderDocList` 側の `isInvoice` は別物なので残ってよい）を目視確認する。

- [ ] **Step 4: ブラウザ確認**

請求書編集画面でコンソールから `document.getElementById('print-content').innerHTML = buildDocHTML('delivery')` を実行 →
Expected: 用紙タイトルが「御　納　品　書」、日付ラベルが「納品日」、明細表のレイアウトは請求書と同一。`buildDocHTML('invoice')` / `buildDocHTML('estimate')` が従来どおりであることも確認。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): buildDocHTML を3値化し納品書テンプレを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `openPrintPreview` を3値化（プレビュー呼び出し）

**Files:**
- Modify: `index.html`（`openPrintPreview`、現 ~9210-9228）

- [ ] **Step 1: 現状を確認（赤に相当）**

現状（~9212-9213）:
```javascript
    const html  = type === 'invoice' ? buildDocHTML('invoice') : buildDocHTML('estimate');
    const label = type === 'invoice' ? '請求書 印刷プレビュー' : '見積書 印刷プレビュー';
```
`openPrintPreview('delivery')` は見積書プレビューになってしまう。

- [ ] **Step 2: html とラベルを3値化**

旧:
```javascript
    const html  = type === 'invoice' ? buildDocHTML('invoice') : buildDocHTML('estimate');
    const label = type === 'invoice' ? '請求書 印刷プレビュー' : '見積書 印刷プレビュー';
```
新:
```javascript
    const html  = buildDocHTML(type === 'estimate' ? 'estimate' : type === 'delivery' ? 'delivery' : 'invoice');
    const label = type === 'estimate' ? '見積書 印刷プレビュー'
                : type === 'delivery' ? '納品書 印刷プレビュー'
                : '請求書 印刷プレビュー';
```

> 注意: 「📄 発行する」ボタン（`preview-issue-btn`）は `if (type === 'invoice')` のときだけ表示する既存ロジック（~9219）はそのまま。納品書・見積書では発行ボタンは出さない（else 分岐で `display='none'`）。納品書は請求書とは別書類なので「発行（請求済化）」はしない。変更不要。

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 4: ブラウザ確認**

請求書編集画面でコンソールから `openPrintPreview('delivery')` →
Expected: プレビューが開き、ラベルが「納品書 印刷プレビュー」、用紙が「御　納　品　書」、発行ボタンは非表示。`openPrintPreview('invoice')` では発行ボタンが出る（既存どおり）ことも確認。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): openPrintPreview を3値化し納品書プレビューを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `openDocList` / `renderDocList` に納品書（青テーマ）を追加

**Files:**
- Modify: `index.html`（`_docListMode` コメント ~10923、`openDocList` ~10925-10959、`renderDocList` のアクセント色 ~11020-11022）

- [ ] **Step 1: 現状を確認（赤に相当）**

`openDocList` は `_docListMode = (mode === 'invoice') ? 'invoice' : 'estimate';` で二択。`openDocList('delivery')` は見積書一覧（橙）になってしまう。

- [ ] **Step 2: `_docListMode` の初期化コメントを更新**

旧（~10923）:
```javascript
  let _docListMode = 'estimate'; // 'estimate' / 'invoice'
```
新:
```javascript
  let _docListMode = 'estimate'; // 'estimate' / 'invoice' / 'delivery'
```

- [ ] **Step 3: `openDocList` を3値化（青テーマ）**

`openDocList` 関数全体（現 ~10925-10959）を以下で置換する。

旧:
```javascript
  function openDocList(mode) {
    _docListMode = (mode === 'invoice') ? 'invoice' : 'estimate';
    const isInvoice = _docListMode === 'invoice';
    // ヘッダー色とラベルを切替
    const header = document.getElementById('doc-list-header');
    if (header) {
      header.style.background = isInvoice ? '#27ae60' : '#e67e22';
      header.style.borderBottom = '3px solid ' + (isInvoice ? '#145a2e' : '#7e4906');
    }
    document.getElementById('doc-list-mode-label').textContent = isInvoice ? '請求書 一覧' : '見積書 一覧';
    document.getElementById('doc-list-count-label').textContent = isInvoice ? '作成済の請求書' : '作成済の見積書';
    document.querySelector('#doc-list-mode-label').style.color = isInvoice ? '#a8f0c0' : '#fde2c2';
    // 新規作成ボタンの色を切り替え
    const btn = document.getElementById('doc-list-create-btn');
    if (btn) {
      if (isInvoice) {
        btn.style.background    = 'linear-gradient(180deg,#27ae60 0%,#1a7a40 100%)';
        btn.style.borderColor   = '#145a2e';
        btn.style.boxShadow     = '0 4px 0 #145a2e';
        btn.style.textShadow    = '1px 1px 0 #145a2e';
        btn.textContent         = '＋ 新規請求書を作成';
      } else {
        btn.style.background    = 'linear-gradient(180deg,#e67e22 0%,#b3650f 100%)';
        btn.style.borderColor   = '#7e4906';
        btn.style.boxShadow     = '0 4px 0 #7e4906';
        btn.style.textShadow    = '1px 1px 0 #7e4906';
        btn.textContent         = '＋ 新規見積書を作成';
      }
    }
    // 検索リセット
    const s = document.getElementById('doc-list-search');
    if (s) s.value = '';
    renderDocList();
    document.getElementById('doc-list-screen').style.transform = 'translateX(0)';
  }
```

新:
```javascript
  // 一覧テーマ（invoice=緑 / estimate=橙 / delivery=青）
  const DOC_LIST_THEME = {
    invoice:  { base:'#27ae60', dark:'#145a2e', mid:'#1a7a40', labelColor:'#a8f0c0', listLabel:'請求書', accentBg:'#e8f8ee', createTxt:'＋ 新規請求書を作成' },
    estimate: { base:'#e67e22', dark:'#7e4906', mid:'#b3650f', labelColor:'#fde2c2', listLabel:'見積書', accentBg:'#fef0e0', createTxt:'＋ 新規見積書を作成' },
    delivery: { base:'#2980b9', dark:'#1a5c8a', mid:'#2471a3', labelColor:'#bcdcf0', listLabel:'納品書', accentBg:'#e8f1f8', createTxt:'＋ 新規納品書を作成' },
  };

  function openDocList(mode) {
    // 未知値は見積書にフォールバック（既存の二択フォールバック方針を踏襲）
    _docListMode = DOC_LIST_THEME[mode] ? mode : 'estimate';
    const T = DOC_LIST_THEME[_docListMode];
    // ヘッダー色とラベルを切替
    const header = document.getElementById('doc-list-header');
    if (header) {
      header.style.background = T.base;
      header.style.borderBottom = '3px solid ' + T.dark;
    }
    document.getElementById('doc-list-mode-label').textContent = T.listLabel + ' 一覧';
    document.getElementById('doc-list-count-label').textContent = '作成済の' + T.listLabel;
    document.querySelector('#doc-list-mode-label').style.color = T.labelColor;
    // 新規作成ボタンの色を切り替え
    const btn = document.getElementById('doc-list-create-btn');
    if (btn) {
      btn.style.background  = `linear-gradient(180deg,${T.base} 0%,${T.mid} 100%)`;
      btn.style.borderColor = T.dark;
      btn.style.boxShadow   = '0 4px 0 ' + T.dark;
      btn.style.textShadow  = '1px 1px 0 ' + T.dark;
      btn.textContent       = T.createTxt;
    }
    // 検索リセット
    const s = document.getElementById('doc-list-search');
    if (s) s.value = '';
    renderDocList();
    document.getElementById('doc-list-screen').style.transform = 'translateX(0)';
  }
```

- [ ] **Step 4: `renderDocList` のアクセント色を3値化**

`renderDocList`（現 ~11017-11034）の冒頭付近を置換する。

旧:
```javascript
    const isInvoice = _docListMode === 'invoice';
    const accent    = isInvoice ? '#27ae60' : '#e67e22';
    const accentBg  = isInvoice ? '#e8f8ee' : '#fef0e0';
```
新:
```javascript
    const isInvoice = _docListMode === 'invoice';
    const _theme    = DOC_LIST_THEME[_docListMode] || DOC_LIST_THEME.estimate;
    const accent    = _theme.base;
    const accentBg  = _theme.accentBg;
```

> 注意: `renderDocList` 内には他にも `isInvoice ? '請求書' : '見積書'`（件数ラベル ~11034、`作成済の${isInvoice ? '請求書' : '見積書'}（…件）`）や、バッジ判定（入金済/発行済は請求書のみ表示 ~11050）で `isInvoice` を使う箇所がある。**納品書は請求書とは別書類でステータスバッジは不要**なので、件数ラベルだけ納品書名に対応させる。該当行を置換する。

旧（件数ラベル ~11033-11034）:
```javascript
    document.getElementById('doc-list-count-label').textContent =
      `作成済の${isInvoice ? '請求書' : '見積書'}（${items.length}件）`;
```
新:
```javascript
    document.getElementById('doc-list-count-label').textContent =
      `作成済の${_theme.listLabel}（${items.length}件）`;
```

空件メッセージ（~11043）の「該当する案件がありません」はそのままでよい。バッジ（`if (isInvoice)`）は請求書のみのままでよい（納品書では非表示）。

- [ ] **Step 5: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 6: ブラウザ確認**

コンソールから `openDocList('delivery')` →
Expected: 一覧画面が**青ヘッダー**で開き、ラベル「納品書 一覧」「作成済の納品書（N件）」、新規ボタンが青で「＋ 新規納品書を作成」。`openDocList('invoice')`（緑）/ `openDocList('estimate')`（橙）が従来どおりであることも確認。一覧の項目集合は3モードとも同じ（モード別フィルタはスコープ外）。

- [ ] **Step 7: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): openDocList/renderDocList に納品書(青テーマ)を追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 編集画面のモードトグルに「納品書」ボタンを追加

**Files:**
- Modify: `index.html`（モードトグル HTML、現 ~4738-4743）

- [ ] **Step 1: 現状を確認**

現状（~4738-4743）は請求書／見積書の2ボタン。`.invd-mode-btn` のハイライトは `setDocMode` 内の `b.dataset.mode === _docMode` 判定で既に3値対応済み（Task 3）。あとはボタンを足すだけ。

- [ ] **Step 2: 納品書トグルボタンを追加**

旧:
```html
        <button type="button" class="invd-mode-btn" data-mode="estimate" onclick="setDocMode('estimate')"
          style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.3);padding:4px 8px;border-radius:3px;cursor:pointer;">見積書</button>
      </div>
```
新:
```html
        <button type="button" class="invd-mode-btn" data-mode="estimate" onclick="setDocMode('estimate')"
          style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.3);padding:4px 8px;border-radius:3px;cursor:pointer;">見積書</button>
        <button type="button" class="invd-mode-btn" data-mode="delivery" onclick="setDocMode('delivery')"
          style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.3);padding:4px 8px;border-radius:3px;cursor:pointer;">納品書</button>
      </div>
```

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行（HTML 追加だが念のため）。`SYNTAX OK` を確認。

- [ ] **Step 4: ブラウザ確認**

任意の請求書編集画面を開く → ヘッダーに「請求書／見積書／納品書」の3トグルが並ぶ。「納品書」をタップ → ヘッダー・用紙タイトル・日付・金額ラベルが納品書表記に変わり、ボタンがハイライトされる。請求書／見積書に戻せることも確認。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): 編集画面のモードトグルに納品書ボタンを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 会計室の「納品書」ボタンを一覧導線に差し替え

現状、会計室タブ（~3973）に「納品書 準備中」ボタンがあり `openNewDelivery()`（~10569）が `alert('準備中')` を出すだけ。これを請求書・見積書と同じ**一覧→新規作成**の青テーマ導線にする。

**Files:**
- Modify: `index.html`（納品書ボタン HTML ~3973-3977、`openNewDelivery` 関数 ~10568-10571）

- [ ] **Step 1: ボタンの onclick と色・サブラベルを差し替え**

旧（~3973-3977）:
```html
          <button onclick="openNewDelivery()" style="font-family:'DotGothic16',monospace;font-size:16px;background:linear-gradient(180deg,#16a085 0%,#117a65 100%);border:3px solid #0b5345;color:white;padding:18px 16px;border-radius:6px;cursor:pointer;box-shadow:0 4px 0 #0b5345;text-align:left;display:flex;align-items:center;gap:14px;text-shadow:1px 1px 0 #0b5345;letter-spacing:2px;">
            <span style="font-size:32px;line-height:1;">📋</span>
            <span style="flex:1;"><span style="font-size:1.2em;">納</span>品書<div style="font-size:11px;opacity:0.85;margin-top:3px;letter-spacing:1px;">準備中</div></span>
            <span style="font-size:23px;">▶</span>
          </button>
```
新:
```html
          <button onclick="openDocList('delivery')" style="font-family:'DotGothic16',monospace;font-size:16px;background:linear-gradient(180deg,#2980b9 0%,#2471a3 100%);border:3px solid #1a5c8a;color:white;padding:18px 16px;border-radius:6px;cursor:pointer;box-shadow:0 4px 0 #1a5c8a;text-align:left;display:flex;align-items:center;gap:14px;text-shadow:1px 1px 0 #1a5c8a;letter-spacing:2px;">
            <span style="font-size:32px;line-height:1;">📦</span>
            <span style="flex:1;"><span style="font-size:1.2em;">納</span>品書<div style="font-size:11px;opacity:0.85;margin-top:3px;letter-spacing:1px;">作成済の納品書一覧</div></span>
            <span style="font-size:23px;">▶</span>
          </button>
```

- [ ] **Step 2: 不要になった `openNewDelivery` プレースホルダを撤去**

旧（~10568-10571）:
```javascript
  // 納品書（未実装プレースホルダ）
  function openNewDelivery() {
    alert('📋 納品書\n\n機能は準備中です。\nこれから実装していきます。');
  }
```
新（関数ごと削除。空行は残してよい）:
```javascript

```

> 確認: `grep -n "openNewDelivery" index.html` で残参照が無いこと（Step 1 で onclick を差し替え済みなので0件のはず）。

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。`grep -n "openNewDelivery" index.html` → 0件を確認。

- [ ] **Step 4: ブラウザ確認**

会計室タブ → 「📦 納品書（作成済の納品書一覧）」青ボタンをタップ → 青ヘッダーの納品書一覧が開く。「＋ 新規納品書を作成」→ `DLV-26001` 採番、納品書モード（御納品書）で編集画面が開く。日付は今日が初期値。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): 会計室の納品書ボタンを一覧導線(青)に差し替え

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: ⭐請求書からワンタップ作成（本機能の肝）

請求書（または見積書）の編集画面に「📦 この内容で納品書を作成」ボタンを足す。押すと現在の明細・宛先・件名・作業日・担当者を新しい `DLV-` レコードにコピーし、納品書モードで開く。

**Files:**
- Modify: `index.html`（`createDeliveryFromCurrent()` 関数を新設、編集画面ヘッダにボタンを追加）

- [ ] **Step 1: コピー関数 `createDeliveryFromCurrent()` を新設**

`saveInvDoc` 関数の直前（現 ~8455 の `function saveInvDoc() {` の直前）に挿入する。現在の編集画面 DOM から明細・宛先を収集する（`saveInvDoc` の収集ロジックと同型）。

挿入する文字列:

```javascript
  // 現在開いている請求書/見積書の内容をコピーして、新しい納品書(DLV-)を作成する
  function createDeliveryFromCurrent() {
    // 明細行を現在の編集画面から収集（saveInvDoc と同じ方式）
    const tbody = document.getElementById('inv-lines-body');
    const lines = [];
    if (tbody) {
      tbody.querySelectorAll('.inv-line-row').forEach(tr => {
        const nameEl  = tr.querySelector('.inv-line-name') || tr.querySelector('.inv-td-name span');
        const unitEl  = tr.querySelector('.inv-line-unit') || tr.querySelector('.inv-td-unit span');
        const qtyEl   = tr.querySelector('.inv-line-qty')  || tr.querySelector('.inv-td-qty span');
        const priceEl = tr.querySelector('.inv-line-price');
        const priceTextEl = tr.querySelector('.inv-td-price span');
        const codeEl  = tr.querySelector('.inv-td-code');
        const taxEl   = tr.querySelector('.inv-line-tax');
        const outsourceEl = tr.querySelector('.inv-line-outsource');
        const name  = (nameEl?.value  || nameEl?.textContent  || '').trim();
        const unit  = (unitEl?.value  || unitEl?.textContent  || '').trim();
        const qty   = Number((qtyEl?.value || qtyEl?.textContent || '').replace(/[^\d.]/g, '')) || 0;
        const rawPrice = (priceEl?.value || (priceTextEl?.textContent || '').replace(/[¥,]/g, ''));
        const price = Number(rawPrice) || 0;
        const code  = (codeEl?.textContent || '').trim();
        const taxable = taxEl ? (taxEl.value === '1') : true;
        const outsource = outsourceEl ? !!outsourceEl.checked : false;
        if (!name && !price) return;
        lines.push({ code, name, qty, unit, price, taxable, outsource });
      });
    }

    // 新しい納品書番号を採番
    const newNum = generateNewInvNum('delivery');
    const today  = new Date().toLocaleDateString('ja-JP',
      {year:'numeric', month:'2-digit', day:'2-digit'}).replace(/\//g, '/');

    // 現在の宛先・件名・作業日・担当者をコピーして新レコードを作る
    const status = {
      lines:    lines,
      title:    document.getElementById('inv-screen-title').value || '',
      invDate:  today,  // 納品日は今日を初期値
      workDate: document.getElementById('inv-screen-workdate').value || '',
      company:  (document.getElementById('inv-screen-company')?.value || '').trim(),
      contact:  (document.getElementById('inv-screen-contact')?.value || '').trim(),
      staff:    (document.getElementById('inv-screen-staff')?.value   || '').trim(),
      zip:      (document.getElementById('inv-screen-zip')?.textContent  || '').trim(),
      addr:     (document.getElementById('inv-screen-addr')?.textContent || '').trim(),
      docMode:  'delivery',
      savedAt:  new Date().toLocaleString('ja-JP'),
      _updatedAt: new Date().toISOString(),
    };
    saveInvStatus(newNum, status);

    // シートへ自動送信（URL設定済みなら）— 納品書も invoice kind に乗る
    if (typeof _gasUrlOne === 'function' && _gasUrlOne()) {
      const _rec = Object.assign({ '受注No': newNum }, status);
      pushKind('invoice', [_rec]).catch(e => { try { pendingAdd('invoice', newNum); } catch (_) {} });
    }

    // 納品書モードで編集画面を開く（番号・宛先・明細をセット）
    document.getElementById('inv-screen-num').textContent  = newNum;
    document.getElementById('inv-detail-num').textContent  = newNum;
    _setInvClientFields(status.company, status.contact);
    document.getElementById('inv-screen-zip').textContent  = status.zip;
    document.getElementById('inv-screen-addr').textContent = status.addr;
    document.getElementById('inv-screen-title').value      = status.title;
    document.getElementById('inv-screen-workdate').value   = status.workDate;
    document.getElementById('inv-screen-staff').value      = status.staff;
    document.getElementById('inv-screen-invdate').value    = status.invDate;
    // 明細が空でも1行は表示する
    renderInvLines([], lines.length ? lines : [{ code:'', name:'', qty:1, unit:'式', price:0 }], false);
    calcInvTotal();
    setDocMode('delivery');
    document.getElementById('inv-detail-screen').style.transform = 'translateX(0)';
    if (typeof syncCancelBtn === 'function') syncCancelBtn(false);

    alert('📦 納品書「' + newNum + '」を作成しました。\n内容をコピーしました。必要なら編集して保存してください。');
  }
```

> 補足: `_setInvClientFields`・`renderInvLines`・`calcInvTotal`・`saveInvStatus`・`generateNewInvNum`・`setDocMode`・`syncCancelBtn`・`_gasUrlOne`・`pushKind`・`pendingAdd` はすべて既存関数（本ファイル内に定義済み）。`inv-screen-company`/`inv-screen-contact` は入力欄（value）、`inv-screen-zip`/`inv-screen-addr` は表示欄（textContent）で、`saveInvDoc`（~8487-8494）と同じ参照方法に揃えている。

- [ ] **Step 2: 編集画面ヘッダに起動ボタンを追加**

プレビューボタンの並び（現 ~4744-4746）にコピーボタンを足す。

旧:
```html
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="inv-add-line-btn" style="background:rgba(255,255,255,0.22);" onclick="openPrintPreview(_docMode || 'invoice')">🔍 プレビュー</button>
      </div>
```
新:
```html
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="inv-add-line-btn" style="background:rgba(41,128,185,0.85);" onclick="createDeliveryFromCurrent()" title="今の内容をコピーして納品書を作成">📦 納品書化</button>
        <button class="inv-add-line-btn" style="background:rgba(255,255,255,0.22);" onclick="openPrintPreview(_docMode || 'invoice')">🔍 プレビュー</button>
      </div>
```

- [ ] **Step 3: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 4: ブラウザ確認**

既存の請求書を開く（明細・宛先が入っている状態） → ヘッダの「📦 納品書化」をタップ →
Expected:
- 新しい `DLV-26xxx` 番号が採番される
- 明細・宛先（会社/担当/郵便/住所）・件名・作業日・担当者がコピーされている
- 納品書モード（御納品書／納品日）で開く、納品日は今日
- 元の請求書は変更されていない（別番号で新規作成）
- リロード後に会計室→納品書一覧に `DLV-26xxx` が出る（保存済み）

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(delivery): 請求書から「この内容で納品書を作成」ボタンを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 全体結合確認＋最終コミット

**Files:**
- 確認のみ（必要なら微修正＋コミット）

- [ ] **Step 1: 構文チェック（緑）**

共通コマンドを実行。`SYNTAX OK` を確認。

- [ ] **Step 2: 設計書のテスト観点8項目をブラウザで通す**

`docs/superpowers/specs/2026-06-02-delivery-note-design.md` の「テスト観点」を順に確認:

1. JS構文チェックOK（Step 1）。
2. 会計室タブから「納品書」一覧が**青テーマ**で開く。
3. 新規納品書作成 → `DLV-26001` 採番、タイトル「御納品書」「納品日」表示。
4. 既存の請求書を開いて「📦 納品書化」→ 明細・宛先がコピーされ、新 `DLV-` 番号になる。
5. 納品書をプレビュー／印刷 → 用紙が「御　納　品　書」。レイアウトは請求書と同一。
6. 保存して再度開く → 納品書モードで復元（請求書に化けない）。
7. 請求書・見積書の既存挙動が壊れていない（採番 INV-/EST-、一覧の緑/橙、印刷）。
8. デスクトップ幅（≥768px）でレイアウトが崩れない（新規オーバーレイは追加していないので既存 `#inv-detail-screen` / `#doc-list-screen` のCSSがそのまま効く）。

- [ ] **Step 3: 影響範囲の grep 確認（CLAUDE.md 必須工程）**

```bash
grep -n "setDocMode\|buildDocHTML\|openDocList\|generateNewInvNum\|_actionToMode\|openNewDelivery\|createDeliveryFromCurrent" index.html
```
- `openNewDelivery` が0件（撤去済み）。
- `setDocMode`/`buildDocHTML`/`openDocList`/`generateNewInvNum` の全呼び出し元が3値に対応した経路を通る。

- [ ] **Step 4: 問題があれば修正、無ければ完了**

退行や崩れがあれば systematic-debugging で原因を特定して修正・コミット。無ければこのタスクは確認のみで完了。

- [ ] **Step 5: （ユーザー指示時）push**

```bash
git push origin main 2>&1 | grep -viE "github.com|ghp_|token|x-access"
```

---

## スコープ外（この計画でやらないこと）

- 納品書専用のスプレッドシートタブ分離（請求書タブ共用のまま）。
- 金額非表示モード（中身は請求書と同一の方針）。
- 一覧のモード別フィルタ（請求書/見積書/納品書で表示件数を分ける機能）。
- 受領印欄・納品書特有の追加項目（必要になったら別途）。
- 新規オーバーレイ追加・ESC/戻る登録・`@media (min-width:768px)` の新規 `#xxx-screen` 追加（既存画面を再利用するため不要）。
