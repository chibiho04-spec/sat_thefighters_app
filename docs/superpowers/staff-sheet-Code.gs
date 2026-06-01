/**
 * スタッフ（漢たち）同期用 Google Apps Script
 * Sat the Fighters アプリ用。請求書シートと同じ「1人1行・JSON丸ごと」方式。
 *
 * ■ シートの列（1行目を見出しにする）
 *   A: キー    （kawasaki / uehara / ... のローマ字キー。アプリが送る固定値）
 *   B: データ  （スタッフ情報の JSON 文字列。アプリがまるごと入れる）
 *   C: 更新日時（ISO文字列。新しい方を採用＝後勝ち）
 *   D: 削除フラグ（スタッフは10名固定なので基本は空。将来用に列だけ用意）
 *
 * ■ 使い方
 *   1. スタッフ用のスプレッドシートを新規作成（1枚目のシートでOK）。
 *   2. 1行目に「キー」「データ」「更新日時」「削除フラグ」と入力。
 *   3. 拡張機能 → Apps Script を開き、このコードを丸ごと貼り付け。
 *   4. SYNC_SECRET を、アプリに入れる合言葉と完全一致させる（他シートと同じ合言葉でOK）。
 *   5. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *      → URL をコピーし、アプリの「設定 → スタッフ Web App URL」に貼る。
 */

// ===== 合言葉チェック（他の8シートと同じ値にする）=====
var SYNC_SECRET = 'ここに合言葉';  // ← アプリに入れる合言葉と「完全一致」させる

function _syncAuthOK(e) {
  var t = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  return t === SYNC_SECRET;
}
function _syncDeny() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
    .setMimeType(ContentService.MimeType.JSON);
}

var HEADERS = ['キー', 'データ', '更新日時', '削除フラグ'];

function _sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function _ensureHeaders(sh) {
  var firstRow = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var empty = firstRow.every(function (v) { return v === '' || v == null; });
  if (empty) sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 取り込み（GET ?action=list）：全行を {キー,データ,更新日時,削除フラグ} の配列で返す
function doGet(e) {
  if (!_syncAuthOK(e)) return _syncDeny();
  try {
    var sh = _sheet();
    _ensureHeaders(sh);
    var last = sh.getLastRow();
    var rows = [];
    if (last >= 2) {
      var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
      values.forEach(function (r) {
        var key = String(r[0] || '').trim();
        if (!key) return;
        rows.push({ 'キー': key, 'データ': r[1], '更新日時': r[2], '削除フラグ': r[3] });
      });
    }
    return _json({ ok: true, rows: rows });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// 送信（POST {action:'upsert', rows:[...]}）：キー一致行を更新、無ければ追加
// ★ LockService で1件ずつ順番に処理する（同時実行による重複行を防ぐ）
function doPost(e) {
  if (!_syncAuthOK(e)) return _syncDeny();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 最大30秒、他の処理が終わるのを待つ
  } catch (lockErr) {
    return _json({ ok: false, error: 'busy' }); // アプリ側は失敗→再送キューに積む
  }
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action || 'upsert';
    if (action !== 'upsert') return _json({ ok: false, error: 'unknown action: ' + action });

    var sh = _sheet();
    _ensureHeaders(sh);
    var rows = body.rows || [];

    // 既存キー→行番号（重複キーがあれば最初の行を採用し、残りは掃除対象）
    var last = sh.getLastRow();
    var keyToRow = {};
    var dupRows = [];
    if (last >= 2) {
      var keys = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) {
        var k = String(keys[i][0] || '').trim();
        if (!k) continue;
        if (keyToRow[k]) dupRows.push(i + 2); // すでに見たキー＝重複行
        else keyToRow[k] = i + 2;
      }
    }

    var updated = 0, added = 0;
    rows.forEach(function (row) {
      var key = String(row['キー'] || '').trim();
      if (!key) return;
      var out = [key, row['データ'] || '', row['更新日時'] || '', row['削除フラグ'] || ''];
      if (keyToRow[key]) {
        sh.getRange(keyToRow[key], 1, 1, HEADERS.length).setValues([out]);
        updated++;
      } else {
        sh.appendRow(out);
        keyToRow[key] = sh.getLastRow();
        added++;
      }
    });

    // 重複行を下から削除（行番号がずれないよう降順）
    dupRows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });

    return _json({ ok: true, updated: updated, added: added, removedDup: dupRows.length });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 手動で重複キーを掃除する（エディタから1回だけ実行してもOK）
// 同じキーが複数あったら、更新日時が新しい1行だけ残して他を削除。
function cleanupDuplicates() {
  var sh = _sheet();
  var last = sh.getLastRow();
  if (last < 2) return;
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var best = {};   // key -> {row, upd}
  var deleteRows = [];
  for (var i = 0; i < values.length; i++) {
    var rowNum = i + 2;
    var key = String(values[i][0] || '').trim();
    if (!key) { deleteRows.push(rowNum); continue; }
    var upd = String(values[i][2] || '');
    if (!best[key]) {
      best[key] = { row: rowNum, upd: upd };
    } else if (upd > best[key].upd) {
      deleteRows.push(best[key].row); // 古い方を消す
      best[key] = { row: rowNum, upd: upd };
    } else {
      deleteRows.push(rowNum);        // こちらが古い
    }
  }
  deleteRows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  Logger.log('削除した重複/空行: ' + deleteRows.length);
}
