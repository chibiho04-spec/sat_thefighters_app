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

console.log('\n=== 機材チェックリストから「💾 メディア」を外す ===');
S.load(['_wsEquipCats']); S.loadConst('_EQUIP_CATS_HIDDEN_IN_WS');
const master = [{ id: 'a', cat: '📷 カメラ' }, { id: 'b', cat: '💾 メディア' }, { id: 'c', cat: '🧪 その他独自' }];
let cats = _wsEquipCats(master, {});
ok(cats.includes('📷 カメラ') && !cats.includes('💾 メディア') && cats.includes('🧪 その他独自'), '通常はメディアを出さない（独自カテゴリは末尾に出る）');
cats = _wsEquipCats(master, { b: { checked: true } });
ok(cats.includes('💾 メディア'), '既にチェック済みなら出す（外せるように）');
cats = _wsEquipCats(master, { b: { checked: false } });
ok(!cats.includes('💾 メディア'), 'チェックが外れていれば出さない');
ok(_wsEquipCats([], {}).length === 0, 'マスタが空なら空');
cats = _wsEquipCats(master, {});
ok(cats.indexOf('📷 カメラ') < cats.indexOf('🧪 その他独自'), 'CAT_ORDER のカテゴリが先、独自カテゴリが後');

console.log('\n=== 開くときの整え（_wsMediaForOpen） ===');
S.load(['_wsMediaForOpen']);
let o = _wsMediaForOpen({ 'wsd-media': 'SD64GB×2', crew_c: '城間' }, {});
ok(o.memo === 'SD64GB×2' && o.user === '城間', '旧文→備考、記録が無ければ使用者はカメラマン');
o = _wsMediaForOpen({ 'wsd-media': '旧文', media: { memo: '新しい備考' } }, {});
ok(o.memo === '新しい備考\n旧文', '備考があれば旧文は末尾に追記（上書きしない）');
o = _wsMediaForOpen({ 'wsd-media': '同じ', media: { memo: 'すでに 同じ が入っている' } }, {});
ok(o.memo === 'すでに 同じ が入っている', '備考に含まれていれば二重に足さない');
o = _wsMediaForOpen({ media: { out: ['CF160_1'], user: '' }, crew_c: '城間' }, {});
ok(o.user === '', '記録がある案件は空の使用者を埋めない');
o = _wsMediaForOpen({ media: { user: '上原' }, crew_c: '城間' }, {});
ok(o.user === '上原', '使用者があれば触らない');
o = _wsMediaForOpen({}, { crewC: '川野' });
ok(o.user === '川野', 'saved に無ければ wsData のカメラマン');
ok(_wsMediaForOpen(null, null).out.length === 0, 'null でも落ちない');

ok.done();
