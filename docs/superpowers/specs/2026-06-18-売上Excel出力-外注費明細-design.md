# 売上表エクスポート：Excel整形出力＋外注費明細 設計仕様

作成日：2026-06-18 / 対象：`案件管理アプリ/index.html`（単一HTMLファイル）

## 1. 目的・背景
売上画面からダウンロードする表について2点を改善する。
1. **外注費の明細表示**：現状は1案件＝1行で外注費が合計値1つだけ。これを外注先ごとの行＋消費税行に展開する（添付参考画像の右側「外注先／外注費」のイメージ）。
2. **Excelで整形表示**：現状はCSV。Numbersでは問題ないが、Excelでは列幅が狭く罫線も無く見づらい。CSVは仕様上、列幅・罫線・書式を持てないため、**罫線・列幅・見出し色つきのExcel整形ファイル(.xls)** に出力形式を変更する。

## 2. 決定事項（ユーザー確認済み 2026-06-18）
- **明細化の範囲**：**外注費だけ**明細化する。左側の案件情報（受注No〜合計・売り上げ・ステータス）は1案件1行のまま（複数行にセル結合）。売上側（受注金額）は明細化しない。
- **ファイル形式**：**HTML表をMIME `application/vnd.ms-excel` の `.xls` として出力**（外部ライブラリ不要・オフライン動作可）。Excel・Numbers両方で開ける。
- **金額セルの表示**：Excel上で **￥形式**（`¥1,234`）で表示。数値型を保持し `mso-number-format` で書式付け（Numbersでは数値そのまま表示）。
- **Excelの「形式と拡張子が一致しません」警告**：HTML表を.xlsで開く方式の宿命として開く瞬間に1回出る。「はい」で正常に開ける。ユーザー了承済み。
- **ボタン名**：実態に合わせ「📥 CSV」→「📥 Excel」に変更（ヘッダー右上・月別見出しの両方）。

## 3. データ源と「金額の正」（読み取り専用・計算式は不変）
外注費の合計値は**既存の計算式（`_calcCaseSales` の `outsourceCost`）をそのまま使う**。明細はその内訳として並べるだけで、合計は1円も変えない（CLAUDE.md「💴金額計算の正」を厳守）。

### 外注先の取得元（4種すべて拾う・課税/非課税の扱いは既存ロジックと完全一致）
1. **WS外注リスト** `loadOutsourceItems(loadWS(num))` = `[{name, cost, taxable}]`。`taxable !== false` を課税（旧データ=課税）。
2. **WSレンタル** `loadWS(num)['wsd-rental-cost']`（数値）。名前は「機材（リース）」。課税。
3. **請求書明細の「外注」チェック行** `lines.filter(l=>l.outsource)`。`name`、`cost = qty×price`、`taxable !== false` を課税。
4. **請求書の外注費リスト** `status.outsourceExtraList` = `[{name, cost(税込), taxable}]`。**`taxable === true` のときだけ課税**（既定/旧データ=非課税）。配列が無く旧 `status.outsourceExtra`（単一数値）があれば名前「外注費」・非課税。

### 内訳と合計の関係（必ず一致すること）
- `osTaxableBase` = 課税対象アイテムの税抜合計、`osExemptSum` = 非課税アイテムの合計。
- **消費税行** = `Math.round(osTaxableBase × 1.1) − osTaxableBase`（`osTaxableBase > 0` のときだけ行を出す）。
- 表示する各行の金額合計（課税アイテム + 非課税アイテム + 消費税行）= `Math.round(osTaxableBase × 1.1) + osExemptSum` = 既存 `outsourceCost`。
- **防御**：万一、明細合計 ≠ 既存 `outsourceCost` の場合は、明細を出さず「外注費」1行＝既存 `outsourceCost` にフォールバック（数字を絶対にずらさない）。

## 4. 出力テーブル構成
列（左→右）：`受注No｜日付｜取引先｜件名｜税抜額｜消費税｜合計｜外注先｜外注費｜売り上げ｜ステータス`
- 案件レベル列（受注No・日付・取引先・件名・税抜額・消費税・合計・売り上げ・ステータス）は、その案件の外注明細行数 `N`（最低1）ぶん `rowspan=N` で縦結合。
- 外注先／外注費は明細行ぶん（外注先ごと＋消費税行）。外注が無い案件は `N=1`、外注先・外注費は空欄。
- **合計行**（最下部）：`合計（請求金額 − 外注費 ＝ 売上）` と、合計・外注費・売り上げの総和。集計対象は現状CSVと同じ（`filtered` 全件の `total` / `outsourceCost` / `total−outsourceCost`）。
- 金額列（税抜額・消費税・合計・外注費・売り上げ・合計行の数値）：数値型＋`mso-number-format:"\\¥#\\,##0;\\-\\¥#\\,##0"`、右寄せ。

## 5. ファイル生成（HTML表 .xls）
- 文字列：`<html xmlns:o xmlns:x xmlns><head><meta charset=UTF-8><!--[if gte mso 9]><xml>…ExcelWorksheet…</xml><![endif]--><style>table{border-collapse:collapse}td,th{border:.5pt solid #000;padding:2px 5px;font-size:11pt;font-family:'游ゴシック',sans-serif} th{background:#dfe7ef;font-weight:bold} .num{mso-number-format:"\\¥#\\,##0;\\-\\¥#\\,##0";text-align:right}</style></head><body><table>…</table></body></html>`
- 列幅：`<col>` の `width`（Excelポイント換算）または各セル幅で指定。件名は広め、数値列は中程度。
- すべてのセルテキストは `escapeHtml()` を通す（件名・取引先・外注先名など）。
- **BOM**（`﻿`）を先頭に付与し、`new Blob([bom + html], {type:'application/vnd.ms-excel'})`。
- ファイル名：`売上表_${fileSuffix}_${YYYY-MM-DD}.xls`。
- `exportSalesCSV()`（現フィルタ）と `exportSalesCSVForMonth(monthKey)`（月別）は**共通関数 `_writeSalesExcel(filtered, fileSuffix)` を呼ぶ**ように差し替え（現 `_writeSalesCSV` を置換）。両ボタンが同じ.xlsを出す。

## 6. 影響範囲（他機能を壊さない）
- 変更は**出力関数まわりに限定**：`_writeSalesCSV`→`_writeSalesExcel` 置換、外注明細を返すヘルパー追加、`_collectSalesItems`/`_calcCaseSales` に**外注明細リスト（`outsourceItems`）を追加返却**（既存フィールドは不変・非破壊）、2つのボタンの `onclick`/ラベル。
- 売上画面の**画面表示・部門別売上・金額計算**は一切変更しない（`outsourceCost`/`total`/`netInhouse` の値も式も不変）。
- localStorage・同期への書き込みは無し（読み取り専用）。
- ボタンラベル変更（📥Excel）は売上ヘッダーと月別見出しの2か所のみ。

## 7. テスト計画（実装後）
- `node --check` 相当（script抽出構文チェック）。
- ブラウザ実機（同期OFF `window._gasUrlOne=()=>''`・本番シート保護）：
  1. **金額一致**：全案件で「明細行の合計（課税＋非課税＋消費税行）＝ 既存 outsourceCost」を検証（不一致0件であること）。合計行 = filtered の total/outsource/net と一致。
  2. 外注先4種の取得：WS外注・レンタル・請求書外注行・請求書外注費リストが正しく行になる（名前・金額・課税区分）。
  3. 外注ゼロの案件：N=1で空欄、左列のrowspanが正しい。
  4. 生成HTMLをブラウザで描画し、罫線・列幅・rowspan結合・見出し色・右寄せが崩れていないこと。
  5. ダウンロードして **Excelで開く**（警告→はい→￥書式・罫線・列幅）と **Numbersで開く**（数値表示・崩れなし）をユーザー確認。
  6. ヘッダー📥／月別📥の両方が同じ.xlsを出す。月別は当該月のみ。
  7. ボタンラベル「📥 Excel」がスマホ390px/PC × 文字100%/150%で崩れない。
- デバッグ：金額一致・取得漏れ・HTML整形崩れ・他機能無影響を多観点レビュー＋裏取り。

## 8. やらないこと（YAGNI）
- 売上側（受注金額・発注先/取材名）の明細化はしない（外注費だけ）。
- 真の.xlsx（OOXML/zip）やSpreadsheetML(.xml)は採用しない（前者は外部ライブラリでオフライン破壊、後者はNumbers非対応）。
- 画面上の売上表の見た目変更・部門別の変更はしない。
- Numbers側での￥書式強制はしない（Excel向け要望のため）。
