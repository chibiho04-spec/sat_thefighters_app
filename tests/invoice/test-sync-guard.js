// tests/invoice/test-sync-guard.js — 同期で「明細のある請求書」が「明細ゼロの新しい版」に消されない（2026-10-04 公開）
// 2026-08-04 に作って据え置いていた保護強化（発行済みかどうかを問わず守る）を公開した。その確認。
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
['_toMillis', '_pickNewer'].forEach(n => (0, eval)(grabFunction(src, n)));
const L = [{ name: '撮影費', qty: 1, price: 200000 }];

console.log('=== 未発行でも守る（今回公開した部分） ===');
let r = _pickNewer({ lines: L, title: '大和ハウス', _updatedAt: '2026-09-30T07:00:00Z' }, { estimated: true, _updatedAt: '2026-10-01T00:00:00Z' });
ok(r.lines.length === 1 && r.estimated === true && r.title === '大和ハウス', '未発行の請求書：明細は残り、新しい版の印（estimated）は活きる');
ok(Date.parse(r._updatedAt) > Date.parse('2026-10-01T00:00:00Z'), '更新時刻を打ち直す（次の送信でシート側の空版を直せる）');
r = _pickNewer({ estimated: true, _updatedAt: '2026-10-01T00:00:00Z' }, { lines: L, _updatedAt: '2026-09-30T07:00:00Z' });
ok(r.lines.length === 1, '手元が空でシート側に明細がある場合も同じ');

console.log('\n=== 従来どおりの動き ===');
r = _pickNewer({ lines: L, billed: true, _updatedAt: '2026-09-01T00:00:00Z' }, { paid: true, _updatedAt: '2026-10-01T00:00:00Z' });
ok(r.lines.length === 1 && r.billed === true && r.paid === true, '発行済み：明細を守り、請求済・入金済は両方活きる');
r = _pickNewer({ lines: L, _updatedAt: '2026-09-01T00:00:00Z' }, { lines: [{ name: '新', qty: 1, price: 1 }], _updatedAt: '2026-10-01T00:00:00Z' });
ok(r.lines[0].name === '新', '両方に明細があれば新しい方が勝つ（普通の上書き）');
r = _pickNewer({ lines: L, _updatedAt: '2026-09-01T00:00:00Z' }, { '削除フラグ': '1', _updatedAt: '2026-10-01T00:00:00Z' });
ok(String(r['削除フラグ']) === '1', '削除は通す（ゴミ箱に入れた書類が復活しない）');
r = _pickNewer({ a: 1, _updatedAt: '2026-10-01T00:00:00Z' }, { a: 2, _updatedAt: '2026-09-01T00:00:00Z' });
ok(r.a === 1, '明細に関係ないレコードは新しい方');

console.log('\n=== 公開されていること ===');
ok(!/_issued\(loser\) \|\| _issued\(winner\)/.test(grabFunction(src, '_pickNewer')), '「発行済みのときだけ守る」条件が残っていない');
ok.done();
