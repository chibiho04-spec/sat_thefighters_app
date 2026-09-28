// tests/media/test-records.js — 記録の集計（通常WS・簡易WS・旧記録）とカードの現在地
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_normalizeMedia', '_mediaHasRecord', '_mediaDateKey', '_splitCards', '_mediaBuFlag', '_mediaRecords', '_mediaCardStatus', '_mediaFilterRows']);

console.log('=== 日付キー ===');
ok(_mediaDateKey('2026/08/17') === '2026-08-17' && _mediaDateKey('2026-8-7') === '2026-08-07' && _mediaDateKey('2026.08.17, 08/18') === '2026-08-17', '年付き');
{ const now = new Date(); const y = now.getFullYear();
  const past = '1/1', future = '12/31';
  const todayMd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  ok(_mediaDateKey(past) === (('01-01' > todayMd) ? (y - 1) : y) + '-01-01', '年なしの過去の月日は今年');
  ok(_mediaDateKey(future) === (('12-31' > todayMd) ? (y - 1) : y) + '-12-31', '年なしで今日より未来の月日は前年'); }
ok(_mediaDateKey('') === '' && _mediaDateKey('未定') === '', '読めなければ空');
console.log('\n=== 分割・BU判定 ===');
ok(_splitCards('CF160_1, CF160_2、CF160_3／CF256_1').join('|') === 'CF160_1|CF160_2|CF160_3|CF256_1', '区切りは , 、 ／ / 空白');
ok(_mediaBuFlag('○') && _mediaBuFlag('済') && _mediaBuFlag('OK') && !_mediaBuFlag('') && !_mediaBuFlag('未') && !_mediaBuFlag('×'), 'BU の印');
ok(_mediaBuFlag('2026/05/21') && _mediaBuFlag('○ 完了') && !_mediaBuFlag('なし') && !_mediaBuFlag('x'), '日付や「○ 完了」も済、なし/x は未');
ok(!_mediaBuFlag('-') && !_mediaBuFlag('—') && !_mediaBuFlag('0') && !_mediaBuFlag('NG') && !_mediaBuFlag('不要'), '記号・NG・不要も未');

console.log('\n=== 集計 ===');
global.localStorage = S.fakeStorage({
  projects_saved: JSON.stringify([{ num: 'T26051', title: '島じかん', date: '2026/08/10' }, { num: 'T26052', title: '削除済み', date: '2026/08/12' }]),
  deleted_ws: JSON.stringify(['T26052']),
  ws_T26051: JSON.stringify({ 'wsd-shootdate': '2026/08/10', media: { out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], user: '城間', bu: false, returnBy: '' }, _updatedAt: '2026-08-10T10:00:00Z' }),
  ws_T26052: JSON.stringify({ media: { out: ['CF160_3'] } }),
  ws_T26053: JSON.stringify({ edit_title: '孤立だが記録あり', media: { date: '2026/08/20', out: ['CF256_1'], used: ['CF256_1'], bu: true, buBy: '平岡', returnBy: '城間' }, _updatedAt: '2026-08-20T10:00:00Z' }),
  ws_T26054: JSON.stringify({ edit_title: '記録なし', media: { user: '城間' } }),
  simple_ws: JSON.stringify([{ id: 'sw1', date: '2026/08/15', title: 'RBC中継', user: '上原', media: { out: ['CF160_4'], used: ['CF160_4'], bu: true, buBy: '上原', returnBy: '上原' }, _updatedAt: '2026-08-15T10:00:00Z' }]),
  media_cache: JSON.stringify({ at: 1, rows: [
    { 'ID': 'L0001', '使用日': '2026/08/17', 'メディア種別': 'LINE', '使用カード': 'CF160_1, CF160_2', '使用者': '城間', '現場名': '首里城VP', 'BU確認': '○', '返却者': '城間', '備考': '持出: CF160_1, CF160_2, CF160_3／BU担当: 平岡' },
    { 'ID': 'M001', '使用日': '2026/07/01', 'メディア種別': 'CFexpress', '使用カード': 'No.1', '使用者': '上原', '現場名': '旧アプリ記録', 'BU確認': '済', '返却者': '', '備考': '' }
  ] })
});
const recs = _mediaRecords();
ok(recs.length === 5, '5件（削除済みWSと記録なしWSは除外）: ' + recs.map(r => r.label).join(','));
ok(recs.map(r => r.key).join(',') === 'T26053,L0001,sw1,T26051,M001', '使用日の新しい順: ' + recs.map(r => r.key).join(','));
const t51 = recs.find(r => r.key === 'T26051');
ok(t51.src === 'ws' && t51.site === '島じかん' && t51.date === '2026/08/10', '通常WSは件名と日程を使う');
const l1 = recs.find(r => r.key === 'L0001');
ok(l1.src === 'line' && l1.label === 'LINE' && l1.media.out.join(',') === 'CF160_1,CF160_2,CF160_3' && l1.media.buBy === '平岡' && l1.media.bu === true, 'LINE 行は備考から持出とBU担当を戻す');
const m1 = recs.find(r => r.key === 'M001');
ok(m1.src === 'old' && m1.label === '旧' && m1.media.bu === true && m1.media.used.join(',') === 'No.1', '旧アプリ行は閲覧用に読める');
ok(recs.find(r => r.key === 'sw1').src === 'sw' && recs.find(r => r.key === 'sw1').site === 'RBC中継', '簡易WSも並ぶ');

console.log('\n=== カードの現在地 ===');
const cards = [{ id: 'CF160_1' }, { id: 'CF160_2' }, { id: 'CF160_3' }, { id: 'CF160_4' }, { id: 'CF256_1' }, { id: 'CF256_2' }];
const st = _mediaCardStatus(recs, cards);
const by = id => st.find(s => s.id === id);
ok(by('CF160_1').state === 'out' && by('CF160_1').rec.key === 'T26051', 'CF160_1: 返却者空 → 貸出中（LINE の返却済は使わない）');
ok(by('CF160_2').state === 'out', 'CF160_2: 貸出中');
ok(by('CF160_3').state === 'none', 'CF160_3: 削除済みWSと LINE だけ → 記録なし');
ok(by('CF160_4').state === 'ok', 'CF160_4: 返却済・BU済');
ok(by('CF256_1').state === 'ok' && by('CF256_2').state === 'none', 'CF256_1 返却済／CF256_2 記録なし');
// BU未
global.localStorage.setItem('ws_T26051', JSON.stringify({ media: { date: '2026/08/10', out: ['CF160_1'], used: ['CF160_1'], bu: false, returnBy: '城間' } }));
ok(_mediaCardStatus(_mediaRecords(), cards).find(s => s.id === 'CF160_1').state === 'bu', '返却済・使用あり・BU未 → BU未');
// 同日は更新日時の新しい方
global.localStorage.setItem('ws_T26051', JSON.stringify({ media: { date: '2026/08/20', out: ['CF256_1'], returnBy: '' }, _updatedAt: '2026-08-20T12:00:00Z' }));
ok(_mediaCardStatus(_mediaRecords(), cards).find(s => s.id === 'CF256_1').rec.key === 'T26051', '同じ使用日なら更新日時が新しい記録で決める');

console.log('\n=== 絞り込みと検索（_mediaFilterRows） ===');
global.localStorage.setItem('ws_T26051', JSON.stringify({ 'wsd-shootdate': '2026/08/10', edit_title: '島じかん', media: { out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], user: '城間', bu: false, buBy: '', returnBy: '', memo: '素材80GB' } }));
const all = _mediaRecords();
ok(_mediaFilterRows(all, 'all', '').length === all.length, 'すべて');
ok(_mediaFilterRows(all, 'bu', '').every(r => r.media.used.length && !r.media.bu) && _mediaFilterRows(all, 'bu', '').some(r => r.key === 'T26051'), '🟡 BU未');
ok(_mediaFilterRows(all, 'return', '').every(r => r.media.out.length && !r.media.returnBy) && _mediaFilterRows(all, 'return', '').some(r => r.key === 'T26051'), '🔴 返却未');
ok(_mediaFilterRows(all, 'line', '').every(r => r.src === 'line') && _mediaFilterRows(all, 'line', '').length === 1, 'LINE');
ok(_mediaFilterRows(all, 'all', _normalizeForSearch('平岡')).some(r => r.key === 'L0001'), '検索は BU担当も対象');
ok(_mediaFilterRows(all, 'all', _normalizeForSearch('素材80')).map(r => r.key).join(',') === 'T26051', '検索は備考も対象');
ok(_mediaFilterRows(all, 'all', _normalizeForSearch('ＣＦ２５６')).some(r => r.media.out.includes('CF256_1')), '全角でもカード名に当たる');
ok.done();
