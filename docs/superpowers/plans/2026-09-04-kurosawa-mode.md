# KUROSAWA mode 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上部バーの「🎬 KUROSAWA」ボタンで、アプリ全体が白黒（フィルム調）になり、川崎のドット絵が浪人になり、相撲ミニゲームが斬り合いの読み替えになる。

**Architecture:** 単一ファイル `index.html` に、(1) `kurosawa_mode` を localStorage に持つ3関数 `isKurosawa / toggleKurosawaMode / applyKurosawaMode`、(2) `body.kurosawa` のときだけ表示される最前面の透明オーバーレイ `#kz-overlay`（`backdrop-filter` で後ろを白黒に）、(3) アバターの全入口が通る `_charPalette()`、(4) 技・言葉テーブルを2組にして `isKurosawa()` で切り替える `_techList / _techPower / _words` を足す。業務データ・同期には触れない。

**Tech Stack:** 素の HTML/CSS/JS（依存なし）。テストは Node で `index.html` から関数を切り出して実行する（このリポジトリの慣例）。設計書: `docs/superpowers/specs/2026-09-04-kurosawa-mode-design.md`

---

> **2026-09-04 変更**：Task 3・4 は「スタッフ一覧の川崎」を対象にしていたが、本人確認で対象は
> **ホーム画面上部の川崎会長（CSSキャラ）**と判明。Task 3・4 の成果は取り消し（362bc72）、
> 代わりに `body.kurosawa .character` 系の CSS で浪人化した（f26b7a9）。設計書 §3 を更新済み。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 本体。変更はすべてここ（単一ファイル構成のため） |
| `tests/kurosawa/_extract.js` | `index.html` から関数・定数を切り出す共通ヘルパー（各テストが require する） |
| `tests/kurosawa/test-mode.js` | Task 1・2：モード切替・保存・オーバーレイのCSS |
| `tests/kurosawa/test-samurai.js` | Task 3・4：ドット絵とパレット差し替え |
| `tests/kurosawa/test-duel.js` | Task 5：技テーブル・言葉の読み替え |
| `tests/kurosawa/run.sh` | 上の3本を順に実行 |

### コミットの作法（このリポジトリの決まり）

`index.html` には未コミットの「同期ガード強化」（`_pickNewer` 周辺）が残っている。**それを混ぜない**ため、各タスクのコミットは次の手順で行う（既存セッションと同じ）。

```bash
# 1) 自分の変更だけをステージ（_pickNewer / _issued / データ保護 を含むハンクは除外）
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ
SP=/tmp/kz-commit; mkdir -p "$SP"
git diff index.html > "$SP/full.patch"
node -e '
const fs=require("fs");const sp="/tmp/kz-commit";
const t=fs.readFileSync(sp+"/full.patch","utf8").split("\n");
const head=[],hunks=[];let i=0;
for(;i<t.length;i++){if(t[i].startsWith("@@"))break;head.push(t[i]);}
let cur=null;for(;i<t.length;i++){if(t[i].startsWith("@@")){if(cur)hunks.push(cur);cur=[t[i]];}else if(cur)cur.push(t[i]);}
if(cur)hunks.push(cur);
const mine=hunks.filter(h=>!/_pickNewer|_issued|データ保護/.test(h.join("\n")));
fs.writeFileSync(sp+"/mine.patch",head.join("\n")+"\n"+mine.map(h=>h.join("\n")).join("\n")+"\n");
console.log("全ハンク:"+hunks.length+" / コミット:"+mine.length);'
git apply --cached "$SP/mine.patch"
git add tests/kurosawa   # テストがあれば
# 2) ステージした版で構文チェック
git show :index.html > "$SP/staged.html"
node -e '
const fs=require("fs");const h=fs.readFileSync("/tmp/kz-commit/staged.html","utf8");
const re=/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,o="";while((m=re.exec(h))){o+="\n"+m[1];}
fs.writeFileSync("/tmp/kz-commit/staged.js",o);'
node --check /tmp/kz-commit/staged.js && echo "構文OK"
# 3) コミット・push
git commit -q -m "<メッセージ>" && git push
```

以下の各タスクの「Commit」ステップは、この手順を指す。

---

### Task 0: テスト用の切り出しヘルパー

**Files:**
- Create: `tests/kurosawa/_extract.js`
- Create: `tests/kurosawa/run.sh`

- [ ] **Step 1: ヘルパーを書く**

```js
// tests/kurosawa/_extract.js
// index.html から関数・const を切り出して eval できる形で返す。各テストが使う。
const fs = require('fs');
const path = require('path');
const HTML_PATH = path.join(__dirname, '..', '..', 'index.html');

function html() { return fs.readFileSync(HTML_PATH, 'utf8'); }

// function NAME( ... ) { ... } の本文を対応する閉じ括弧まで返す
function grabFunction(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('関数が見つからない: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('関数の終わりが見つからない: ' + name);
}

// const NAME = [ ... ] / { ... } の値部分を JS の値として返す
function grabConst(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([\\[{][\\s\\S]*?[\\]}]);'));
  if (!m) throw new Error('定数が見つからない: ' + name);
  return eval('(' + m[1] + ')');
}

// <style> の中身をすべて連結して返す
function css(src) {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi; let m, out = '';
  while ((m = re.exec(src))) out += '\n' + m[1];
  return out;
}

// 簡易 localStorage（テスト用）
function fakeStorage(init) {
  const store = Object.assign({}, init || {});
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _store: store,
  };
}

// 結果を数える ok()
function makeOk() {
  let ng = 0;
  const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) ng++; };
  ok.done = () => { process.exitCode = ng ? 1 : 0; return ng === 0; };
  return ok;
}

module.exports = { html, grabFunction, grabConst, css, fakeStorage, makeOk };
```

- [ ] **Step 2: 実行スクリプトを書く**

```bash
#!/bin/bash
# tests/kurosawa/run.sh — KUROSAWA mode のテストを順に実行
cd "$(dirname "$0")/../.."
fail=0
for t in tests/kurosawa/test-*.js; do
  [ -f "$t" ] || continue
  echo "=== $t ==="
  node "$t" || fail=1
  echo
done
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "FAILED"; exit 1; }
```

- [ ] **Step 3: 実行権限を付けて空振りを確認**

Run: `chmod +x tests/kurosawa/run.sh && tests/kurosawa/run.sh`
Expected: `ALL PASS`（テストがまだ無いので何も走らず PASS）

- [ ] **Step 4: Commit**

```bash
git add tests/kurosawa/_extract.js tests/kurosawa/run.sh
git commit -m "test(KUROSAWA mode): テスト用の切り出しヘルパーを追加"
git push
```

---

### Task 1: モード切替（保存・関数・ボタン・起動時適用）

**Files:**
- Modify: `index.html` — 上部バーの「データ管理」ボタン（`title="データ管理">データ管理</button>` の行）
- Modify: `index.html` — 起動時の `font_scale` 適用（`const s = parseFloat(localStorage.getItem('font_scale'));` の直前）
- Test: `tests/kurosawa/test-mode.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/kurosawa/test-mode.js
const { html, grabFunction, fakeStorage, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();

console.log('=== モード切替の関数 ===');
let bodyClasses = new Set();
global.document = {
  body: { classList: { add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c), contains: c => bodyClasses.has(c), toggle: (c, on) => { on ? bodyClasses.add(c) : bodyClasses.delete(c); } } },
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.localStorage = fakeStorage();
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, 'applyKurosawaMode'));
eval(grabFunction(src, 'toggleKurosawaMode'));

ok(isKurosawa() === false, '初期状態は OFF');
toggleKurosawaMode();
ok(isKurosawa() === true, '1回押すと ON');
ok(localStorage.getItem('kurosawa_mode') === '1', "保存値は '1'");
ok(bodyClasses.has('kurosawa'), 'body に kurosawa クラスが付く');
toggleKurosawaMode();
ok(isKurosawa() === false, 'もう1回押すと OFF');
ok(localStorage.getItem('kurosawa_mode') === '0', "保存値は '0'");
ok(!bodyClasses.has('kurosawa'), 'body からクラスが消える');

console.log('\n=== 保存値がおかしくても落ちない ===');
['', 'abc', null, '2', 'true'].forEach(v => {
  global.localStorage = fakeStorage(v === null ? {} : { kurosawa_mode: v });
  ok(isKurosawa() === false, "保存値 " + JSON.stringify(v) + " は OFF 扱い");
});
global.localStorage = fakeStorage({ kurosawa_mode: '1' });
ok(isKurosawa() === true, "保存値 '1' だけ ON");

console.log('\n=== 配線 ===');
ok(/id="kz-toggle-btn"/.test(src), 'ボタン #kz-toggle-btn がある');
ok(/onclick="toggleKurosawaMode\(\)"/.test(src), 'ボタンが toggleKurosawaMode を呼ぶ');
ok(src.indexOf('id="kz-toggle-btn"') < src.indexOf('title="データ管理">データ管理</button>'), 'ボタンはデータ管理の左');
const boot = src.slice(src.indexOf("const s = parseFloat(localStorage.getItem('font_scale'))") - 400,
                       src.indexOf("const s = parseFloat(localStorage.getItem('font_scale'))"));
ok(/applyKurosawaMode\(\)/.test(boot), '起動時に applyKurosawaMode() を呼ぶ（font_scale の直前）');
ok.done();
```

- [ ] **Step 2: 失敗を確認**

Run: `node tests/kurosawa/test-mode.js`
Expected: `関数が見つからない: isKurosawa` で例外終了

- [ ] **Step 3: ボタンを上部バーに追加**

`index.html` の次の1行（`title="データ管理">データ管理</button>` を含む行）の**直前**に、ボタンを1つ挿入する。python で行う。

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()
anchor = '    <button onclick="openSettings()" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;font-family:\'DotGothic16\',monospace;font-size:22px;padding:6px 14px;border-radius:4px;cursor:pointer;margin-right:6px;" title="データ管理">データ管理</button>'
btn = '''    <!-- KUROSAWA mode（2026-09-04）。押すたびに白黒ON/OFF。状態は端末ごと（kurosawa_mode） -->
    <button id="kz-toggle-btn" onclick="toggleKurosawaMode()" title="KUROSAWA mode（白黒）"
      style="background:#111;border:1px solid #888;color:#fff;font-family:'DotGothic16',monospace;font-size:16px;padding:6px 10px;border-radius:4px;cursor:pointer;margin-right:6px;letter-spacing:1px;white-space:nowrap;">🎬 KUROSAWA</button>
'''
assert s.count(anchor)==1, 'データ管理ボタンの目印が1つに定まらない'
s = s.replace(anchor, btn + anchor)
open(p,'w',encoding='utf-8').write(s); print('ボタン追加')
PY
```

- [ ] **Step 4: 3関数を追加し、起動時に適用**

`const s = parseFloat(localStorage.getItem('font_scale'));` の行の**直前**に関数群と呼び出しを入れる。

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()
anchor = "    const s = parseFloat(localStorage.getItem('font_scale'));"
block = """    // ===== KUROSAWA mode（2026-09-04）=====
    // 見た目だけを黒澤映画風（白黒）にする遊び機能。業務データ・同期には触れない。
    // 状態は localStorage 'kurosawa_mode'（'1'=ON）。端末ごとの好みなので同期しない。
    // 設計書: docs/superpowers/specs/2026-09-04-kurosawa-mode-design.md
    function isKurosawa() {
      try { return localStorage.getItem('kurosawa_mode') === '1'; } catch (e) { return false; }
    }
    function applyKurosawaMode() {
      const on = isKurosawa();
      try { document.body.classList.toggle('kurosawa', on); } catch (e) {}
      // ボタンの見た目（ONは白地に黒文字で反転）
      try {
        const b = document.getElementById('kz-toggle-btn');
        if (b) { b.style.background = on ? '#fff' : '#111'; b.style.color = on ? '#111' : '#fff'; b.style.borderColor = on ? '#111' : '#888'; }
      } catch (e) {}
      // 以降のタスクでここに「アバター再描画」「SUMOの文言差し替え」を足す
      try { if (typeof _refreshKurosawaAvatars === 'function') _refreshKurosawaAvatars(); } catch (e) {}
      try { if (typeof _applySumoWords === 'function') _applySumoWords(); } catch (e) {}
    }
    function toggleKurosawaMode() {
      try { localStorage.setItem('kurosawa_mode', isKurosawa() ? '0' : '1'); } catch (e) {}
      applyKurosawaMode();
    }
    applyKurosawaMode(); // 起動時に保存値を反映（font_scale と同じタイミング）

"""
assert s.count(anchor)==1, 'font_scale の目印が1つに定まらない'
s = s.replace(anchor, block + anchor)
open(p,'w',encoding='utf-8').write(s); print('関数追加')
PY
```

- [ ] **Step 5: テストが通ることを確認**

Run: `node tests/kurosawa/test-mode.js`
Expected: すべて ✅（17項目）

- [ ] **Step 6: 構文チェック**

Run:
```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && node -e '
const fs=require("fs");const h=fs.readFileSync("index.html","utf8");
const re=/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,o="";while((m=re.exec(h))){o+="\n"+m[1];}
fs.writeFileSync("/tmp/kz-chk.js",o);' && node --check /tmp/kz-chk.js && echo "構文OK"
```
Expected: `構文OK`

- [ ] **Step 7: Commit**

メッセージ: `feat(KUROSAWA mode): 上部バーにON/OFFボタンと状態の保存を追加`

---

### Task 2: 白黒オーバーレイ（HTML + CSS）

**Files:**
- Modify: `index.html` — `<body>` の直後（`<div class="phone-frame">` の前）
- Modify: `index.html` — `.phone-frame {` の CSS ブロックの直前
- Modify: `index.html` — `@media print {` ブロックの先頭
- Test: `tests/kurosawa/test-mode.js`（追記）

- [ ] **Step 1: テストを追記**

`tests/kurosawa/test-mode.js` の `ok.done();` の**直前**に追記する。

```js
console.log('\n=== 白黒オーバーレイ ===');
const { css } = require('./_extract');
const styles = css(src);
ok(/<div id="kz-overlay" aria-hidden="true"><\/div>/.test(src), '#kz-overlay が body 直下にある');
ok(src.indexOf('id="kz-overlay"') < src.indexOf('<div class="phone-frame">'), 'phone-frame より前（外側）にある');
ok(/#kz-overlay\s*\{\s*display:\s*none;?\s*\}/.test(styles), '既定は非表示');
const on = styles.slice(styles.indexOf('body.kurosawa #kz-overlay'));
ok(/position:\s*fixed/.test(on) && /inset:\s*0/.test(on), '画面全体に固定');
ok(/pointer-events:\s*none/.test(on), 'タップを邪魔しない');
ok(/z-index:\s*2147483000/.test(on), 'ダイアログより上');
ok(/-webkit-backdrop-filter:\s*grayscale\(1\)/.test(on), 'Safari 用の -webkit- 付き');
ok(/[^-]backdrop-filter:\s*grayscale\(1\)\s*contrast\(1\.25\)/.test(on), 'グレースケール＋コントラスト');
ok(/feTurbulence/.test(on), '粒子（feTurbulence）がある');
ok(/radial-gradient/.test(on), '四隅の影がある');
ok(/opacity:\s*\.55/.test(on), '強さは opacity .55（実機で調整する1か所）');
ok(/@media print[\s\S]*#kz-overlay\s*\{\s*display:\s*none\s*!important/.test(styles), '印刷時は消える');
```

- [ ] **Step 2: 失敗を確認**

Run: `node tests/kurosawa/test-mode.js`
Expected: 「白黒オーバーレイ」の項目が ❌

- [ ] **Step 3: HTML と CSS を追加**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()

# 1) body 直下に膜を置く
old = '<body>\n\n<div class="phone-frame">'
new = '<body>\n\n<!-- KUROSAWA mode の膜（2026-09-04）。body.kurosawa のときだけ表示され、backdrop-filter で後ろを白黒にする。\n     祖先に filter を付けると position:fixed の画面の位置基準がずれるため、膜方式にしている。 -->\n<div id="kz-overlay" aria-hidden="true"></div>\n\n<div class="phone-frame">'
assert s.count(old)==1, 'body の目印が1つに定まらない'
s = s.replace(old, new)

# 2) CSS（.phone-frame の直前）
anchor = '  .phone-frame {\n    width: 100vw;'
cssblock = '''  /* ===== KUROSAWA mode：白黒（フィルム調）の膜（2026-09-04）===== */
  #kz-overlay { display: none; }
  body.kurosawa #kz-overlay {
    display: block;
    position: fixed; inset: 0;
    z-index: 2147483000;              /* ダイアログ(〜100000)より上＝全部が膜の後ろに入る */
    pointer-events: none;             /* タップ・スクロールを邪魔しない */
    -webkit-backdrop-filter: grayscale(1) contrast(1.25) brightness(1.02);
            backdrop-filter: grayscale(1) contrast(1.25) brightness(1.02);
    background:
      radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>");
    mix-blend-mode: multiply;
    opacity: .55;                     /* ← 粒子と四隅の影の強さ。実機で見て弱めるならここ1か所 */
  }
'''
assert s.count(anchor)==1, '.phone-frame の目印が1つに定まらない'
s = s.replace(anchor, cssblock + anchor)

# 3) 印刷時は消す（保険。印刷は別ウィンドウなので元々影響しない）
anchor2 = '  @media print {\n    @page { size: A4; margin: 15mm; }'
new2 = '  @media print {\n    #kz-overlay { display: none !important; }  /* KUROSAWA mode の膜は印刷に出さない */\n    @page { size: A4; margin: 15mm; }'
assert s.count(anchor2)==1, '@media print の目印が1つに定まらない'
s = s.replace(anchor2, new2)

open(p,'w',encoding='utf-8').write(s); print('膜を追加')
PY
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/kurosawa/test-mode.js`
Expected: すべて ✅

- [ ] **Step 5: 構文チェック**（Task 1 Step 6 と同じコマンド）
Expected: `構文OK`

- [ ] **Step 6: Commit**

メッセージ: `feat(KUROSAWA mode): 白黒（フィルム調）の膜を追加`

- [ ] **Step 7: 実機確認（本人）**

⌘+Shift+R で再読み込み → 上部バー「🎬 KUROSAWA」を押す。確認すること：
- 画面全体が白黒になり、四隅が少し暗く、粒子が乗る
- 文字が読める（スマホ幅／文字サイズ150%）。強すぎれば CSS の `opacity: .55` を下げる
- 受注番号の変更・データ管理など `position:fixed` の画面も白黒で、位置がずれない
- 請求書のプレビュー／PDF はカラーのまま
- もう一度押すと元に戻る。再読み込みしても状態が残る

**ここで一度止まり、本人のOKをもらってから Task 3 へ。**

---

### Task 3: ドット絵に `hat: 'samurai'` を追加

**Files:**
- Modify: `index.html` — `makePixelChar` の帽子分岐（`} else if (p.hat === 'beret') {` のブロック）と、体を描く行
- Test: `tests/kurosawa/test-samurai.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/kurosawa/test-samurai.js
const { html, grabFunction, grabConst, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();
eval(grabFunction(src, 'makePixelChar'));

const has = (svg, x, y, w, h, fill) =>
  new RegExp('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>').test(svg);

console.log('=== samurai のドット絵 ===');
const base = { hair: '#4a4a4a', body: '#8b4513', bg: '#3498db', hat: 'samurai' };
const svg = makePixelChar(base);
ok(/^<svg/.test(svg) && /<\/svg>$/.test(svg), 'SVG が返る');
ok(has(svg, 7, 0, 2, 2, '#1a1a1a'), 'ちょんまげ（頭頂 x7-8,y0-1）');
ok(has(svg, 6, 2, 4, 1, '#1a1a1a'), 'ちょんまげの土台（x6-9,y2）');
ok(has(svg, 3, 3, 10, 2, '#1a1a1a'), '髪（x3-12,y3-4）');
ok(has(svg, 3, 5, 1, 3, '#1a1a1a') && has(svg, 12, 5, 1, 3, '#1a1a1a'), 'もみあげ（両側）');
ok(has(svg, 7, 11, 2, 3, '#d0d0d0'), '着物の襟（体の中央 x7-8,y11-13）');
ok(has(svg, 4, 14, 8, 1, '#555555'), '帯（x4-11,y14）');
ok(has(svg, 13, 6, 1, 7, '#eeeeee'), '刀身（x13,y6-12）');
ok(has(svg, 12, 13, 3, 1, '#5a3a1a'), '鍔（x12-14,y13）');
ok(has(svg, 13, 14, 1, 2, '#3a2a1a'), '柄（x13,y14-15）');
// 襟・帯・刀は体（y11-15）の後に描かれていないと隠れる
ok(svg.indexOf('y="11" width="8" height="5"') < svg.indexOf('fill="#d0d0d0"'), '襟は体の後に描かれる');
ok(svg.indexOf('y="11" width="8" height="5"') < svg.indexOf('fill="#eeeeee"'), '刀は体の後に描かれる');

console.log('\n=== 既存の帽子は変わらない ===');
['helmet', 'cap', 'bandana', 'beret'].forEach(hat => {
  const s2 = makePixelChar(Object.assign({}, base, { hat }));
  ok(!/#eeeeee/.test(s2) && !/y="0" width="2" height="2" fill="#1a1a1a"/.test(s2), hat + ' に刀・ちょんまげが混ざらない');
});
ok(!/#eeeeee/.test(makePixelChar(Object.assign({}, base, { hat: undefined }))), '帽子なしにも混ざらない');
ok.done();
```

- [ ] **Step 2: 失敗を確認**

Run: `node tests/kurosawa/test-samurai.js`
Expected: 「samurai のドット絵」の項目が ❌（ちょんまげ・刀が無い）

- [ ] **Step 3: 帽子分岐と体の後の描き足しを追加**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()

# 1) 帽子分岐：beret の後に samurai を足す（髪・ちょんまげ・もみあげ）
old = """    } else if (p.hat === 'beret') {
      r += `<rect x="3" y="1" width="10" height="3" fill="#8b4513"/>`;
      r += `<rect x="11" y="2" width="2" height="2" fill="#a0522d"/>`;
    }
    r += `<rect x="4" y="11" width="8" height="5" fill="${BD}"/>`;
    r += `<rect x="5" y="10" width="6" height="1" fill="${SK}"/>`;"""
new = """    } else if (p.hat === 'beret') {
      r += `<rect x="3" y="1" width="10" height="3" fill="#8b4513"/>`;
      r += `<rect x="11" y="2" width="2" height="2" fill="#a0522d"/>`;
    } else if (p.hat === 'samurai') {
      // 浪人（KUROSAWA mode・2026-09-04）：髪・ちょんまげ・もみあげ。襟と刀は体の後で描く
      r += `<rect x="3" y="3" width="10" height="2" fill="#1a1a1a"/>`;
      r += `<rect x="3" y="5" width="1" height="3" fill="#1a1a1a"/>`;
      r += `<rect x="12" y="5" width="1" height="3" fill="#1a1a1a"/>`;
      r += `<rect x="6" y="2" width="4" height="1" fill="#1a1a1a"/>`;
      r += `<rect x="7" y="0" width="2" height="2" fill="#1a1a1a"/>`;
    }
    r += `<rect x="4" y="11" width="8" height="5" fill="${BD}"/>`;
    r += `<rect x="5" y="10" width="6" height="1" fill="${SK}"/>`;
    if (p.hat === 'samurai') {
      // 着物の襟・帯・腰の刀（体の上に重ねる）
      r += `<rect x="7" y="11" width="2" height="3" fill="#d0d0d0"/>`;
      r += `<rect x="4" y="14" width="8" height="1" fill="#555555"/>`;
      r += `<rect x="13" y="6" width="1" height="7" fill="#eeeeee"/>`;
      r += `<rect x="12" y="13" width="3" height="1" fill="#5a3a1a"/>`;
      r += `<rect x="13" y="14" width="1" height="2" fill="#3a2a1a"/>`;
    }"""
assert s.count(old)==1, 'makePixelChar の目印が1つに定まらない'
s = s.replace(old, new)
open(p,'w',encoding='utf-8').write(s); print('samurai を追加')
PY
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/kurosawa/test-samurai.js`
Expected: すべて ✅

- [ ] **Step 5: 構文チェック**（Task 1 Step 6 と同じ）
Expected: `構文OK`

- [ ] **Step 6: Commit**

メッセージ: `feat(KUROSAWA mode): ドット絵に浪人（hat: samurai）を追加`

---

### Task 4: `_charPalette` と川崎の差し替え（5か所）

**Files:**
- Modify: `index.html` — `function makeSumoAvatar(fighter) {` の直前（`_charPalette` と `_refreshKurosawaAvatars` を追加）
- Modify: `index.html` — アバターを描く4か所（`makePixelChar(fighter.palette)` ×3、`makePixelChar(f.palette)` ×1）
- Modify: `index.html` — `applyStaffToCards` の `const header   = card.children[0];` の直後
- Test: `tests/kurosawa/test-samurai.js`（追記）

- [ ] **Step 1: テストを追記**

`tests/kurosawa/test-samurai.js` の `ok.done();` の**直前**に追記。

```js
console.log('\n=== _charPalette：川崎＋ONのときだけ武士 ===');
const { fakeStorage } = require('./_extract');
global.localStorage = fakeStorage();
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, '_charPalette'));
const FIGHTERS = grabConst(src, 'SUMO_FIGHTERS');
const kawasaki = FIGHTERS.find(f => f.name === '川崎');
const shin     = FIGHTERS.find(f => f.name === '城間');
ok(!!kawasaki && !!shin, '川崎と城間が SUMO_FIGHTERS にいる');

ok(_charPalette(kawasaki) === kawasaki.palette, 'OFF：川崎は元のパレットそのもの（参照が同じ）');
localStorage.setItem('kurosawa_mode', '1');
const kp = _charPalette(kawasaki);
ok(kp !== kawasaki.palette, 'ON：川崎は別オブジェクト（元を壊さない）');
ok(kp.hat === 'samurai', 'ON：川崎は hat=samurai');
ok(kp.body === '#2c2c2c', 'ON：着物は暗い色');
ok(kp.bg === kawasaki.palette.bg, 'ON：背景色は元のまま');
ok(kawasaki.palette.hat === 'helmet', '元の SUMO_FIGHTERS は書き換わっていない');
ok(_charPalette(shin) === shin.palette, 'ON：城間は元のまま');
FIGHTERS.filter(f => f.name !== '川崎').forEach(f => ok(_charPalette(f) === f.palette, 'ON：' + f.name + ' は元のまま'));
ok(_charPalette(null) == null, 'null を渡しても落ちない');
ok(_charPalette({ name: '川崎' }) == null, 'palette が無いオブジェクトでも落ちない');

console.log('\n=== アバターの入口が全部 _charPalette を通る ===');
ok(!/makePixelChar\(fighter\.palette\)/.test(src), 'makePixelChar(fighter.palette) の直書きが残っていない');
ok(!/makePixelChar\(f\.palette\)/.test(src), 'makePixelChar(f.palette) の直書きが残っていない');
ok((src.match(/makePixelChar\(_charPalette\(/g) || []).length >= 4, '_charPalette 経由が4か所以上');
ok(/function _refreshKurosawaAvatars/.test(src), '_refreshKurosawaAvatars がある');
const asc = grabFunction(src, 'applyStaffToCards');
ok(/_charPalette/.test(asc) && /kz-orig/.test(asc), '漢たちタブは元のSVGを退避して差し替える');
```

- [ ] **Step 2: 失敗を確認**

Run: `node tests/kurosawa/test-samurai.js`
Expected: `関数が見つからない: _charPalette` で例外終了

- [ ] **Step 3: `_charPalette` と再描画関数を追加し、4か所を置換**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()

# 1) 関数を makeSumoAvatar の直前に置く
anchor = "  function makeSumoAvatar(fighter) {\n    return makePixelChar(fighter.palette);\n  }"
block = """  // ===== KUROSAWA mode：アバターのパレット差し替え（2026-09-04）=====
  // アバターを描く全箇所がここを通る。モードONかつ川崎のときだけ浪人のパレットを返す。
  // 元の palette は書き換えない（新しいオブジェクトを返す）。それ以外は元の参照をそのまま返す。
  function _charPalette(fighter) {
    if (!fighter || !fighter.palette) return fighter ? fighter.palette : null;
    if (typeof isKurosawa === 'function' && isKurosawa() && fighter.name === '川崎') {
      return Object.assign({}, fighter.palette, { hat: 'samurai', body: '#2c2c2c' });
    }
    return fighter.palette;
  }
  // モード切替のたびに、いま画面に出ているアバターを描き直す（applyKurosawaMode から呼ばれる）
  function _refreshKurosawaAvatars() {
    try { if (typeof applyStaffToCards === 'function') applyStaffToCards(); } catch (e) {}          // 漢たちタブ
    try {
      const ln = localStorage.getItem('last_login_name');
      if (ln && typeof renderUserStaffCard === 'function') renderUserStaffCard(ln);                   // ホームのステータスカード
    } catch (e) {}
    try {
      const d = document.getElementById('staff-detail-screen');
      if (d && d.style.transform === 'translateX(0)' && window._sdEditKey && typeof openStaffDetail === 'function') openStaffDetail(window._sdEditKey); // スタッフ詳細が開いていれば
    } catch (e) {}
    try {
      // SUMO の対戦画面に出ているアバター（対戦中でなければ何もしない）
      if (typeof sumoCurrentP1 !== 'undefined' && sumoCurrentP1) { const a = document.getElementById('sumo-p1-avatar'); if (a) a.innerHTML = makeSumoAvatar(sumoCurrentP1); }
      if (typeof sumoCurrentP2 !== 'undefined' && sumoCurrentP2) { const a = document.getElementById('sumo-p2-avatar'); if (a) a.innerHTML = makeSumoAvatar(sumoCurrentP2); }
    } catch (e) {}
  }

  function makeSumoAvatar(fighter) {
    return makePixelChar(_charPalette(fighter));
  }"""
assert s.count(anchor)==1, 'makeSumoAvatar の目印が1つに定まらない'
s = s.replace(anchor, block)

# 2) 残り3か所（スタッフ選択画面・ステータスカード・スタッフ詳細）
n1 = s.count("makePixelChar(fighter.palette)"); s = s.replace("makePixelChar(fighter.palette)", "makePixelChar(_charPalette(fighter))")
n2 = s.count("makePixelChar(f.palette)");       s = s.replace("makePixelChar(f.palette)",       "makePixelChar(_charPalette(f))")
print('置換: fighter.palette ×%d, f.palette ×%d' % (n1, n2))
assert n1 == 2 and n2 == 1, '置換数が想定と違う（fighter:2, f:1 のはず）'

# 3) 漢たちタブ（静的SVG）：川崎のカードだけ差し替え。元のSVGは dataset に退避
old3 = "      const header   = card.children[0];\n      const rolesDiv = card.children[1];"
new3 = """      const header   = card.children[0];
      // KUROSAWA mode（2026-09-04）：川崎のカードだけアバターを浪人に。元の静的SVGは初回に退避し OFF で戻す
      try {
        const av = header && header.children[0];
        if (av && s.key === 'kawasaki') {
          if (!av.dataset.kzOrig) av.dataset.kzOrig = av.innerHTML;
          const f = (typeof SUMO_FIGHTERS !== 'undefined') ? SUMO_FIGHTERS.find(x => x.name === '川崎') : null;
          av.innerHTML = (typeof isKurosawa === 'function' && isKurosawa() && f) ? makePixelChar(_charPalette(f)) : av.dataset.kzOrig;
        }
      } catch (e) {}
      const rolesDiv = card.children[1];"""
assert s.count(old3)==1, 'applyStaffToCards の目印が1つに定まらない'
s = s.replace(old3, new3)
open(p,'w',encoding='utf-8').write(s); print('差し替え完了')
PY
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/kurosawa/test-samurai.js`
Expected: すべて ✅

- [ ] **Step 5: 構文チェック**（Task 1 Step 6 と同じ）
Expected: `構文OK`

- [ ] **Step 6: Commit**

メッセージ: `feat(KUROSAWA mode): 川崎のアバターを浪人に差し替える`

- [ ] **Step 7: 実機確認（本人）**

⌘+Shift+R → KUROSAWA を ON にして確認：
- 漢たちタブ：川崎だけ ちょんまげ＋刀。他の9人は変わらない
- ホームのステータスカード：川崎でログインしていれば浪人
- SUMO：川崎を選ぶと浪人。対戦中に切り替えても落ちない
- OFF に戻すと川崎が元のヘルメットに戻る

**ここで一度止まり、本人のOKをもらってから Task 5 へ。**

---

### Task 5: 斬り合い（技テーブル・言葉の読み替え）

**Files:**
- Modify: `index.html` — `const SUMO_TECH_POWER = {` ブロックの直後（KZ テーブルと切替関数）
- Modify: `index.html` — `sumoCalcDamage` / `sumoTurn` / `startSumo` / `sumoFinish` の直書き（6か所）
- Modify: `index.html` — SUMOタブの HTML（タイトル・東西・開始ボタン・バッジ・結果文言）に id を付ける
- Modify: `index.html` — `_applySumoWords` を追加（`_refreshKurosawaAvatars` の直後）
- Test: `tests/kurosawa/test-duel.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/kurosawa/test-duel.js
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();

console.log('=== 技テーブル：相撲と斬り合いが同じ添字＝同じ倍率 ===');
const SUMO_TECHNIQUES = grabConst(src, 'SUMO_TECHNIQUES');
const SUMO_TECH_POWER = grabConst(src, 'SUMO_TECH_POWER');
const KZ_TECHNIQUES   = grabConst(src, 'KZ_TECHNIQUES');
const KZ_TECH_POWER   = grabConst(src, 'KZ_TECH_POWER');
ok(KZ_TECHNIQUES.length === 10 && SUMO_TECHNIQUES.length === 10, '両方10件');
ok(new Set(KZ_TECHNIQUES).size === 10, '斬り合いの技名に重複なし');
KZ_TECHNIQUES.forEach((t, i) => {
  const s = SUMO_TECHNIQUES[i];
  ok(KZ_TECH_POWER[t] === SUMO_TECH_POWER[s], (i + 1) + '. ' + s + ' ' + SUMO_TECH_POWER[s] + ' = ' + t + ' ' + KZ_TECH_POWER[t]);
});
ok(KZ_TECH_POWER['一閃'] === 1.6, '一閃が一発逆転（1.6）');
const expected = ['袈裟斬り','突き','逆袈裟','唐竹割り','胴払い','受け流し','小手打ち','抜刀術','一閃','燕返し'];
ok(JSON.stringify(KZ_TECHNIQUES) === JSON.stringify(expected), '設計書どおりの10技');

console.log('\n=== 切替関数 ===');
global.localStorage = fakeStorage();
global.SUMO_TECHNIQUES = SUMO_TECHNIQUES; global.SUMO_TECH_POWER = SUMO_TECH_POWER;
global.KZ_TECHNIQUES = KZ_TECHNIQUES;     global.KZ_TECH_POWER = KZ_TECH_POWER;
global.SUMO_WORDS = grabConst(src, 'SUMO_WORDS'); global.KZ_WORDS = grabConst(src, 'KZ_WORDS');
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, '_techList')); eval(grabFunction(src, '_techPower')); eval(grabFunction(src, '_words'));
ok(_techList() === SUMO_TECHNIQUES && _techPower() === SUMO_TECH_POWER, 'OFF：相撲のテーブル');
ok(_words().title === '🏟️ 大相撲 SUMO', 'OFF：相撲の言葉');
localStorage.setItem('kurosawa_mode', '1');
ok(_techList() === KZ_TECHNIQUES && _techPower() === KZ_TECH_POWER, 'ON：斬り合いのテーブル');
ok(_words().title === '🎬 決闘 KUROSAWA' && _words().east === '東 武士' && _words().start === '⚔️ いざ尋常に！', 'ON：斬り合いの言葉');
ok(_words().miss === '空を斬る！' && _words().crit === '一刀両断！' && _words().upset === '下剋上！', 'ON：実況の言葉');
['title','east','west','start','miss','crit','upset','end','badge','referee'].forEach(k =>
  ok(typeof SUMO_WORDS[k] === 'string' && typeof KZ_WORDS[k] === 'string', '言葉 ' + k + ' が両方にある'));

console.log('\n=== 直書きが残っていないか ===');
const turn = grabFunction(src, 'sumoTurn'), fin = grabFunction(src, 'sumoFinish'), start = grabFunction(src, 'startSumo'), dmg = grabFunction(src, 'sumoCalcDamage');
ok(!/SUMO_TECHNIQUES\[/.test(turn) && /_techList\(\)/.test(turn), 'sumoTurn は _techList() を使う');
ok(!/SUMO_TECH_POWER\[/.test(dmg) && /_techPower\(\)/.test(dmg), 'sumoCalcDamage は _techPower() を使う');
ok(!/空振り！/.test(turn) && !/会心の一撃/.test(turn) && !/金星/.test(turn), 'sumoTurn に相撲の直書きが無い');
ok(!/はっけよい/.test(start), 'startSumo に「はっけよい」の直書きが無い');
ok(!/'勝負あり！'/.test(fin), 'sumoFinish に「勝負あり！」の直書きが無い');

console.log('\n=== 画面の id と差し替え関数 ===');
['sumo-title','sumo-east-label','sumo-west-label','sumo-start-btn','sumo-badge'].forEach(id => ok(new RegExp('id="' + id + '"').test(src), 'id ' + id + ' がある'));
ok(/function _applySumoWords/.test(src), '_applySumoWords がある');
ok(/_applySumoWords\(\)/.test(grabFunction(src, 'applyKurosawaMode')), 'applyKurosawaMode が _applySumoWords を呼ぶ');
ok.done();
```

- [ ] **Step 2: 失敗を確認**

Run: `node tests/kurosawa/test-duel.js`
Expected: `定数が見つからない: KZ_TECHNIQUES` で例外終了

- [ ] **Step 3: テーブル・言葉・切替関数を追加**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()
old = """  const SUMO_TECH_POWER = {
    'おしだし': 1.0, 'つきだし': 1.1, 'よりきり': 1.0,
    'うわてなげ': 1.3, 'したてなげ': 1.3,
    'はたきこみ': 0.7, 'つきおとし': 0.8,
    'すくいなげ': 1.4, 'うっちゃり': 1.6, 'つりだし': 1.2
  };"""
new = old + """

  // ===== KUROSAWA mode：斬り合いの読み替え（2026-09-04）=====
  // 対戦の仕組みは相撲のまま。技名と画面の言葉だけ武士に置き換える。
  // 相撲の技と「同じ添字＝同じ倍率」にしてあるので、勝率のバランスは変わらない。
  const KZ_TECHNIQUES = [
    '袈裟斬り','突き','逆袈裟','唐竹割り','胴払い',
    '受け流し','小手打ち','抜刀術','一閃','燕返し'
  ];
  const KZ_TECH_POWER = {
    '袈裟斬り': 1.0, '突き': 1.1, '逆袈裟': 1.0,
    '唐竹割り': 1.3, '胴払い': 1.3,
    '受け流し': 0.7, '小手打ち': 0.8,
    '抜刀術': 1.4, '一閃': 1.6, '燕返し': 1.2
  };
  const SUMO_WORDS = { title:'🏟️ 大相撲 SUMO',    east:'東 力士', west:'西 力士', start:'⚔️ はっけよい！',   referee:'行司「はっけよい、のこった！」', miss:'空振り！',   crit:'⚡会心の一撃！', upset:'✨金星なるか！', end:'勝負あり！', badge:'SUMO' };
  const KZ_WORDS   = { title:'🎬 決闘 KUROSAWA', east:'東 武士', west:'西 武士', start:'⚔️ いざ尋常に！', referee:'「いざ尋常に、勝負！」',           miss:'空を斬る！', crit:'⚡一刀両断！',   upset:'✨下剋上！',     end:'勝負あり！', badge:'KUROSAWA' };
  function _techList()  { return (typeof isKurosawa === 'function' && isKurosawa()) ? KZ_TECHNIQUES : SUMO_TECHNIQUES; }
  function _techPower() { return (typeof isKurosawa === 'function' && isKurosawa()) ? KZ_TECH_POWER  : SUMO_TECH_POWER; }
  function _words()     { return (typeof isKurosawa === 'function' && isKurosawa()) ? KZ_WORDS       : SUMO_WORDS; }"""
assert s.count(old)==1, 'SUMO_TECH_POWER の目印が1つに定まらない'
s = s.replace(old, new)
open(p,'w',encoding='utf-8').write(s); print('テーブル追加')
PY
```

- [ ] **Step 4: 対戦ロジックの直書きを置換（6か所）**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()
reps = [
  # sumoCalcDamage
  ("    dmg *= (SUMO_TECH_POWER[technique] || 1.0);", "    dmg *= (_techPower()[technique] || 1.0);"),
  # sumoTurn：技の選択（先手・後手）
  ("    const tech1 = SUMO_TECHNIQUES[Math.floor(Math.random() * SUMO_TECHNIQUES.length)];", "    const tech1 = _techList()[Math.floor(Math.random() * _techList().length)];"),
  ("      const tech2 = SUMO_TECHNIQUES[Math.floor(Math.random() * SUMO_TECHNIQUES.length)];", "      const tech2 = _techList()[Math.floor(Math.random() * _techList().length)];"),
  # sumoTurn：空振り
  ('<strong>${tech1}</strong>... <span style="color:#888;">空振り！</span>', '<strong>${tech1}</strong>... <span style="color:#888;">${_words().miss}</span>'),
  # sumoTurn：会心・金星（先手と後手で2回ずつ出てくる）
  ('<span style="color:#e67e22;font-weight:bold;">⚡会心の一撃！</span>', '<span style="color:#e67e22;font-weight:bold;">${_words().crit}</span>'),
  ('<span style="color:#9b59b6;font-weight:bold;">✨金星なるか！</span>', '<span style="color:#9b59b6;font-weight:bold;">${_words().upset}</span>'),
  # startSumo：行司
  ('addSumoLog(`<span style="color:#888;">行司「はっけよい、のこった！」</span>`);', 'addSumoLog(`<span style="color:#888;">${_words().referee}</span>`);'),
  # sumoFinish：結果
  ("textContent = technique ? `${technique}！` : '勝負あり！';", "textContent = technique ? `${technique}！` : _words().end;"),
]
for old, new in reps:
    c = s.count(old)
    assert c >= 1, '見つからない: ' + old[:50]
    s = s.replace(old, new)
    print('%d件: %s' % (c, old[:40]))
open(p,'w',encoding='utf-8').write(s)
PY
```
Expected の出力: 上から `1件,1件,1件,1件,2件,2件,1件,1件`（会心・金星は先手用と後手用で2件ずつ）

- [ ] **Step 5: SUMOタブの HTML に id を付け、差し替え関数を追加**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='index.html'; s=open(p,encoding='utf-8').read()
reps = [
  ('<div style="font-size:21px;font-weight:bold;letter-spacing:4px;">🏟️ 大相撲 SUMO</div>',
   '<div id="sumo-title" style="font-size:21px;font-weight:bold;letter-spacing:4px;">🏟️ 大相撲 SUMO</div>'),
  ('<div style="font-size:10px;color:#888;">東 力士</div>', '<div id="sumo-east-label" style="font-size:10px;color:#888;">東 力士</div>'),
  ('<div style="font-size:10px;color:#888;">西 力士</div>', '<div id="sumo-west-label" style="font-size:10px;color:#888;">西 力士</div>'),
  ('<button onclick="startSumo()" style="font-family:\'DotGothic16\',monospace;font-size:14px;background:#e67e22;',
   '<button id="sumo-start-btn" onclick="startSumo()" style="font-family:\'DotGothic16\',monospace;font-size:14px;background:#e67e22;'),
  ('font-family:Helvetica,Arial,sans-serif;font-weight:bold;">SUMO<span style="color:#f1c40f;">19',
   'font-family:Helvetica,Arial,sans-serif;font-weight:bold;"><span id="sumo-badge">SUMO</span><span style="color:#f1c40f;">19'),
]
for old, new in reps:
    assert s.count(old)==1, '目印が1つに定まらない: ' + old[:50]
    s = s.replace(old, new)

anchor = "  function makeSumoAvatar(fighter) {"
block = """  // SUMOタブの見出し・東西・開始ボタン・バッジをモードに合わせて差し替える（applyKurosawaMode から呼ばれる）
  function _applySumoWords() {
    const w = _words();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sumo-title', w.title); set('sumo-east-label', w.east); set('sumo-west-label', w.west);
    set('sumo-start-btn', w.start); set('sumo-badge', w.badge);
  }

""" + anchor
assert s.count(anchor)==1
s = s.replace(anchor, block)
open(p,'w',encoding='utf-8').write(s); print('id と _applySumoWords を追加')
PY
```

- [ ] **Step 6: テストが通ることを確認**

Run: `node tests/kurosawa/test-duel.js`
Expected: すべて ✅

- [ ] **Step 7: 構文チェック**（Task 1 Step 6 と同じ）
Expected: `構文OK`

- [ ] **Step 8: 全テストと既存の回帰を通す**

Run: `tests/kurosawa/run.sh`
Expected: `ALL PASS`

- [ ] **Step 9: Commit**

メッセージ: `feat(KUROSAWA mode): 相撲を斬り合いに読み替える（仕組みは相撲のまま）`

- [ ] **Step 10: 実機確認（本人）**

⌘+Shift+R → KUROSAWA を ON → SUMOタブ：
- 見出しが「🎬 決闘 KUROSAWA」、東西が「武士」、ボタンが「いざ尋常に！」、右上バッジが「KUROSAWA」
- 対戦すると技名が袈裟斬り・一閃などになる。「空を斬る！」「一刀両断！」「下剋上！」
- 対戦中に OFF/ON しても落ちない（そのターンだけ古い表記でよい）
- OFF に戻すと全部相撲に戻る

---

### Task 6: 仕上げ（CLAUDE.md 追記）

**Files:**
- Modify: `CLAUDE.md` — 「主な機能・タブ構成」の「その他主要画面」の末尾

- [ ] **Step 1: 追記**

```bash
cd /Users/shiromashin/Desktop/claudecode/sat/案件管理アプリ && python3 - <<'PY'
p='CLAUDE.md'; s=open(p,encoding='utf-8').read()
anchor = "- ⚠️ `tab-2 スケジュール` はナビに項目が無い孤立タブ（ホームカレンダーと重複・整理候補 2026-07-11）\n"
add = anchor + """- **🎬 KUROSAWA mode（2026-09-04）**：上部バーのボタンで見た目だけ黒澤映画風に。白黒は最前面の膜 `#kz-overlay` に `backdrop-filter`（祖先に filter を付けると fixed 画面がずれるため膜方式）。川崎のドット絵は `_charPalette()` 経由で `hat:'samurai'` に。SUMOは `_techList/_techPower/_words` でテーブルを切り替えるだけ（倍率同じ）。状態は `kurosawa_mode`（端末ごと・同期しない）。印刷は別ウィンドウなので影響なし。設計: `docs/superpowers/specs/2026-09-04-kurosawa-mode-design.md`
"""
assert s.count(anchor)==1
open(p,'w',encoding='utf-8').write(s.replace(anchor, add)); print('CLAUDE.md 追記')
PY
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md に KUROSAWA mode の要点を追記"
git push
```

---

## 自己レビュー（計画 vs 設計書）

- §1 モード切替 → Task 1（3関数・ボタン・保存・起動時）✅
- §2 白黒の膜 → Task 2（HTML・CSS・print）✅
- §3 ドット絵 → Task 3、差し替えの入口と描き直す5か所 → Task 4（makeSumoAvatar／スタッフ選択／ステータスカード／スタッフ詳細／漢たちタブ）✅
- §4 テーブル2組・言葉・置換・id・対戦中の切替 → Task 5 ✅（`_techPower()[t] || 1.0` で混在しても落ちない）
- §5 順番と実機確認の区切り → Task 2/4/5 の末尾に確認ステップ ✅
- §6 Node の確認項目 → 各テストに対応 ✅
- 名前の一貫性：`isKurosawa / applyKurosawaMode / toggleKurosawaMode / _charPalette / _refreshKurosawaAvatars / _techList / _techPower / _words / _applySumoWords` は Task 1 の `applyKurosawaMode` 内の呼び出し名と一致 ✅
- 設計書に無かった追加：`SUMO_WORDS.referee`（行司の実況が直書きだったため言葉テーブルに含めた）
