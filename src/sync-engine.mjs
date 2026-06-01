// 純粋ロジック。index.html のインライン <script> にも同じ本体をコピーして使う。
// 更新日時を「実際の時刻(ms)」へ変換する。ISO形式も旧 Date.toString 形式も解釈できる。
// 末尾の "(日本標準時)" のような括弧注記は環境によって解釈が割れるため除去する。
export function toMillis(v) {
  const s = String(v || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!s) return -Infinity;
  const t = Date.parse(s);
  return Number.isNaN(t) ? -Infinity : t;
}
export function pickNewer(a, b) {
  const ta = toMillis(a && a._updatedAt);
  const tb = toMillis(b && b._updatedAt);
  return tb > ta ? b : a; // 同時刻はローカル(a)優先
}

// localList/sheetList は { [keyField]:..., _updatedAt, 削除フラグ? } の配列。
// 戻り値は「生き残ったレコード」の配列（削除フラグの勝ったものは除外）。
export function mergeRecordsLWW(localList, sheetList, keyField) {
  const byKey = new Map();
  for (const r of localList) {
    const k = String((r && r[keyField]) || '').trim();
    if (k) byKey.set(k, r);
  }
  for (const s of sheetList) {
    const k = String((s && s[keyField]) || '').trim();
    if (!k) continue;
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, s); continue; }
    byKey.set(k, pickNewer(cur, s));
  }
  const out = [];
  for (const r of byKey.values()) {
    if (String((r && r['削除フラグ']) || '') === '1') continue; // 削除が勝ったものは除外
    out.push(r);
  }
  return out;
}

export function stampNow(record) {
  return Object.assign({}, record, { _updatedAt: new Date().toISOString() });
}

// JSONブロブ方式（invoice/staff/child）: データ列に丸ごと入れる
export function jsonToRow(record, keyHeader, keyField) {
  return {
    [keyHeader]: String(record[keyField] || ''),
    'データ': JSON.stringify(record),
    '更新日時': record._updatedAt || new Date().toISOString(),
    '削除フラグ': record._deleted ? '1' : ''
  };
}
export function jsonFromRow(row, keyHeader) {
  let rec = {};
  try { rec = JSON.parse(row['データ'] || '{}'); } catch (e) { rec = {}; }
  rec._updatedAt = String(row['更新日時'] || rec._updatedAt || '');
  if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
  return rec;
}

// 読める列方式（client/product/media/equip）: レコードのキーがそのままシート列
const _INTERNAL = new Set(['_updatedAt', '_deleted']);
export function plainToRow(record, keyField) {
  const row = {};
  for (const k of Object.keys(record)) {
    if (_INTERNAL.has(k)) continue;
    row[k] = record[k];
  }
  row['更新日時'] = record._updatedAt || new Date().toISOString();
  row['削除フラグ'] = record._deleted ? '1' : '';
  return row;
}
export function plainFromRow(row) {
  const rec = {};
  for (const k of Object.keys(row)) {
    if (k === '更新日時' || k === '削除フラグ') continue;
    rec[k] = row[k];
  }
  rec._updatedAt = String(row['更新日時'] || '');
  if (String(row['削除フラグ'] || '') === '1') rec['削除フラグ'] = '1';
  return rec;
}
