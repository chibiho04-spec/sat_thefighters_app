// tests/media/test-core.js — 記録の正規化・印刷行・閲覧HTML・機材カテゴリの除外
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_normalizeMedia', '_mediaHasRecord', '_mediaPrintLine', '_mediaStatusBadges', '_mediaViewHtml']);

console.log('=== 正規化 ===');
let m = _normalizeMedia(null);
ok(Array.isArray(m.out) && m.out.length === 0 && m.bu === false && m.date === '' && m.memo === '', '無ければ空の形');
m = _normalizeMedia({ date: ' 2026/08/17 ', out: ['CF160_1', '', ' CF160_2 '], used: 'x', user: ' 城間', bu: 1, buBy: '平岡', returnBy: '', memo: 'a' });
ok(m.date === '2026/08/17' && m.out.join(',') === 'CF160_1,CF160_2' && m.used.length === 0 && m.user === '城間' && m.bu === true, '空や余白を整える。配列でない used は空');
ok(_mediaHasRecord({ out: ['CF160_1'] }) && _mediaHasRecord({ used: ['CF160_1'] }) && !_mediaHasRecord({ user: '城間' }) && !_mediaHasRecord(null), '記録あり＝持出か使用が1枚以上');

console.log('\n=== 印刷の1行（持ち出しだけ） ===');
ok(_mediaPrintLine({ out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], bu: true, buBy: '平岡', returnBy: '城間' }) === '持ち出し: CF160_1, CF160_2', '持ち出しだけを出す');
ok(_mediaPrintLine({ used: ['CF160_1'] }) === '', '持ち出しが無ければ空');
ok(_mediaPrintLine({ out: ['<b>'] }) === '持ち出し: &lt;b&gt;', 'escapeHtml を通す');

console.log('\n=== 状態バッジ ===');
ok(/返却未/.test(_mediaStatusBadges({ out: ['CF160_1'] })) && !/BU未/.test(_mediaStatusBadges({ out: ['CF160_1'] })), '持出あり・返却者空 → 返却未');
ok(/BU未/.test(_mediaStatusBadges({ out: ['CF160_1'], used: ['CF160_1'], returnBy: '城間' })), '使用あり・BU未');
ok(_mediaStatusBadges({ out: ['CF160_1'], used: ['CF160_1'], returnBy: '城間', bu: true }) === '', '返却済・BU済ならバッジ無し');

console.log('\n=== 閲覧HTML ===');
const v = _mediaViewHtml({ out: ['CF160_1'], used: ['CF160_1'], user: '城間', bu: true, buBy: '平岡', returnBy: '城間', memo: '約80GB' });
ok(/持出:.*CF160_1/.test(v) && /使用:.*CF160_1/.test(v) && /使用者: 城間/.test(v) && /BU: ○ 平岡/.test(v) && /返却: 城間/.test(v) && /約80GB/.test(v), '全項目が出る');
ok(/BU: 未/.test(_mediaViewHtml({ out: ['CF160_1'] })) && /返却: 未/.test(_mediaViewHtml({ out: ['CF160_1'] })), '未の表記');
ok(/&lt;s&gt;/.test(_mediaViewHtml({ out: ['<s>'] })), 'escapeHtml を通す');

console.log('\n=== レビュー指摘（2026-09-28）===');
ok(_normalizeMedia({ out: ['CF160_1', 'CF160_1', ' CF160_1 '] }).out.length === 1, '同じカードが2回あっても1枚');
ok(_normalizeMedia({ memo: '   ' }).memo === '', '備考も余白を落とす');
ok(_mediaViewHtml({}) === '' && _mediaViewHtml({ user: '城間' }) === '', '記録が無ければ閲覧HTMLは空');
ok.done();
