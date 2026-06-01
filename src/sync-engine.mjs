// 純粋ロジック。index.html のインライン <script> にも同じ本体をコピーして使う。
export function pickNewer(a, b) {
  const ua = String((a && a._updatedAt) || '');
  const ub = String((b && b._updatedAt) || '');
  return ub > ua ? b : a; // 同値はローカル(a)優先
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
