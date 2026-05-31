# Googleスプレッドシート同期（全社データ共有）— 設計ドキュメント

作成日: 2026-05-31
対象アプリ: Sat the Fighters（案件管理アプリ / 単一HTML構成 `index.html`）
デプロイ: GitHub Pages（`https://chibiho04-spec.github.io/sat_thefighters_app/`）

## 背景・目的

現在データは各ブラウザの localStorage にのみ保存され、共有バックエンドが無い。
URLを社員に配っても**各自バラバラのデータ**になり、社長が全社の売上・部門別を見られない。
そこで **Google Apps Script + 専用Googleスプレッドシート** を共有バックエンドにして、
全社で同じ案件・機材・請求書を共有できるようにする。

## スコープ

- 対象：**全業務データの共有**（案件＝ワークシート/請求書、機材マスタ）。
- 同期対象外：**ログイン状態**（`last_login_name` / `last_login_time`）は端末ごと＝同期しない。
  各自が自分の名前でログインする運用は維持。
- 静的データ（`USERS` / `USER_STAFF` のJS定数、スタッフタブの静的HTML）はコード側にあり同期不要。
- リアルタイム同期は非対象（ハイブリッド方式で十分）。

## 反映タイミング（ハイブリッド）

- **起動時（ログイン直後）に取り込み**（GET → マージ → 索引再構築 → 再描画）。
- **保存時に自動送信**（変更レコードのみ POST、数秒デバウンス、裏で実行しUIを止めない）。
- **手動同期ボタン**（「今すぐ同期」＝送信＋取り込み）を保険として用意。

## アーキテクチャ

```
各社員のブラウザ（GitHub Pages のアプリ index.html）
        ⇅ HTTPS（GET=取り込み / POST=送信、Content-Type: text/plain でCORSプリフライト回避）
Google Apps Script Web App（オーナーのGoogleアカウント）
        ⇅ SpreadsheetApp
専用Googleスプレッドシート（"sync" シート＝共有の倉庫）
```

### スプレッドシート構造（汎用キー・バリュー方式）

当初CLAUDE.mdにあった「A〜T列の項目マッピング」は採用しない。
1行＝1レコードの汎用テーブルにし、案件・機材を同じ仕組みで扱う。

`sync` シート（1行目はヘッダ）:

| 列 | 名前 | 内容 |
|----|------|------|
| A | key | レコードキー（例 `project:T26041`, `equip:em001`） |
| B | value | 値のJSON文字列（削除レコードは空でも可） |
| C | updatedAt | 更新時刻（数値 epoch ミリ秒） |
| D | deleted | 削除フラグ（0 / 1） |

- スクリプトは key をユニークキーとして upsert（既存行があれば更新、無ければ追記）。

## レコードの単位（粒度）

- **案件：1案件＝1レコード `project:<num>`**。
  value の中身に件名・取引先・日付などのメタ、ワークシート(`ws_<num>`)、請求書(`inv_<num>`)を1つにまとめる:
  ```json
  {
    "num": "T26041",
    "meta": { "title": "...", "company": "...", "date": "2026/05/30", "... (projects_saved のその案件の項目)": "..." },
    "ws":   { "...ws_<num> の中身、無ければ null..." },
    "inv":  { "...inv_<num> の中身、無ければ null..." }
  }
  ```
- **機材：1点＝1レコード `equip:<id>`**（例 `equip:em001`）。value は機材マスタ配列の1要素。
- **案件一覧 `projects_saved` は同期しない**。取り込み後に、生存している `project:*` レコードの meta から**毎回組み立て直す**。
  → 「他人が案件を追加した直後に別端末が古い一覧で上書きして案件が消える」事故を構造的に防ぐ。
- `deleted_ws` / `deleted_inv` は同期キーとしては持たず、`project:*` レコードの `deleted=1` から整合させる
  （取り込み時に deleted な案件は localStorage から除去し、一覧にも出さない）。

## マージ（競合解決）

- ルール：**レコードごとに `updatedAt` が新しい方を採用**（last-writer-wins）。
- 単位が案件単位なので、**別々の案件の同時編集は衝突しない**。
- **同じ案件**をほぼ同時に保存した場合のみ、後勝ち（項目単位のマージはしない＝YAGNI）。
- 削除も `updatedAt` 比較対象：
  - 削除(`deleted=1, updatedAt=t1`) vs 編集(`updatedAt=t2`)：t の新しい方が勝つ。
  - → 「削除したのに古い編集で復活」「編集したのに古い削除で消える」を両方防ぐ。

### マージ純粋関数（テスト対象）

```
_syncMergeRecords(localMap, remoteList) -> { merged, toPush }
  localMap : { key: {value, updatedAt, deleted} }   ローカル由来
  remoteList: [ {key, value, updatedAt, deleted}, ... ] リモート由来
  各 key について updatedAt 大きい方を merged に採用。
  ローカルの方が新しい（またはリモートに無い）ものは toPush に積む。
```

## データフロー詳細

### 起動時（取り込み）
1. `sync_url` 未設定なら同期オフで終了（従来どおりローカル動作）。
2. GET `sync_url?token=...&action=pull` → `[{key,value,updatedAt,deleted}, ...]`。
3. ローカルの全 `project:*` / `equip:*` レコードを `_buildLocalRecords()` で構築。
4. `_syncMergeRecords()` でマージ。
5. `_applyMergedToLocal(merged)`：
   - `project:<num>` → `ws_<num>` / `inv_<num>` を書き戻し（deleted は削除）。
   - `equip:*` → `equip_master` 配列を再構築。
   - 生存案件から `projects_saved` を組み立て直し。
6. `toPush` があれば送信（ローカルが新しい分をクラウドへ）。
7. 関連画面を再描画。

### 保存時（自動送信）
- フック対象：`saveProject` / `saveWS` / `saveInvStatus` / `saveEquipMaster` と各削除処理。
- 保存時に当該レコードへ `updatedAt = Date.now()` を付与し、`_queuePush(key)`。
- デバウンス（例 3秒）でまとめて POST `action=push`、body にレコード配列（`text/plain` JSON）。

### 手動
- 「今すぐ同期」＝ push（未送信） → pull → 再描画。
- 「全件アップロード（移行・初期化用）」＝ ローカル全レコードに現在時刻を付けて push（空の新バックエンドを満たす／引っ越し用）。

## エラー処理（止まらない設計）

- URL未設定：同期オフ。アプリは従来どおり動作。
- 送信失敗：`sync_pending`（キー集合）に積み、次の保存／起動／手動同期で再送。UIはブロックしない。
- 取り込み失敗：ローカルで起動、「オフライン」表示、後で再試行。
- 不正な応答（JSONでない等）：無視してローカル維持。
- 例外は握りつぶしてログのみ（同期不調でアプリ本体を壊さない）。
- ステータス表示：データ管理画面に「最終同期：◯◯」「未送信◯件」「オフライン」。

## セキュリティ（内部ツール相応）

- Web App URL に**合言葉（token）**クエリを付け、一致しないリクエストは拒否。
- 既知の制約として明記：**URLとトークンを知っていれば誰でも読み書き可能**な簡易方式。
  社内限定運用が前提。URL/トークンを外部に貼らない。
- データはオーナーのGoogleアカウント内に保存。後述のとおり会社アカウントへ移行可能。

## アカウント移行

- 方法1：スプレッドシート＆Apps Scriptの所有権を会社アカウントへ移譲。
- 方法2：会社アカウントで新スプレッドシート＋同じ `Code.gs` を用意→新URL発行→各端末のURL設定を貼り替え→1台で「全件アップロード」。
- 各端末がローカルに全データの控えを持つため、空の新バックエンドへ丸ごと移せる。

## UI（データ管理画面に追加）

- 「同期設定」セクション：Web App URL 入力／合言葉 入力／保存ボタン。
- ボタン：「今すぐ同期」「全件アップロード（移行用）」。
- ステータス：最終同期時刻／未送信件数／オフライン表示。
- localStorageキー追加（読み書き）：`sync_url`, `sync_token`, `sync_last`, `sync_pending`。

## Apps Script（`Code.gs`）の責務

- `doGet(e)`：token照合 → `sync` シート全行を `[{key,value,updatedAt,deleted}]` でJSON返却。
- `doPost(e)`：token照合 → body のレコード配列を key で upsert（updatedAt が新しければ更新）。
- ヘッダ行の自動初期化（無ければ作成）。
- `Content-Type: text/plain` 受け（CORSプリフライト回避）、返却は `ContentService` JSON。

## テスト方針

- **マージ・索引再構築は純粋関数**として実装し、ブラウザのコンソールで検証（部門別実装と同じ手法）。
  - 新しい方が勝つ／削除が効く／別案件は衝突しない／一覧が正しく組み立つ。
- Apps Script側はローカルサーバ（`python3 -m http.server`）＋実Web App URLで送受信を実機確認。
- 既存機能（案件・請求書・売上表・部門別）が同期オフ/オンどちらでも壊れないことを確認。
- JS構文チェック（インラインJS抽出 → `node --check`）。

## 対象ファイル

- `index.html`（アプリ側：同期モジュール、データ管理画面UI、既存保存/削除処理へのフック）。
- `docs/superpowers/` に配置：
  - `google-apps-script/Code.gs`（コピペ用のApps Scriptコード）。
  - `google-sheets-sync-setup.md`（初心者向けセットアップ手順書）。

## 実装上の制約・注意（CLAUDE.md 準拠）

- アプリ本体の編集対象は `index.html` 1ファイル（HTML/CSS/JSインライン）。
- localStorageキーの破壊的変更なし（既存キーはそのまま。`sync_*` を追加するのみ）。
- 既存グローバル関数名と衝突しない新規名（`_syncMergeRecords` / `pullFromCloud` / `pushRecords` / `uploadAllRecords` 等）。
- 既存保存処理にはフックを追加するのみで、同期オフ時の挙動は不変。
- 編集後は JS 構文チェック → 影響範囲確認 → ブラウザ実測。

## 成功基準

- 1台で入力した案件・機材・請求書が、他端末で起動時に反映される。
- 売上表・部門別売上が全社の入力を合算して表示される。
- 別々の案件を同時編集してもデータが消えない（案件単位マージ）。
- 削除が他端末に伝播し、復活しない。
- 同期オフ（URL未設定）でも従来どおり動作する。
- URLを貼り替えるだけでバックエンド（＝アカウント）を移行できる。
- ネット不調でもアプリが止まらない（未送信は後で再送）。

## 非対象（将来）

- リアルタイム同期、項目単位マージ、ユーザー別アクセス制御、機材ペイバック管理。
