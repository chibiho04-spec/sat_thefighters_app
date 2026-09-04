# KUROSAWA mode 設計書

作成日: 2026-09-04
対象: `index.html`（案件管理アプリ本体）

## 目的

ボタンひとつでアプリの見た目を「黒澤映画」にする遊び機能。業務データには一切触れない。

1. 画面全体が白黒（フィルム調）になる
2. 川崎のドット絵が武士（浪人）になる
3. 相撲ミニゲームが武士の斬り合いになる

決定済み（ブラウザのモックアップで本人が選択）:
- 白黒の質感 = **フィルム調**（コントラスト強め＋粒子＋四隅の影）
- 武士のタイプ = **浪人**（ちょんまげ・着物・腰の刀）
- 斬り合い = **言葉と見た目の読み替えのみ**（対戦の仕組みは相撲のまま）
- 印刷・PDF = **カラーのまま**

## 触らないもの

同期（GAS/スプレッドシート）・売上・書類・スタッフの役職や名前のデータ。
KUROSAWA mode は表示だけで、localStorage に書くのは `kurosawa_mode` の1キーのみ。

## 1. モード切替

| 項目 | 内容 |
|---|---|
| ボタン | 上部バー（api-bar）の「データ管理」ボタンの左に `🎬 KUROSAWA`。押すたびに ON/OFF |
| 見た目 | OFF: 黒地に白文字の枠 ／ ON: 白地に黒文字（反転） |
| 保存先 | `localStorage['kurosawa_mode']` = `'1'` / `'0'`。**端末ごと**（同期しない） |
| 起動時 | 保存値を読んで `applyKurosawaMode()` を1回呼ぶ（`font_scale` と同じ位置） |
| 関数 | `isKurosawa()` / `toggleKurosawaMode()` / `applyKurosawaMode()` の3つ |

`applyKurosawaMode()` がやること（順番どおり）:
1. `<body>` に `kurosawa` クラスを付ける／外す
2. ボタンの見た目を更新
3. アバターを描き直す（§3）
4. SUMOタブの文言を描き直す（§4）

## 2. 白黒（フィルム調）

CSS のみ。インライン色（約1,350か所）は触らない。

**方式：画面の一番上に透明な膜を1枚かぶせ、`backdrop-filter` で「膜の後ろ」を白黒にする。**
`.phone-frame` や `body` に直接 `filter` をかける方式は採らない。祖先に `filter` が付くと、その中の
`position:fixed` の画面（受注番号の変更・重複の整理・各種ダイアログ）の位置基準がその祖先に変わり、
配置がずれる副作用があるため。膜方式なら DOM の配置に一切影響しない。

```html
<!-- body 直下・phone-frame の外。常時置いておき、モードONのときだけ表示 -->
<div id="kz-overlay" aria-hidden="true"></div>
```

```css
#kz-overlay { display: none; }
body.kurosawa #kz-overlay {
  display: block;
  position: fixed; inset: 0;
  z-index: 2147483000;              /* ダイアログ(〜100000)より上＝全部が膜の後ろに入る */
  pointer-events: none;             /* タップ・スクロールを邪魔しない */
  -webkit-backdrop-filter: grayscale(1) contrast(1.25) brightness(1.02);
          backdrop-filter: grayscale(1) contrast(1.25) brightness(1.02);
  background:
    radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%),   /* 四隅の影 */
    url("data:image/svg+xml,...feTurbulence...");                                     /* 粒子 */
  mix-blend-mode: multiply;
  opacity: .55;                     /* ← 粒子と影の強さ。実機で見て弱めるならここ1か所 */
}
@media print { #kz-overlay { display: none !important; } }
```

- `-webkit-` 付きも書く（iPhone の Safari 用）
- 後から `document.body` に追加されるダイアログ（受注番号の変更の入力欄・競合の確認など）も
  z-index が膜より低いので白黒になる
- 印刷・PDF は `window.open` で別ウィンドウに生成しているため元々影響を受けない。上の `@media print` は保険

## 3. 川崎会長の武士（浪人）

**対象はホーム画面上部を歩く「川崎会長」**（`.character` — CSS の四角で組んだキャラ）。
スタッフ一覧・SUMO・ステータスカードの16×16ドット絵は**変えない**（2026-09-04 本人確認で修正。
先に作ったスタッフ一覧側の差し替えは取り消した: 362bc72）。

方式：`body.kurosawa` のときだけ CSS で部品を足す。JS は使わない。

| 部品 | CSS |
|---|---|
| ちょんまげ | `.character::before`（頭の上に小さな束＋左右へ広げた髪） |
| 髪 | `.char-head::before` を月代風に少し高く |
| 着物 | `.char-body` を暗い色に。帯は `border-bottom`、襟は `::after` を細い白に |
| 袴 | `.char-leg` を暗い色に |
| 刀 | `.character::after` を右腰に斜めで置き、`box-shadow` で柄を下にずらして描く |

`.character` に既存の `::before` / `::after` が無いことを確認して使った。通常時は何も変わらない。

## 4. 斬り合い（読み替え）

### テーブルを2組にする

```js
const SUMO_TECHNIQUES = [...];       // 既存（相撲）
const SUMO_TECH_POWER = {...};       // 既存（相撲）
const KZ_TECHNIQUES = [ '袈裟斬り','突き','逆袈裟','唐竹割り','胴払い','受け流し','小手打ち','抜刀術','一閃','燕返し' ];
const KZ_TECH_POWER = { '袈裟斬り':1.0,'突き':1.1,'逆袈裟':1.0,'唐竹割り':1.3,'胴払い':1.3,'受け流し':0.7,'小手打ち':0.8,'抜刀術':1.4,'一閃':1.6,'燕返し':1.2 };
function _techList()  { return isKurosawa() ? KZ_TECHNIQUES : SUMO_TECHNIQUES; }
function _techPower() { return isKurosawa() ? KZ_TECH_POWER  : SUMO_TECH_POWER; }
```

相撲→斬り合いの対応は**同じ添字＝同じ倍率**。勝率のバランスは変わらない。

| 相撲 | 倍率 | 斬り合い |
|---|---|---|
| おしだし | 1.0 | 袈裟斬り |
| つきだし | 1.1 | 突き |
| よりきり | 1.0 | 逆袈裟 |
| うわてなげ | 1.3 | 唐竹割り |
| したてなげ | 1.3 | 胴払い |
| はたきこみ | 0.7 | 受け流し |
| つきおとし | 0.8 | 小手打ち |
| すくいなげ | 1.4 | 抜刀術 |
| うっちゃり | 1.6 | 一閃 |
| つりだし | 1.2 | 燕返し |

### 画面の言葉

```js
const SUMO_WORDS = { title:'🏟️ 大相撲 SUMO', east:'東 力士', west:'西 力士', start:'⚔️ はっけよい！', miss:'空振り！', crit:'会心の一撃！', upset:'金星！', end:'勝負あり！', badge:'SUMO' };
const KZ_WORDS   = { title:'🎬 決闘 KUROSAWA', east:'東 武士', west:'西 武士', start:'⚔️ いざ尋常に！', miss:'空を斬る！', crit:'一刀両断！', upset:'下剋上！', end:'勝負あり！', badge:'KUROSAWA' };
function _words() { return isKurosawa() ? KZ_WORDS : SUMO_WORDS; }
```

`sumoTurn` / `sumoFinish` / `startSumo` の直書き文字列を `_words().xxx` に置換。
SUMOタブのタイトル・東西ラベル・開始ボタン・バッジは `id` を付けて `applyKurosawaMode()` から差し替える。

### 対戦中の切り替え

対戦中にモードを変えても落ちない。進行中のターンの技名はそのターンだけ古い表記で出てよい（次のターンから新しい表記）。`sumoCalcDamage` は `_techPower()[technique] || 1.0` なので、表記が混ざっても倍率が取れなければ 1.0 で動く。

## 5. 作る順番

1. **モード切替＋白黒**（§1・§2）→ コミット・push → 実機確認
2. **川崎の武士**（§3）→ コミット・push → 実機確認
3. **斬り合い**（§4）→ コミット・push → 実機確認

各段階で JS 構文チェック・Node テスト・回帰（既存テスト）を通す。

## 6. 確認方法

Node（自動）:
- `KZ_TECHNIQUES` が10件、`KZ_TECH_POWER` の倍率が相撲側と添字ごとに一致
- `_charPalette`: モードON＋川崎 → `hat:'samurai'`、それ以外 → 元のパレットそのまま（参照が同じ）
- `makePixelChar({hat:'samurai'})` が SVG を返し、刀・ちょんまげの矩形を含む
- モードOFFで `<body>` からクラスが消え、テーブルと言葉が相撲側に戻る
- `kurosawa_mode` の保存値が `'1'`/`'0'` 以外でも落ちず OFF 扱い

実機（本人）:
- 白黒の読みやすさ（スマホ幅／文字サイズ150%）。粒子が強ければ opacity を下げる
- 漢たちタブ・ログイン選択・ステータスカード・SUMO で川崎だけ武士になっている
- 印刷・PDF がカラーのまま
- SUMOタブの文言と技名が切り替わる。対戦中に切り替えても落ちない

## 補足

- 本人は「川崎会長」と呼んだが、スタッフマスタの雇用は「社長」。この機能では役職データを触らない。変えるなら漢たちタブの編集画面から本人が行う
- モードは端末ごとの好みなので同期対象にしない。全端末で共有したくなったら `config` kind に載せる（今回は対象外）
