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
  product: { tab: '商品',     key: '商品コード', headers: ['商品コード','商品名','単位','単価','カテゴリ','備考','更新日時','削除フラグ'] },
  media:   { tab: 'メディア', key: 'ID',         headers: ['ID','使用日','メディア種別','使用カード','使用者','現場名','受注No','BU確認','返却者','備考','更新日時','削除フラグ'] },
  equip:   { tab: '機材',     key: 'id',       headers: ['id','cat','name','code','qty','price','更新日時','削除フラグ'] },
  invoice: { tab: '請求書',   key: '受注No',   headers: ['受注No','データ','更新日時','削除フラグ'] },
  staff:   { tab: 'スタッフ', key: 'キー',     headers: ['キー','データ','更新日時','削除フラグ'] },
  simpleWS:{ tab: '簡易ワークシート', key: 'id', headers: ['id','データ','更新日時','削除フラグ'] }
};

function _authOK(e) {
  var t = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  return t === SYNC_SECRET;
}
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _kindCfg(kind) { return KINDS[kind] || null; }

// 更新日時を「実際の時刻(ms)」へ。ISO形式も旧 Date.toString 形式も解釈する。
// 末尾の "(日本標準時)" 等の括弧注記は除去（パーサ差対策）。
function _toMs(v) {
  var s = String(v == null ? '' : v).replace(/\s*\([^)]*\)\s*$/, '').replace(/^\s+|\s+$/g, '');
  if (!s) return -1;
  var t = Date.parse(s);
  return isNaN(t) ? -1 : t;
}

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

// "141:00" / "13:30" のような時:分表記を「時間（小数なし・四捨五入）」へ。
// 数値だけ来た場合（=日数換算等）はそのまま四捨五入する。
function _hmsToHours(v) {
  var s = String(v == null ? '' : v).replace(/^\s+|\s+$/g, '');
  if (!s) return null;
  var m = s.match(/^(\d+):(\d+)/);
  if (m) return Math.round(parseInt(m[1], 10) + parseInt(m[2], 10) / 60);
  var n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

// 1タブ分の表示値から「月間勤務時間」「月間普通残業時間」のラベル直下セルを探す。
function _scanSheetForWork(sh) {
  var disp;
  try { disp = sh.getDataRange().getDisplayValues(); } catch (e) { return { work: null, over: null }; }
  var work = null, over = null;
  for (var r = 0; r < disp.length; r++) {
    for (var c = 0; c < disp[r].length; c++) {
      var label = String(disp[r][c] || '').replace(/\s/g, '');
      if (!label) continue;
      if (work === null && label.indexOf('月間勤務時間') >= 0 && (r + 1) < disp.length) work = disp[r + 1][c];
      if (over === null && label.indexOf('月間普通残業時間') >= 0 && (r + 1) < disp.length) over = disp[r + 1][c];
    }
  }
  return { work: work, over: over };
}

// 作業日報スプレッドシート（別ファイル）を ID で開き、月間勤務時間・残業時間を読む。
// month（例: '2026_06'）が指定されればそのタブを優先。なければ全タブを走査する。
function _readWorklog(sid, month) {
  var ss;
  try { ss = SpreadsheetApp.openById(sid); }
  catch (err) { return { ok: false, error: 'open失敗: ' + String(err) }; }
  var found = { work: null, over: null };
  var usedSheet = '';
  // 1) 指定された月のタブ（例: 2026_06）を優先して読む
  if (month) {
    var target = ss.getSheetByName(month);
    if (target) { found = _scanSheetForWork(target); usedSheet = month; }
  }
  // 2) 月タブが無い/値が取れなかった場合は全タブを走査（先に見つかった方）
  if (found.work === null && found.over === null) {
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var r = _scanSheetForWork(sheets[s]);
      if (r.work !== null || r.over !== null) { found = r; usedSheet = sheets[s].getName(); break; }
    }
  }
  return {
    ok: true,
    sheet: usedSheet,
    workRaw: found.work, overtimeRaw: found.over,
    workHours: _hmsToHours(found.work),
    overtimeHours: _hmsToHours(found.over)
  };
}

function doGet(e) {
  if (!_authOK(e)) return _json({ ok: false, error: 'unauthorized' });
  try {
    var action = (e.parameter.action || 'list');
    // 作業日報スプレッドシート（別ファイル）から月間勤務時間・残業時間を読む
    if (action === 'worklog') {
      var sid = e.parameter.sheetId ? String(e.parameter.sheetId) : '';
      if (!sid) return _json({ ok: false, error: 'sheetId required' });
      var month = e.parameter.month ? String(e.parameter.month) : '';
      return _json(_readWorklog(sid, month));
    }
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
        if (updCol >= 0 && _toMs(incomingUpd) <= _toMs(keyToRow[key].upd)) { skipped++; return; } // 古い/同値は無視（LWW・時刻で比較）
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
