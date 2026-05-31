# 3部門別売上 専用画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 売上表から開く専用フルスクリーン画面で、各案件の売上を「編集・撮影・プロデュース（＋未分類）」の3部門に仕分けし、合計・構成比・部門ごとの案件内訳を表示する。

**Architecture:** 既存の売上集計（`_collectSalesItems` / `_calcCaseSales`）を再利用し、案件ごとに「請求明細を役割ラベルで部門分類 →売上(net)を比率按分」、明細が無い案件は「クルー欄の役割人数で按分」する純粋関数を追加。その結果を新しいオーバーレイ `#dept-sales-screen` に描画する。既存の `.full-page-overlay` 開閉方式に乗せる。

**Tech Stack:** 単一HTML（`index.html`）にインラインの HTML/CSS/JS。テストランナー無し。検証は `node --check`（インラインJS抽出後）＋ ローカルHTTPサーバ（`python3 -m http.server`）上でのブラウザ・コンソール実測。

**設計ドキュメント:** `docs/superpowers/specs/2026-05-31-department-sales-breakdown-design.md`

---

## File Structure

- Modify: `index.html` のみ（単一ファイル構成）。追加する論理的ユニット：
  - **JSロジック**（`_classifyLineDept` / `_caseDeptSplit` / `_collectDeptBreakdown`）— `_collectSalesItems` 関数の直後（おおよそ現在の行10506付近）に追加。
  - **画面HTML**（`#dept-sales-screen`）— `#sales-screen` の閉じタグ `</div><!-- /sales-screen -->`（現在の行5188付近）の直後に追加（phone-frame の子）。
  - **開閉ワイヤリング**（`openDeptSales` / `closeDeptSales`）— `closeSalesScreen`（現在の行10405付近）の直後に追加。
  - **画面クローズ登録**— 画面レジストリ配列（`{ id: 'equip-master-screen', close: () => closeEquipMaster() }` がある現在の行7669付近）に1行追加。
  - **入口ボタン**— 売上表ヘッダーの CSV ボタン（`id="sales-export-btn"` の `<button>`、現在の行5158-5159）の直後に追加。
  - **描画関数**（`renderDeptSalesScreen`）— `openDeptSales`/`closeDeptSales` の近くに追加。
  - **CSS**— 既存の3つのセレクタ列に `#dept-sales-screen` を追加（行2155 / 2223 / 2813 付近）。

> 行番号は編集で前後にずれるため、各タスクでは「アンカー文字列」（grep で一意に当たる既存コード）を基準に挿入位置を特定すること。

---

## 共通：JS構文チェック手順（毎タスクの検証で使用）

`node --check` は `.html` を直接読めないため、インラインJSを抽出してからチェックする。

Run:
```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && node -e '
const fs=require("fs");const html=fs.readFileSync("index.html","utf8");
const re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi;let m,all="";
while((m=re.exec(html))){ if(!/src=/.test(m[0])) all+="\n;{"+m[1]+"\n};\n"; }
fs.writeFileSync("/tmp/_check.js",all);' && node --check /tmp/_check.js && echo "OK"
```
Expected: `OK`（構文エラーが無いこと）

## 共通：ブラウザ検証の準備（Task 1 と Task 4 で使用）

ローカルHTTPサーバを起動し、ブラウザ（Claude in Chrome 連携）で開く。`file://` はパスが壊れるため必ず localhost を使う。テストデータを localStorage に注入して検証する。

Run（サーバ起動）:
```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && (lsof -ti:8765 | xargs kill -9 2>/dev/null; true); nohup python3 -m http.server 8765 >/tmp/_httpd.log 2>&1 & sleep 1; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/index.html
```
Expected: `200`

ブラウザで `http://localhost:8765/index.html` を開き、コンソールで以下のテストデータを注入する（部門判定を網羅する明細つき案件1件＋明細なし案件1件）:
```javascript
localStorage.setItem('projects_saved', JSON.stringify([
  {num:'T26041', title:'明細あり案件', company:'A社', date:'2026/05/30'},
  {num:'T26090', title:'明細なし案件', company:'B社', date:'2026/05/20'}
]));
// 明細あり案件：各部門＋外注行＋自由入力行
localStorage.setItem('inv_T26041', JSON.stringify({ billed:true, paid:false, lines:[
  {code:'', name:'プロデュース費（担当：川崎）', qty:1, unit:'日', price:100000, taxable:true, outsource:false},
  {code:'', name:'カメラマン人件費（撮影：城間）', qty:1, unit:'日', price:100000, taxable:true, outsource:false},
  {code:'', name:'撮影機材一式（カメラ他）', qty:1, unit:'日', price:100000, taxable:true, outsource:false},
  {code:'', name:'編集費（編集：森田）', qty:1, unit:'日', price:100000, taxable:true, outsource:false},
  {code:'', name:'交通費', qty:1, unit:'式', price:50000, taxable:true, outsource:false},
  {code:'', name:'外注編集', qty:1, unit:'式', price:80000, taxable:true, outsource:true}
] }));
// 明細なし案件：クルーのみ（撮影2＋編集1＋プロデュース1）／受注金額50万
localStorage.setItem('ws_T26090', JSON.stringify({
  'wsd-order-amount':'500000',
  crew_producer:'川崎', crew_c:'城間', crew_a:'上地', crew_edit:'森田'
}));
'injected'
```
Expected: `"injected"`

---

### Task 1: 部門別集計ロジック（純粋関数）を追加

**Files:**
- Modify: `index.html` — アンカー：`_collectSalesItems` 関数の閉じ（`return items;` に続く `}` 、現在の行10506付近）の直後に挿入。

- [ ] **Step 1: ロジック関数を追加**

`_collectSalesItems` 関数定義の終わり（`}`）の直後に、次のコードブロックを丸ごと挿入する。

```javascript
  // ===== 部門別売上：集計ロジック（編集・撮影・プロデュース・未分類） =====
  // 請求明細の name（役割ラベル）から部門を判定する
  function _classifyLineDept(name) {
    const s = String(name || '');
    if (/プロデュース/.test(s)) return 'produce';
    if (/企画・演出|監督/.test(s)) return 'produce';
    if (/プロダクションマネージャー/.test(s)) return 'produce';
    if (/カメラマン/.test(s)) return 'shoot';
    if (/撮影助手/.test(s)) return 'shoot';
    if (/音声/.test(s)) return 'shoot';
    if (/撮影機材/.test(s)) return 'shoot';
    if (/編集/.test(s)) return 'edit';
    return 'other';
  }

  // 1案件の売上(netInhouse)を3部門+未分類へ振り分ける（合計はnetInhouseに一致）
  // item は _collectSalesItems() の1要素（num, netInhouse, date 等を持つ）
  function _caseDeptSplit(item) {
    const net = Number(item.netInhouse) || 0;
    const res = { produce: 0, shoot: 0, edit: 0, other: 0 };
    const status = (typeof loadInvStatus === 'function') ? (loadInvStatus(item.num) || {}) : {};
    const lines = (status.lines && status.lines.length) ? status.lines : null;

    if (lines) {
      // A. 明細あり：非外注行を部門別グロスに集計 → net を比率按分
      const gross = { produce: 0, shoot: 0, edit: 0, other: 0 };
      let totalGross = 0;
      lines.forEach(l => {
        if (l && l.outsource) return; // 外注行は除外
        const amt = (Number(l.qty) || 0) * (Number(l.price) || 0);
        if (amt <= 0) return;
        gross[_classifyLineDept(l.name)] += amt;
        totalGross += amt;
      });
      if (totalGross > 0) {
        ['produce', 'shoot', 'edit', 'other'].forEach(d => {
          res[d] = net * (gross[d] / totalGross);
        });
        return res;
      }
      res.other = net; // グロス0は未分類へ
      return res;
    }

    // B. 明細なし：クルー欄の役割人数で按分
    const saved = (typeof loadWS === 'function') ? (loadWS(item.num) || {}) : {};
    const _has = k => (String(saved[k] || '').trim() ? 1 : 0);
    const cnt = {
      produce: _has('crew_producer') + _has('crew_d') + _has('crew_pm1') + _has('crew_pm2'),
      shoot:   _has('crew_c') + _has('crew_a') + _has('crew_a2') + _has('crew_sound'),
      edit:    _has('crew_edit')
    };
    const totalCnt = cnt.produce + cnt.shoot + cnt.edit;
    if (totalCnt > 0) {
      res.produce = net * (cnt.produce / totalCnt);
      res.shoot   = net * (cnt.shoot   / totalCnt);
      res.edit    = net * (cnt.edit    / totalCnt);
      return res;
    }
    res.other = net; // クルー未入力は未分類へ
    return res;
  }

  // 期間でフィルタした全案件を部門別に集計
  // period: 'all' | '2026' | '2025' ...
  function _collectDeptBreakdown(period) {
    let items = (typeof _collectSalesItems === 'function') ? _collectSalesItems() : [];
    if (period && period !== 'all') {
      const y = parseInt(period, 10);
      items = items.filter(it => {
        const d = _parseDateForSales(it.date);
        return d && d.y === y;
      });
    }
    const totals = { produce: 0, shoot: 0, edit: 0, other: 0 };
    const cases = [];
    items.forEach(it => {
      const sp = _caseDeptSplit(it);
      totals.produce += sp.produce;
      totals.shoot   += sp.shoot;
      totals.edit    += sp.edit;
      totals.other   += sp.other;
      cases.push({ num: it.num, title: it.title, client: it.client, date: it.date,
                   produce: sp.produce, shoot: sp.shoot, edit: sp.edit, other: sp.other });
    });
    const grand = totals.produce + totals.shoot + totals.edit + totals.other;
    return { totals, cases, grand };
  }
```

- [ ] **Step 2: JS構文チェック**

Run: 「共通：JS構文チェック手順」のコマンド
Expected: `OK`

- [ ] **Step 3: ブラウザでロジックを検証**

「共通：ブラウザ検証の準備」でサーバ起動＋テストデータ注入を済ませた後、ブラウザのコンソール（javascript_tool）で実行:
```javascript
(function(){
  var b = _collectDeptBreakdown('all');
  var items = _collectSalesItems();
  var netSum = items.reduce((s,it)=>s+(Number(it.netInhouse)||0),0);
  // 各案件の按分合計がnetInhouseに一致するか
  var perCaseOK = items.every(it => {
    var sp = _caseDeptSplit(it);
    var sum = sp.produce+sp.shoot+sp.edit+sp.other;
    return Math.abs(sum - (Number(it.netInhouse)||0)) < 1;
  });
  return JSON.stringify({
    grandEqualsNetSum: Math.abs(b.grand - netSum) < 1,
    perCaseOK: perCaseOK,
    totals: b.totals,
    caseCount: b.cases.length
  });
})()
```
Expected: `grandEqualsNetSum: true`、`perCaseOK: true`、`totals` の4部門に妥当な値（明細あり案件で produce/shoot/edit に配分、shoot に機材分が乗る）、`caseCount` ≥ 1。

- [ ] **Step 4: コミット**

```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && git add index.html && git commit -m "$(cat <<'EOF'
feat: 部門別売上の集計ロジックを追加(_classifyLineDept/_caseDeptSplit/_collectDeptBreakdown)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 専用画面の HTML を追加

**Files:**
- Modify: `index.html` — アンカー：`</div><!-- /sales-screen -->` の直後に挿入。

- [ ] **Step 1: 画面HTMLを追加**

`</div><!-- /sales-screen -->` の行の直後に、次を挿入する。

```html
  <div id="dept-sales-screen" style="
    position:absolute; inset:0; z-index:200;
    background:var(--panel-bg);
    transform:translateX(100%);
    transition:transform 0.28s cubic-bezier(.4,0,0.2,1);
    display:flex; flex-direction:column; overflow:hidden;">

    <div style="display:flex;align-items:center;gap:10px;background:#6c3483;padding:10px 12px;flex-shrink:0;border-bottom:3px solid #4a235a;">
      <button class="wsd-back" onclick="closeDeptSales()">◀ 戻る</button>
      <div class="wsd-header-info">
        <div class="wsd-header-num" style="color:#e8daef;">🏢 部門別売上</div>
        <div class="wsd-header-title">編集・撮影・プロデュース</div>
      </div>
    </div>

    <!-- 期間フィルタ -->
    <div style="padding:10px 12px;background:#f4ecf7;border-bottom:2px solid #d2b4de;flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="font-size:12px;color:#666;">期間：</span>
      <select id="dept-period" onchange="renderDeptSalesScreen()" class="wsd-input" style="width:auto;font-size:13px;padding:6px 8px;">
        <option value="all">すべて</option>
        <option value="2026">2026年</option>
        <option value="2025">2025年</option>
      </select>
    </div>

    <!-- サマリー（横帯バー＋凡例） -->
    <div id="dept-summary" style="padding:12px;background:#fff;border-bottom:2px solid #ddd;flex-shrink:0;"></div>

    <!-- 部門ごとの案件内訳 -->
    <div id="dept-body" class="wsd-scroll" style="padding:8px 10px 20px;"></div>
  </div><!-- /dept-sales-screen -->
```

- [ ] **Step 2: JS構文チェック**

Run: 「共通：JS構文チェック手順」のコマンド
Expected: `OK`（HTML追加のみだが、`<script>`抽出が壊れていないか確認）

- [ ] **Step 3: コミット**

```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && git add index.html && git commit -m "$(cat <<'EOF'
feat: 部門別売上 専用画面のHTMLスケルトンを追加(#dept-sales-screen)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 開閉ワイヤリング・クローズ登録・入口ボタンを追加

**Files:**
- Modify: `index.html` — アンカー1：`closeSalesScreen` 関数の閉じ（`el.style.transform = 'translateX(100%)';` に続く `}`、現在の行10405付近）の直後。
- Modify: `index.html` — アンカー2：`{ id: 'equip-master-screen',     close: () => closeEquipMaster() },`（現在の行7669付近）の直後。
- Modify: `index.html` — アンカー3：売上表ヘッダーの `id="sales-export-btn"` を持つ `</button>` の直後（現在の行5159-5160）。

- [ ] **Step 1: 開閉関数を追加**

`closeSalesScreen` 関数定義の直後に挿入する。

```javascript
  function openDeptSales() {
    renderDeptSalesScreen();
    const el = document.getElementById('dept-sales-screen');
    el.style.transform = 'translateX(0)';
    _applyFullPageStyle(el, 10001);
  }

  function closeDeptSales() {
    const el = document.getElementById('dept-sales-screen');
    _resetFullPageStyle(el);
    el.style.transform = 'translateX(100%)';
  }
```

- [ ] **Step 2: クローズ登録を追加**

`{ id: 'equip-master-screen',     close: () => closeEquipMaster() },` の行の直後に挿入する。

```javascript
    { id: 'dept-sales-screen',       close: () => closeDeptSales() },
```

- [ ] **Step 3: 入口ボタンを追加**

売上表ヘッダーの CSV ボタン（`id="sales-export-btn"` を持つ `<button>...📥 CSV</button>`）の直後に挿入する。

```html
      <button id="dept-sales-btn" onclick="openDeptSales()" title="部門別売上"
        style="font-family:'DotGothic16',monospace;font-size:11px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;padding:5px 10px;border-radius:3px;cursor:pointer;white-space:nowrap;">🏢 部門別</button>
```

- [ ] **Step 4: JS構文チェック**

Run: 「共通：JS構文チェック手順」のコマンド
Expected: `OK`

- [ ] **Step 5: 一時スタブで開閉を確認**

このタスク時点では `renderDeptSalesScreen` が未定義のため、ブラウザのコンソールで一時的にスタブを定義してから開閉を確認する:
```javascript
window.renderDeptSalesScreen = function(){ document.getElementById('dept-summary').textContent='(stub)'; };
openDeptSales();
var el = document.getElementById('dept-sales-screen');
var shown = getComputedStyle(el).transform; // translateX(0) 相当
closeDeptSales();
JSON.stringify({ openedTransform: shown, closedTransform: el.style.transform });
```
Expected: `openedTransform` が `none` または `matrix(...0,0)`（画面内に出ている）、`closedTransform` が `translateX(100%)`。エラーが出ないこと。

- [ ] **Step 6: コミット**

```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && git add index.html && git commit -m "$(cat <<'EOF'
feat: 部門別売上画面の開閉・クローズ登録・売上表からの入口ボタンを追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 描画関数 renderDeptSalesScreen を追加

**Files:**
- Modify: `index.html` — アンカー：`closeDeptSales` 関数の閉じ `}`（Task 3 で追加した直後）。

- [ ] **Step 1: 描画関数を追加**

`closeDeptSales` 関数定義の直後に挿入する。

```javascript
  function renderDeptSalesScreen() {
    const periodEl = document.getElementById('dept-period');
    const period = periodEl ? periodEl.value : 'all';
    const { totals, cases, grand } = _collectDeptBreakdown(period);
    const fmt = n => '¥' + Math.round(Number(n) || 0).toLocaleString();
    const DEPTS = [
      { key: 'produce', label: 'プロデュース', color: '#8e44ad' },
      { key: 'shoot',   label: '撮影',         color: '#2980b9' },
      { key: 'edit',    label: '編集',         color: '#27ae60' },
      { key: 'other',   label: '未分類',       color: '#95a5a6' }
    ];
    const base = grand || 1;
    const pct = v => Math.max(0, (v / base) * 100);

    // サマリー
    const summary = document.getElementById('dept-summary');
    summary.innerHTML = `
      <div style="font-size:13px;color:#333;margin-bottom:6px;font-weight:bold;">売上合計 ${fmt(grand)}</div>
      <div style="display:flex;height:22px;border-radius:5px;overflow:hidden;border:1px solid #ddd;">
        ${DEPTS.map(d => `<div title="${d.label}" style="width:${pct(totals[d.key]).toFixed(2)}%;background:${d.color};"></div>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
        ${DEPTS.map(d => `
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;">
            <span style="width:11px;height:11px;border-radius:2px;background:${d.color};display:inline-block;"></span>
            <span style="color:#333;">${d.label}</span>
            <b style="color:${d.color};">${fmt(totals[d.key])}</b>
            <span style="color:#999;">(${pct(totals[d.key]).toFixed(1)}%)</span>
          </div>`).join('')}
      </div>`;

    // 本体：部門ごとに貢献案件リスト
    const body = document.getElementById('dept-body');
    if (!cases.length) {
      body.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">対象データがありません</div>';
      return;
    }
    body.innerHTML = DEPTS.map(d => {
      const rows = cases
        .filter(c => (c[d.key] || 0) > 0)
        .sort((a, b) => b[d.key] - a[d.key])
        .map(c => `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">
            <span style="color:#333;min-width:0;word-break:break-word;">${escapeHtml(c.title || '無題')} <span style="color:#aaa;font-size:10px;">${escapeHtml(c.num)}</span></span>
            <b style="color:${d.color};white-space:nowrap;">${fmt(c[d.key])}</b>
          </div>`).join('');
      return `
        <div style="margin-bottom:14px;border:1px solid #eee;border-radius:5px;overflow:hidden;">
          <div style="background:${d.color};color:#fff;padding:6px 10px;font-size:13px;font-weight:bold;display:flex;justify-content:space-between;">
            <span>${d.label}</span><span>${fmt(totals[d.key])}</span>
          </div>
          ${rows || '<div style="padding:8px 10px;color:#bbb;font-size:11px;">該当案件なし</div>'}
        </div>`;
    }).join('');
  }
```

- [ ] **Step 2: JS構文チェック**

Run: 「共通：JS構文チェック手順」のコマンド
Expected: `OK`

- [ ] **Step 3: ブラウザで画面表示を検証**

ページを再読込（テストデータは localStorage に残る）後、コンソールで:
```javascript
(function(){
  openDeptSales();
  var sum = document.getElementById('dept-summary').innerText.replace(/\n+/g,' | ');
  var bodyLen = document.getElementById('dept-body').querySelectorAll('div').length;
  var el = document.getElementById('dept-sales-screen');
  var visible = el.getBoundingClientRect().left < window.innerWidth - 10;
  return JSON.stringify({ summarySnippet: sum.slice(0,160), bodyHasContent: bodyLen>0, visible: visible });
})()
```
Expected: `summarySnippet` に「売上合計」と4部門（プロデュース/撮影/編集/未分類）の金額・％が含まれる。`bodyHasContent: true`、`visible: true`。エラーなし。

- [ ] **Step 4: 期間フィルタを検証**

```javascript
(function(){
  document.getElementById('dept-period').value='2025';
  renderDeptSalesScreen();
  var s2025 = document.getElementById('dept-summary').innerText.slice(0,40);
  document.getElementById('dept-period').value='all';
  renderDeptSalesScreen();
  var sall = document.getElementById('dept-summary').innerText.slice(0,40);
  return JSON.stringify({ s2025: s2025, sall: sall });
})()
```
Expected: 2025年は対象データ無し（合計¥0付近）、all は合計が出る。エラーなし。

- [ ] **Step 5: コミット**

```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && git add index.html && git commit -m "$(cat <<'EOF'
feat: 部門別売上画面の描画(renderDeptSalesScreen)を実装

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: デスクトップCSS対応と最終確認

**Files:**
- Modify: `index.html` — 3つのセレクタ列に `#dept-sales-screen` を追加。
  - アンカーA：`@media (min-width: 768px)` 内の `#new-project-screen {`（現在の行2155付近、`top: 36px ... left: 200px` を設定するブロック）の直前の `#new-project-screen,` 行が無いため、列の末尾 `#new-project-screen {` を `#new-project-screen,\n    #dept-sales-screen {` に変更。
  - アンカーB：`@media (min-width: 1200px)` 内の同様の `#new-project-screen {`（現在の行2223付近）を同じく変更。
  - アンカーC：`transition: none !important;` を持つ列の末尾 `#new-project-screen {`（現在の行2813付近）を同じく変更。

- [ ] **Step 1: @media (min-width: 768px) の列に追加**

768px ブロック内（`top: 36px !important; ... left: 200px !important;` を設定している方）の：
```css
    #new-project-screen {
```
を次に変更する（直前に行を追加）:
```css
    #new-project-screen,
    #dept-sales-screen {
```

- [ ] **Step 2: @media (min-width: 1200px) の列に追加**

1200px ブロック内の同じ `#new-project-screen {` を、Step 1 と同様に `#new-project-screen,` ＋ `#dept-sales-screen {` に変更する。

- [ ] **Step 3: transition:none の列に追加**

`transition: none !important;` を持つブロックの `#new-project-screen {` を、同様に `#new-project-screen,` ＋ `#dept-sales-screen {` に変更する。

- [ ] **Step 4: JS構文チェック**

Run: 「共通：JS構文チェック手順」のコマンド
Expected: `OK`

- [ ] **Step 5: デスクトップ実測（崩れ確認）**

ブラウザ（ビューポート広め）で:
```javascript
(function(){
  openDeptSales();
  var el = document.getElementById('dept-sales-screen');
  var r = el.getBoundingClientRect();
  var body = document.getElementById('dept-body');
  return JSON.stringify({
    coversViewport: Math.round(r.width) >= window.innerWidth - 210, // ナビ200px想定
    noHorizontalOverflow: body.scrollWidth <= body.clientWidth + 1,
    top: Math.round(r.top)
  });
})()
```
Expected: `coversViewport: true`（または full-page-overlay で全幅）、`noHorizontalOverflow: true`。エラーなし。

- [ ] **Step 6: 売上表に戻れること・既存機能の非破壊を確認**

```javascript
(function(){
  closeDeptSales();
  var dept = document.getElementById('dept-sales-screen').style.transform;
  // 売上表が従来どおり描画されるか
  renderSalesScreen();
  var salesRows = document.querySelectorAll('#sales-body .sales-row').length;
  return JSON.stringify({ deptClosed: dept, salesRows: salesRows });
})()
```
Expected: `deptClosed: "translateX(100%)"`、`salesRows` ≥ 1（売上表が壊れていない）。

- [ ] **Step 7: テストデータを後始末（localhost のみ。ユーザーの file:// データには無関係）**

```javascript
['projects_saved','inv_T26041','ws_T26090'].forEach(k=>localStorage.removeItem(k));
'cleaned'
```
Expected: `"cleaned"`

- [ ] **Step 8: コミット**

```bash
cd "/Users/shiromashin/Library/Mobile Documents/com~apple~CloudDocs/Claude code/sat/案件管理アプリ_claudecode用/sat_thefighters_app" && git add index.html && git commit -m "$(cat <<'EOF'
fix: 部門別売上画面をデスクトップ@mediaの全画面ルールに追加

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 検証サマリー（完了条件）

- [ ] `node --check` が全タスクで `OK`
- [ ] 各案件の部門按分合計が `netInhouse` と一致（Task 1 Step 3）
- [ ] 部門合計 `grand` が全案件の `netInhouse` 合計と一致（Task 1 Step 3）
- [ ] 売上表に「🏢 部門別」ボタンが出て、押すと専用画面が開く（Task 3, 4）
- [ ] サマリーに4部門の金額・構成比、本体に部門ごとの案件内訳が出る（Task 4）
- [ ] 期間フィルタが効く（Task 4 Step 4）
- [ ] デスクトップ・モバイルで崩れない／横スクロール無し（Task 5）
- [ ] 戻ると売上表が従来どおり（Task 5 Step 6）

## 備考

- 月別推移（設計の「余裕があれば」）は YAGNI として本計画から除外。必要なら別タスクで追加。
- プッシュは main 反映のため、ユーザーは「確認せず可」と合意済みだが、各機能の区切りで状況を共有する。
