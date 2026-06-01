import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNewer, mergeRecordsLWW } from '../src/sync-engine.mjs';

test('pickNewer は更新日時が新しい方を返す', () => {
  const a = { k: 'x', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const b = { k: 'x', _updatedAt: '2026-06-01T11:00:00.000Z' };
  assert.equal(pickNewer(a, b), b);
  assert.equal(pickNewer(b, a), b);
});

test('pickNewer は同値ならローカル(a)を優先', () => {
  const a = { _updatedAt: '2026-06-01T10:00:00.000Z', src: 'local' };
  const b = { _updatedAt: '2026-06-01T10:00:00.000Z', src: 'sheet' };
  assert.equal(pickNewer(a, b).src, 'local');
});

test('mergeRecordsLWW: シートが新しいレコードで上書き', () => {
  const local = [{ id: '1', v: 'old', _updatedAt: '2026-06-01T10:00:00.000Z' }];
  const sheet = [{ id: '1', v: 'new', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 'new');
});

test('mergeRecordsLWW: ローカルが新しければシートを無視', () => {
  const local = [{ id: '1', v: 'localnew', _updatedAt: '2026-06-01T12:00:00.000Z' }];
  const sheet = [{ id: '1', v: 'sheetold', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out[0].v, 'localnew');
});

test('mergeRecordsLWW: シート新規はローカルへ追加', () => {
  const out = mergeRecordsLWW([], [{ id: '2', _updatedAt: '2026-06-01T10:00:00.000Z' }], 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '2');
});

test('mergeRecordsLWW: シート削除(削除フラグ=1)が新しければローカルから除く', () => {
  const local = [{ id: '1', v: 'x', _updatedAt: '2026-06-01T10:00:00.000Z' }];
  const sheet = [{ id: '1', 削除フラグ: '1', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 0);
});

test('mergeRecordsLWW: 古い削除はローカルの新しい編集を消さない', () => {
  const local = [{ id: '1', v: 'edited', _updatedAt: '2026-06-01T12:00:00.000Z' }];
  const sheet = [{ id: '1', 削除フラグ: '1', _updatedAt: '2026-06-01T11:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 'edited');
});

// --- 日時の形式が混在しても「実際の時刻」で新旧判定する（旧データは Date.toString 形式） ---
test('pickNewer: 旧形式(toString)より新しいISOが勝つ（文字列比較では負ける罠）', () => {
  const legacy = { _updatedAt: 'Sun May 31 2026 15:43:23 GMT+0900 (日本標準時)', src: 'legacy' };
  const fresh  = { _updatedAt: '2026-06-01T05:00:00.000Z', src: 'fresh' }; // 実時刻は legacy より後
  // 文字列比較だと "2026..." < "Sun..." で legacy が勝ってしまうが、時刻比較なら fresh が勝つ
  assert.equal(pickNewer(legacy, fresh).src, 'fresh');
  assert.equal(pickNewer(fresh, legacy).src, 'fresh');
});

test('mergeRecordsLWW: 旧形式の行を新しいISO削除フラグで消せる（削除が効く）', () => {
  const local = [{ id: '1', v: 'x', _updatedAt: 'Sun May 31 2026 15:43:23 GMT+0900 (日本標準時)' }];
  const sheet = [{ id: '1', 削除フラグ: '1', _updatedAt: '2026-06-01T05:00:00.000Z' }];
  const out = mergeRecordsLWW(local, sheet, 'id');
  assert.equal(out.length, 0);
});

import { stampNow, jsonToRow, jsonFromRow, plainToRow, plainFromRow } from '../src/sync-engine.mjs';

test('stampNow は _updatedAt をISOで付ける', () => {
  const r = stampNow({ id: '1' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r._updatedAt));
  assert.equal(r.id, '1');
});

test('jsonToRow/jsonFromRow は往復する', () => {
  const rec = { id: 'shin', name: '城間', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const row = jsonToRow(rec, 'キー', 'id');
  assert.equal(row['キー'], 'shin');
  assert.equal(row['更新日時'], '2026-06-01T10:00:00.000Z');
  assert.equal(row['削除フラグ'], '');
  const back = jsonFromRow(row, 'キー');
  assert.equal(back.name, '城間');
  assert.equal(back._updatedAt, '2026-06-01T10:00:00.000Z');
});

test('jsonToRow は削除フラグを反映', () => {
  const row = jsonToRow({ id: 'x', _deleted: true, _updatedAt: '2026-06-01T10:00:00.000Z' }, 'キー', 'id');
  assert.equal(row['削除フラグ'], '1');
});

test('plainToRow は列passthrough＋共通3列付与', () => {
  const rec = { '取引先コード': 'C001', '取引先名': 'A社', _updatedAt: '2026-06-01T10:00:00.000Z' };
  const row = plainToRow(rec, '取引先コード');
  assert.equal(row['取引先コード'], 'C001');
  assert.equal(row['取引先名'], 'A社');
  assert.equal(row['更新日時'], '2026-06-01T10:00:00.000Z');
  assert.equal(row['削除フラグ'], '');
  assert.ok(!('_updatedAt' in row)); // 内部フィールドはシートに出さない
});

test('plainFromRow は共通列を内部フィールドへ戻す', () => {
  const row = { '取引先コード': 'C001', '取引先名': 'A社', '更新日時': '2026-06-01T10:00:00.000Z', '削除フラグ': '' };
  const rec = plainFromRow(row);
  assert.equal(rec['取引先名'], 'A社');
  assert.equal(rec._updatedAt, '2026-06-01T10:00:00.000Z');
});
