# 部署(T/E/P)フィルター＋受付担当修正 — 設計スペック（第1弾）

2026-07-11 / 編集スタッフ要望より。ユーザー承認済み。

## 目的
編集スタッフが「自分の部署(E)の案件だけ」を素早く見られるように、ホーム・カレンダー・受注ノートを部署(T/E/P)で絞り込めるようにする。

## 部署の定義
受注番号の頭文字 **T=技術 / E=編集 / P=制作**（既存 `_deptFromPrefix`／色は `_onPrefixColor` T青=#2980b9 / E緑=#27ae60 / P紫=#8e44ad）。頭文字が T/E/P 以外の案件（旧番号等）は**常に表示**（絞り込みで消えない）。

## 共有フィルター状態
- localStorage キー `dept_filter`（例 `{"T":true,"E":true,"P":true}`）。初期＝全部ON。端末ごとに記憶。
- ヘルパー：`getDeptFilter()` / `toggleDept(p)` / `deptPass(num)`（頭文字がT/E/Pなら該当ONのみ通す。非T/E/Pは常にtrue）。
- 変更時：ホームが開いていれば `renderHomeCal()`＋`sortWsCardsByDate()`、受注ノートが開いていれば `renderOrderNoteList()` を再描画。
- 共通トグルUI `renderDeptToggle(containerId)`：T/E/Pの3ボタン。ON＝部署色、OFF＝グレー。

## A. ホーム上部
カレンダーの直前に「部署で絞る：[T][E][P]」バーを配置。

## B. カレンダー（renderHomeCal / getEventsForDate）
- `deptPass(ev.num)` を通る案件だけ表示。
- チップ色を `_onPrefixColor(ev.num)`（部署色）に。
- **自分が参加している案件**（`isUserInEvent`）は追加で**白枠**（border）で強調。

## C. 進行状況カード（sortWsCardsByDate）
- 撮影予定・請求処理中とも `deptPass(data-wsnum)` で絞り込み（不合格は display:none）。
- **請求処理中は月見出しで区切り＋タップで開閉**（アコーディオン）。月＝案件の日程(撮影日)基準。既定は最新月だけ開く。

## D. 受注ノート（renderOrderNoteList）
- 画面上部に共通トグル `renderDeptToggle` を置き、`dept_filter` を共有。
- `rows` 生成後に `deptPass(num)` で絞り込み（検索・ソートと共存）。

## E. 受付担当（修正依頼）
- 新規案件パネルの受付担当ボタンを **`CREW_NAMES`（10名）から動的生成**。抜けていた森田・上地・松田を含む。今後の増員に自動追従。

## 非対象（第2弾）
- 各項目の選択肢を「＋ボタンでユーザー追加」（別機能・全端末共有の設計が必要）。

## 検証
JS構文チェック／各画面の絞り込み・色・開閉を確認／localStorage `dept_filter` の記憶。UI表示変更のため実機目視はユーザーに依頼（スマホ幅・文字サイズ150%含む）。
