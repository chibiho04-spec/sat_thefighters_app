# キャラクター詳細ステータス画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム/漢たちタブのキャラカードをタップすると、その人の詳細ステータス画面（基本情報・ゲーム・勤務・担当案件）が開くようにする。自分は編集可、他人は閲覧のみ。

**Architecture:** 単一HTMLファイル `index.html`（HTML/CSS/JSインライン）に、既存の `#staff-edit-screen`（右からスライドインするフルスクリーンオーバーレイ）と同じパターンで新規オーバーレイ `#staff-detail-screen` を1つ追加。表示データは既存のデータソース（`loadStaffMaster` / `SUMO_FIGHTERS` / `USER_STAFF` / `getSavedProjects` / `loadWS`）から集約するピュア関数 `getStaffDetail(key)` と `getStaffCases(key)` を介して取得。タップ動線は既存カードの `onclick` を `openStaffDetail(key)` に差し替える。

**Tech Stack:** Vanilla HTML/CSS/JS（フレームワークなし）、localStorage、`makePixelChar` SVGドット絵。自動テストは `node --check`（インラインJS抽出）＋ブラウザ手動確認（このプロジェクトにテストランナーは無い）。

---

## このプロジェクト特有の前提（実装者へ）

- **編集対象は `index.html` ただ1ファイルのみ。** HTML/CSS/JSはすべてインライン。
- **テストランナーは無い。** 各タスクの「テスト」は次の2段構え：
  1. **自動：** インラインJS（`<script>`〜`</script>`）を抽出して `node --check` で構文チェック。
  2. **手動：** ブラウザ（`file://` で `index.html` 直開き、またはGitHub Pages）で挙動を目視確認。
- インラインJS抽出＋構文チェックの定型コマンド（各タスクの構文チェックで使う）：

```bash
cd "$(git rev-parse --show-toplevel)"
START=$(grep -n "<script" index.html | tail -1 | cut -d: -f1)
END=$(grep -n "</script>" index.html | tail -1 | cut -d: -f1)
sed -n "$((START+1)),$((END-1))p" index.html > /tmp/inline.js
node --check /tmp/inline.js && echo "SYNTAX OK"
```

- 既存の重要なヘルパー（既に存在。新規作成しない・流用する）：
  - `STAFF_KEYS`（10名のkey配列。`SUMO_FIGHTERS` と同順）／ `STAFF_ROLES`
  - `loadStaffMaster()` → 配列、`getStaffByKey(key)` → 1件（name/firstName/english/position/joinDate/role/stars）
  - `SUMO_FIGHTERS[i]`（name/level/str/spd/end/palette）
  - `USER_STAFF[key]`（exp/expNext/hours/overtime/skills/avatar。**shin のみ**）
  - `makePixelChar(palette)` → ドット絵SVG文字列
  - `_staffTenureYears(joinDate)` / `staffTenureText(joinDate)`
  - `getSavedProjects()` → 保存済み案件配列、`loadWS(num)` → ワークシート保存値
  - `openWS(num)` → 案件編集画面を開く、`openStaffEdit(key)` → 既存の編集オーバーレイを開く
  - `_esc(s)` → HTMLエスケープ
  - `STAFF_POSITION_COLOR`（役職→色）
- 自分判定：`localStorage.getItem('last_login_name')` に**スタッフkey**（例 `'shin'`）が入っている。`key === last_login_name` なら本人。
- 案件のクルー欄：保存済み案件は `crewProducer, crewD, crewPm1, crewPm2, crewC, crewA, crewA2, crewSound, crewEdit`。`loadWS(num)` 側は `crew_producer, crew_d, crew_pm1, crew_pm2, crew_c, crew_a, crew_a2, crew_sound, crew_edit`。氏名（姓）部分一致で判定（既存 `isUserInEvent` と同方式）。

---

## File Structure

`index.html` 1ファイルのみを編集。追加・変更する箇所：

- **HTML**：`#staff-edit-screen`（5085行付近の `<!-- /staff-edit-screen -->` 直後）に新規オーバーレイ `#staff-detail-screen` を追加。
- **CSS**：`@media (min-width:768px)` の3つのセレクタ群（2144行付近 / 2210行付近 / 2804行付近）に `#staff-detail-screen` を追加。
- **JS**：
  - 集約ヘルパー `getStaffDetail(key)` / `getStaffCases(key)`（`getStaffByKey` 定義の近く＝9481行付近に追加）。
  - 表示ロジック `openStaffDetail(key)` / `closeStaffDetail()`（`openStaffEdit` の近く＝9556行付近に追加）。
  - 動線：`applyStaffToCards()` 内の `card.onclick`（9517行）を差し替え。ホームカード `#user-staff-card` にクリックを追加（`renderUserStaffCard` 内 7306行付近）。
  - ナビ閉じ登録：`_NAV_LIST_PANELS`（7817行付近）に `#staff-detail-screen` を追加。

---

## Task 1: 集約ヘルパー getStaffDetail(key)

指定キーのスタッフ1人分の表示用データを1オブジェクトに集約するピュア関数。

**Files:**
- Modify: `index.html`（`getStaffByKey` 直後＝9481行付近に関数を追加）

- [ ] **Step 1: 関数を追加する**

`index.html` の `function getStaffByKey(key) { ... }`（9481行）の直後に、次を挿入する：

```javascript
  // 詳細画面用：1人分の表示データを集約して返す（基本＋ゲーム＋本人フラグ）
  // 見つからない項目は安全な既定値（'-' など）にして描画が落ちないようにする。
  function getStaffDetail(key) {
    const base = getStaffByKey(key) || {};
    const idx  = (typeof STAFF_KEYS !== 'undefined') ? STAFF_KEYS.indexOf(key) : -1;
    const fighter = (idx >= 0 && typeof SUMO_FIGHTERS !== 'undefined') ? (SUMO_FIGHTERS[idx] || {}) : {};
    const us = (typeof USER_STAFF !== 'undefined') ? (USER_STAFF[key] || null) : null;
    const isSelf = (localStorage.getItem('last_login_name') === key);
    const avatar = (fighter.palette && typeof makePixelChar === 'function')
      ? makePixelChar(fighter.palette) : '';
    const tenureYears = (typeof _staffTenureYears === 'function') ? _staffTenureYears(base.joinDate) : null;
    return {
      key: key,
      fullName: [base.name, base.firstName].filter(Boolean).join(' ') || (fighter.name || key),
      english: base.english || '',
      role: base.role || '',
      position: base.position || '',
      joinDate: base.joinDate || '',
      tenureYears: tenureYears,
      stars: Math.max(0, Math.min(5, Number(base.stars) || 0)),
      avatar: avatar,
      level: (typeof fighter.level === 'number') ? fighter.level : null,
      str: (typeof fighter.str === 'number') ? fighter.str : null,
      spd: (typeof fighter.spd === 'number') ? fighter.spd : null,
      end: (typeof fighter.end === 'number') ? fighter.end : null,
      exp: (us && typeof us.exp === 'number') ? us.exp : null,
      expNext: (us && typeof us.expNext === 'number') ? us.expNext : null,
      hours: (us && typeof us.hours === 'number') ? us.hours : null,
      overtime: (us && typeof us.overtime === 'number') ? us.overtime : null,
      isSelf: isSelf
    };
  }
```

- [ ] **Step 2: 構文チェック**

「このプロジェクト特有の前提」の定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 3: ブラウザのコンソールで動作確認**

`index.html` をブラウザで開き、ログイン後にDevToolsコンソールで：
```javascript
getStaffDetail('shin')
```
Expected: `fullName:"城間 心"`, `level:38`, `str:72`, `spd:85`, `end:68`, `isSelf:true`（shinでログイン時）。
```javascript
getStaffDetail('kawasaki')
```
Expected: `fullName:"川崎 哲也"`, `level:50`, `exp:null`, `hours:null`, `isSelf:false`。エラーが出ないこと。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: スタッフ詳細データ集約 getStaffDetail(key) を追加

基本情報(loadStaffMaster)＋ゲーム(SUMO_FIGHTERS)＋EXP/勤務(USER_STAFF)を
1オブジェクトに集約。EXP/勤務が無い人はnullで返し描画側で出し分ける。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 担当案件リスト getStaffCases(key)

指定キーの人がクルーに入っている保存済み案件を返すヘルパー。

**Files:**
- Modify: `index.html`（Task 1 で追加した `getStaffDetail` の直後に追加）

- [ ] **Step 1: 関数を追加する**

Task 1 で挿入した `getStaffDetail` 関数の閉じ `}` の直後に、次を挿入する：

```javascript
  // 詳細画面用：指定スタッフがクルーに入っている保存済み案件の一覧を返す。
  // 返り値: [{ num, title, date }]（撮影日の新しい順）。本人判定は姓の部分一致。
  function getStaffCases(key) {
    const base = getStaffByKey(key) || {};
    const surname = String(base.name || '').trim();
    if (!surname) return [];
    const projFields  = ['crewProducer','crewD','crewPm1','crewPm2','crewC','crewA','crewA2','crewSound','crewEdit'];
    const savedFields = ['crew_producer','crew_d','crew_pm1','crew_pm2','crew_c','crew_a','crew_a2','crew_sound','crew_edit'];
    const projects = (typeof getSavedProjects === 'function') ? getSavedProjects() : [];
    const out = [];
    projects.forEach(p => {
      if (!p || !p.num) return;
      const saved = (typeof loadWS === 'function') ? (loadWS(p.num) || {}) : {};
      const inProj  = projFields.some(f  => String(p[f]     || '').includes(surname));
      const inSaved = savedFields.some(f => String(saved[f] || '').includes(surname));
      if (inProj || inSaved) {
        out.push({
          num: p.num,
          title: p.title || saved['edit_title'] || '(無題)',
          date:  p.date  || saved['wsd-shootdate'] || ''
        });
      }
    });
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }
```

- [ ] **Step 2: 構文チェック**

定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 3: ブラウザのコンソールで動作確認**

DevToolsコンソールで：
```javascript
getStaffCases('shin')
```
Expected: 配列が返る（城間がクルーに入っている案件のみ）。各要素に `num`/`title`/`date`。該当0件なら `[]`。エラーが出ないこと。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: 担当案件リスト getStaffCases(key) を追加

保存済み案件＋loadWSのクルー欄を姓の部分一致で絞り、撮影日の新しい順で返す。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 詳細画面オーバーレイのHTML

スライドインするフルスクリーンオーバーレイの器を追加（中身は空のプレースホルダ要素。描画はTask 5）。

**Files:**
- Modify: `index.html`（`<!-- /staff-edit-screen -->`＝5085行の直後に追加）

- [ ] **Step 1: オーバーレイHTMLを追加する**

`index.html` の `</div><!-- /staff-edit-screen -->`（5085行）の直後に、次のブロックを挿入する：

```html
  <!-- ========== キャラクター詳細ステータス画面（スライドイン） ========== -->
  <div id="staff-detail-screen" style="
    position:absolute; inset:0; z-index:177;
    background:var(--panel-bg);
    transform:translateX(100%);
    transition:transform 0.28s cubic-bezier(.4,0,0.2,1);
    display:flex; flex-direction:column; overflow:hidden;">

    <div style="display:flex;align-items:center;gap:10px;background:#3a3a6e;padding:10px 12px;flex-shrink:0;border-bottom:3px solid #2c2c4a;">
      <button class="wsd-back" onclick="closeStaffDetail()">◀ 戻る</button>
      <div class="wsd-header-info" style="flex:1;">
        <div class="wsd-header-num" style="color:#c7c7ec;">ステータス</div>
        <div class="wsd-header-title" id="sd-title">キャラクター詳細</div>
      </div>
      <button id="sd-edit-btn" onclick="closeStaffDetail(); if(window._sdEditKey) openStaffEdit(window._sdEditKey);"
        style="display:none;background:#5b5bb0;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer;">✏️ 編集</button>
    </div>

    <div class="wsd-scroll" id="sd-body">
      <!-- 描画は openStaffDetail() が流し込む -->
    </div>
  </div><!-- /staff-detail-screen -->
```

- [ ] **Step 2: 構文チェック（HTML追加でもJSが壊れていないか）**

定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 3: ブラウザで存在確認**

`index.html` を開き、DevToolsコンソールで：
```javascript
!!document.getElementById('staff-detail-screen')
```
Expected: `true`。画面はまだ右外（`translateX(100%)`）なので見えなくてOK。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: キャラクター詳細画面オーバーレイ #staff-detail-screen を追加

staff-edit-screenと同じスライドインパターン。ヘッダに戻る/編集ボタン、
本文は #sd-body（描画は後続タスク）。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: デスクトップCSSとナビ閉じ登録

新規オーバーレイをデスクトップ幅で正しく配置し、他タブへ移動するとき自動で閉じるよう登録する。

**Files:**
- Modify: `index.html`（`@media (min-width:768px)` の3セレクタ群：2144行付近 / 2210行付近 / 2804行付近、`_NAV_LIST_PANELS`：7817行付近）

- [ ] **Step 1: 1つ目のメディアクエリ群に追加**

2144行付近、`#equip-master-screen,` の下に `#staff-edit-screen,` がある最初のブロック。その `#staff-edit-screen,` の直後の行に `#staff-detail-screen,` を追加する：

```css
    #equip-master-screen,
    #staff-edit-screen,
    #staff-detail-screen,
    #client-master-screen,
```

- [ ] **Step 2: 2つ目のメディアクエリ群に追加**

2210行付近、`#ws-detail-screen,` で始まるブロック内の `#staff-edit-screen,` の直後に同様に追加：

```css
    #equip-master-screen,
    #staff-edit-screen,
    #staff-detail-screen,
    #client-master-screen,
```

- [ ] **Step 3: 3つ目のメディアクエリ群に追加（transition打ち消し）**

2804行付近、`/* インラインの transition:transform 0.28s をすべて打ち消す */` コメント直下のブロック内の `#staff-edit-screen,` の直後に同様に追加：

```css
  #equip-master-screen,
  #staff-edit-screen,
  #staff-detail-screen,
  #client-master-screen,
```

- [ ] **Step 4: ナビ閉じ登録に追加**

7817行付近の `_NAV_LIST_PANELS` 配列、`{ id: 'staff-edit-screen', close: () => closeStaffEdit() },` の直後に次の行を追加：

```javascript
    { id: 'staff-detail-screen',     close: () => closeStaffDetail() },
```

- [ ] **Step 5: 構文チェック**

定型コマンドを実行。
Expected: `SYNTAX OK`（`closeStaffDetail` はTask 5で定義するが、構文チェックは参照解決をしないのでOK。この時点でナビ移動を実際に叩くのはTask 5以降）

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: 詳細画面のデスクトップ配置CSSとナビ閉じ登録を追加

@media(min-width:768px)の3セレクタ群に#staff-detail-screenを追加し、
_NAV_LIST_PANELSに登録して他タブ移動時に自動で閉じるようにした。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 表示ロジック openStaffDetail / closeStaffDetail

集約データを `#sd-body` に描画し、本人なら編集ボタンを出す。

**Files:**
- Modify: `index.html`（`closeStaffEdit` 関数＝9557行付近の直後に追加）

- [ ] **Step 1: 描画関数を追加する**

`index.html` の `function closeStaffEdit() { ... }`（9557〜9560行付近）の閉じ `}` の直後に、次を挿入する：

```javascript
  // 詳細ステータス画面を開く（自分は編集ボタンあり・他人は閲覧のみ）
  function openStaffDetail(key) {
    const d = getStaffDetail(key);
    if (!d) return;
    window._sdEditKey = key;

    const title = document.getElementById('sd-title');
    if (title) title.textContent = d.fullName;

    const editBtn = document.getElementById('sd-edit-btn');
    if (editBtn) editBtn.style.display = d.isSelf ? 'block' : 'none';

    const stars = '★'.repeat(d.stars) + '☆'.repeat(5 - d.stars);
    const bar = (v) => {
      const n = (typeof v === 'number') ? Math.max(0, Math.min(100, v)) : 0;
      return `<div style="background:#1c1c2b;border-radius:4px;height:8px;overflow:hidden;margin-top:2px;">
        <div style="background:linear-gradient(90deg,#9b59b6,#5b5bb0);height:100%;width:${n}%;"></div></div>`;
    };

    // 右カラム（ゲームステータス）
    const lvText = (d.level !== null) ? ('Lv' + d.level) : 'Lv-';
    const expRow = (d.exp !== null && d.expNext)
      ? `<div style="margin-bottom:6px;font-size:11px;">EXP ${d.exp}/${d.expNext}
           ${bar(Math.round((d.exp / d.expNext) * 100))}</div>` : '';
    const statRow = (label, v) =>
      `<div style="font-size:11px;margin:4px 0;">${label} ${(v !== null) ? v : '-'}${bar(v)}</div>`;

    // 勤務データ（本人のみ）
    const cases = getStaffCases(key);
    const nowYm = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    const progress = cases.filter(c => String(c.date).slice(0, 7) === nowYm).length;
    const workBlock = d.isSelf ? `
      <div style="display:flex;gap:6px;margin:10px 12px 0;">
        <div style="flex:1;background:#2c2c3e;border-radius:8px;padding:8px;color:#ddd;font-size:11px;text-align:center;">
          月間勤務<br><b style="font-size:16px;color:#7fd6a0;">${(d.hours !== null) ? d.hours : '-'}h</b><br>
          残業 ${(d.overtime !== null) ? d.overtime : '-'}h</div>
        <div style="flex:1;background:#2c2c3e;border-radius:8px;padding:8px;color:#ddd;font-size:11px;text-align:center;">
          進行中<br><b style="font-size:16px;color:#7fb0d6;">${progress}件</b></div>
      </div>` : '';

    // 担当案件リスト
    const casesRows = cases.length
      ? cases.map(c =>
          `<div onclick="closeStaffDetail(); openWS('${_esc(c.num)}');"
            style="padding:7px 4px;border-bottom:1px solid #ffffff14;cursor:pointer;color:#ddd;font-size:12px;">
            ・${_esc(c.num)} ${_esc(c.title)}${c.date ? `<span style="color:#9b9bd6;"> (${_esc(c.date)})</span>` : ''}</div>`
        ).join('')
      : `<div style="color:#888;font-size:12px;padding:6px 4px;">担当案件はありません</div>`;

    const body = document.getElementById('sd-body');
    if (body) body.innerHTML = `
      <div style="background:linear-gradient(160deg,#3a3a6e,#2c2c3e);padding:16px 14px;color:#fff;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="flex:0 0 auto;width:112px;text-align:center;">
            <div style="width:88px;height:88px;margin:0 auto;background:#46467a;border-radius:14px;
              display:flex;align-items:center;justify-content:center;image-rendering:pixelated;overflow:hidden;">${d.avatar || '👤'}</div>
            <div style="font-size:15px;font-weight:bold;margin-top:6px;">${_esc(d.fullName)}</div>
            ${d.english ? `<div style="font-size:9px;color:#cfcfe8;">${_esc(d.english)}</div>` : ''}
            ${d.role ? `<div style="font-size:10px;color:#ffd86b;margin-top:2px;">${_esc(d.role)}</div>` : ''}
            ${(d.joinDate || d.tenureYears !== null) ? `<div style="font-size:9px;color:#b8b8d8;margin-top:4px;border-top:1px solid #ffffff22;padding-top:4px;">
              ${d.joinDate ? '入社 ' + _esc(d.joinDate) + '<br>' : ''}${d.tenureYears !== null ? '勤続 ' + d.tenureYears + '年' : ''}</div>` : ''}
          </div>
          <div style="flex:1;font-size:11px;color:#e7e7f5;padding-top:4px;">
            <div style="margin-bottom:6px;"><b style="color:#c7c7ec;font-size:13px;">${lvText}</b>
              <span style="color:#ffd86b;">${stars}</span></div>
            ${expRow}
            ${statRow('🦾 筋力', d.str)}
            ${statRow('⚡ 素早さ', d.spd)}
            ${statRow('🛡 粘り強さ', d.end)}
          </div>
        </div>
      </div>
      ${workBlock}
      <div style="margin:10px 12px;background:#2c2c3e;border-radius:8px;padding:8px 10px;">
        <b style="color:#9b9bd6;font-size:12px;">担当案件</b>
        <div style="margin-top:4px;">${casesRows}</div>
      </div>`;

    const screen = document.getElementById('staff-detail-screen');
    if (screen) screen.style.transform = 'translateX(0)';
  }

  function closeStaffDetail() {
    const screen = document.getElementById('staff-detail-screen');
    if (screen) screen.style.transform = 'translateX(100%)';
    window._sdEditKey = null;
  }
```

- [ ] **Step 2: 構文チェック**

定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 3: ブラウザで描画確認（コンソールから直接開く）**

`index.html` を開きログイン後、DevToolsコンソールで：
```javascript
openStaffDetail('shin')
```
Expected: 右からパネルがスライドインし、左にアバター＋名前＋英語＋役職＋入社/勤続、右にLv＋★・EXP・筋力/素早/粘り、勤務ブロック（本人なので表示）、担当案件リストが出る。ヘッダ右に「✏️ 編集」ボタンが見える。
```javascript
openStaffDetail('kawasaki')
```
Expected: 川崎の詳細が出る。**勤務ブロックは非表示**、編集ボタンも**非表示**。EXP行は出ない（exp=nullのため）。エラーが出ないこと。
```javascript
closeStaffDetail()
```
Expected: パネルが右へ消える。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: 詳細画面の描画 openStaffDetail/closeStaffDetail を実装

集約データを#sd-bodyに流し込み。本人のみ勤務ブロック＋編集ボタン表示、
EXPが無い人はEXP行を省略。担当案件タップでopenWSへ遷移。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: タップ動線の配線

漢たちタブのカードとホームの自分カードから詳細画面を開くようにする。

**Files:**
- Modify: `index.html`（`applyStaffToCards` 内 9517行、`renderUserStaffCard` 内 7306行付近）

- [ ] **Step 1: 漢たちタブのカードを詳細画面に向ける**

`applyStaffToCards()` 内の次の1行（9517行）：
```javascript
      card.onclick = () => openStaffEdit(s.key);
```
を、次に置き換える：
```javascript
      card.onclick = () => openStaffDetail(s.key);
```

- [ ] **Step 2: ホームの自分カードをクリック可能にする**

`renderUserStaffCard(loginName)` 内、最後の `card.style.display = 'flex';`（7306行）の**直前**に次を挿入する：
```javascript
    card.style.cursor = 'pointer';
    card.onclick = () => openStaffDetail(loginName);
```

- [ ] **Step 3: 構文チェック**

定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 4: ブラウザで動線確認**

`index.html` を開きログイン（shin）：
1. ホームの自分カードをタップ → 自分（城間）の詳細が開く。編集ボタンあり。
   Expected: スライドインし、勤務ブロック表示、✏️編集ボタン表示。
2. 「✏️ 編集」をタップ → 詳細が閉じ、既存の編集フォーム（`#staff-edit-screen`）が開く。
   Expected: 城間の編集画面（名前・役割など）が出る。
3. 詳細を閉じ、✊漢たちタブへ。他人（例：川崎）のカードをタップ → 川崎の詳細が開く。
   Expected: 勤務ブロック非表示・編集ボタン非表示。
4. 担当案件の行をタップ → 該当案件の編集画面が開く。
   Expected: `openWS` で案件が開く（案件が無ければ行自体が無い＝「担当案件はありません」）。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: カードタップで詳細画面を開くよう配線

漢たちタブのカードonclickをopenStaffDetailに変更、ホームの自分カードに
クリックを追加。編集は詳細→✏️ボタン経由で既存openStaffEditを呼ぶ。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 全体結合確認とコミット

仕様の全要件が満たされ、既存機能が壊れていないことを確認する。

**Files:**
- 変更なし（確認のみ。必要に応じて微修正）

- [ ] **Step 1: 構文チェック（最終）**

定型コマンドを実行。
Expected: `SYNTAX OK`

- [ ] **Step 2: 仕様の受け入れ確認（ブラウザ手動）**

`index.html` を開き、次をすべて確認する（仕様書 2026-06-02-character-detail-screen-design.md のテスト観点）：

1. ホームの自分カードタップ → 自分の詳細が開く。編集ボタンあり → 編集フォームが開く。 → ✅/❌
2. 漢たちタブの他人カードタップ → その人の詳細が開く。勤務データ非表示・編集ボタン無し。 → ✅/❌
3. 担当案件タップ → 該当案件が開く。 → ✅/❌
4. 詳細→戻る→他タブへ移動 → オーバーレイが残らず正常表示（ナビ閉じ登録が効く）。 → ✅/❌
5. デスクトップ幅（ウィンドウを768px以上に広げる）でレイアウトが崩れない。 → ✅/❌
6. EXPの無い人（川崎など）でエラーが出ない（DevToolsコンソールにエラー無し）。 → ✅/❌
7. 担当案件0件の人で「担当案件はありません」が出る。 → ✅/❌

- [ ] **Step 3: 既存機能の非回帰確認**

1. 漢たちタブの編集（詳細→✏️→保存）が従来どおり保存できる。 → ✅/❌
2. ホームカードのLv/筋力/素早/粘り/勤務時間の表示が従来どおり（カード自体は変わらない）。 → ✅/❌
3. 他のスライドイン画面（案件編集・請求書など）の開閉に影響が無い。 → ✅/❌

- [ ] **Step 4: 問題があれば修正、無ければ完了コミット**

非回帰で問題があれば該当タスクのコードを見直して修正・再コミット。問題が無ければ、確認済みである旨を残すための空でないコミットは不要（Task 6までで実装は完了済み）。最終的に：
```bash
git status
git log --oneline -7
```
Expected: 作業ツリーがクリーン。Task 1〜6 のコミットが並んでいる。

---

## Self-Review（作成者チェック済み）

- **Spec coverage:**
  - 案B（漢たちタブ存続）→ Task 6 はカードの onclick を差し替えるだけでタブは残す。✅
  - 入口2つ（ホーム自分カード／漢たちカード）→ Task 6 Step 1・2。✅
  - レイアウト（左カラム：アバター→名前→英語→役職→入社/勤続、右：Lv＋★・EXP・筋力/素早/粘り、勤務、担当案件）→ Task 5 の `#sd-body` 描画。✅
  - 本人のみ勤務データ＋編集可、他人は閲覧のみ → Task 5（`d.isSelf` で出し分け）＋Task 3（編集ボタン）。✅
  - 除外（読み・スキル・部門別・メモ）→ 描画に含めていない。✅
  - データソース（loadStaffMaster/SUMO_FIGHTERS/USER_STAFF/getSavedProjects/loadWS）→ Task 1・2。✅
  - 既存 staff-edit-screen パターン流用・新規オーバーレイ追加 → Task 3。✅
  - デスクトップCSS 3群追加・ナビ閉じ登録 → Task 4。✅
  - エッジ（staff_master未取得フォールバック＝loadStaffMaster任せ／index無しでstr等'-'／EXP無しで行省略／勤務他人非表示／案件0件メッセージ／星は表示のみ）→ Task 1・5 で対応。✅
- **Placeholder scan:** TBD/TODO等なし。各コード手順に実コードを記載。✅
- **Type consistency:** `getStaffDetail`/`getStaffCases`/`openStaffDetail`/`closeStaffDetail`/`window._sdEditKey`/`#sd-body`/`#sd-title`/`#sd-edit-btn`/`#staff-detail-screen` の名称はTask間で一致。✅
```
