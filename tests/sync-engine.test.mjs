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
