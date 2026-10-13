// tests/worksheet/test-copy-ws.js — 案件のコピー（2026-10-13）
const { html, grabFunction, grabConst, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
global._WS_COPY_KEYS = grabConst(src, '_WS_COPY_KEYS');
['_wsCopyPrefix', '_buildWSCopy'].forEach(n => (0, eval)(grabFunction(src, n)));

console.log('=== 接頭辞 ===');
ok(_wsCopyPrefix('T26135') === 'T' && _wsCopyPrefix('E26042') === 'E' && _wsCopyPrefix('P26120') === 'P', 'T/E/P はそのまま');
ok(_wsCopyPrefix('D26005') === 'P' && _wsCopyPrefix('B26001') === 'T', '廃止した D→P、B→T');
ok(_wsCopyPrefix('0001') === 'T' && _wsCopyPrefix('') === 'T', '退避番号・空は T');

console.log('\n=== 引き継ぐもの・引き継がないもの ===');
const parent = { title: '親の件名', company: '親の会社', date: '9/24〜25', type: 'TV', orderType: '撮影', staff: '川崎', crewC: '城間', memo: '親メモ', clientCode: 'C003', receivedAt: '2026-09-01', _updatedAt: '2026-09-01T00:00:00Z' };
const saved = { edit_title: '子の件名', edit_company: '子の会社', edit_contact: '諸見', edit_type: 'WEB', edit_order: 'スチール撮影', creator: '城間',
  crew_c: '平岡', crew_a: '上地', crew_extra: 'フリーのCA', equip: { em001: { checked: true, qty: 2, memo: 'x' } }, outsource_list: [{ name: '照明部', cost: '50000', taxable: true }],
  'wsd-private': 'ジンバル', 'wsd-vehicle': '1号車／2号車', 'wsd-memo': '子メモ', 'wsd-order-amount': '200000', cb_postpro: true,
  'wsd-shootdate': '9/24〜25', 'wsd-report': '広島ロケ', 'wsd-media': '旧メモ', media: { out: ['CF160_1'], used: ['CF160_1'], user: '城間' },
  rental_list: [{ name: 'x', cost: 1 }], 'wsd-rental': 'x', 'wsd-rental-cost': '1', _progress: 3, saved_at: '2026/9/30', _updatedAt: '2026-09-30T00:00:00Z' };
const r = _buildWSCopy('T26135', 'T26160', parent, saved, '2026-10-13T01:00:00Z', '2026-10-13');
const c = r.child, p = r.project;
ok(c.edit_title === '子の件名' && c.edit_company === '子の会社' && c.edit_contact === '諸見' && c.edit_type === 'WEB' && c.edit_order === 'スチール撮影' && c.creator === '城間', '件名・取引先・担当者・分類・種別・作成者');
ok(c.crew_c === '平岡' && c.crew_a === '上地' && c.crew_extra === 'フリーのCA', '担当クルー');
ok(JSON.stringify(c.equip) === JSON.stringify(saved.equip) && c.equip !== saved.equip, '機材リスト（深いコピー）');
ok(JSON.stringify(c.outsource_list) === JSON.stringify(saved.outsource_list) && c.outsource_list !== saved.outsource_list && c['wsd-outsource'] === '照明部' && c['wsd-outsource-cost'] === 50000, '外注（まとめ欄も作り直す）');
ok(c['wsd-private'] === 'ジンバル' && c['wsd-vehicle'] === '1号車／2号車' && c['wsd-memo'] === '子メモ' && c['wsd-order-amount'] === '200000' && c.cb_postpro === true, '私物・車両・メモ・受注金額・ポスプロ');
ok(c['wsd-shootdate'] === '' && c['wsd-report'] === '' && c['wsd-media'] === '' && c.media === undefined, '日程・報告事項・メディア記録は空');
ok(Array.isArray(c.rental_list) && c.rental_list.length === 0 && c['wsd-rental'] === '' && c['wsd-rental-cost'] === '' && c._progress === undefined, '廃止したレンタル欄と進捗は引き継がない');
ok(c._updatedAt === '2026-10-13T01:00:00Z' && c.saved_at && c.saved_at !== saved.saved_at, '更新時刻は新しく打つ');
ok(p.title === '子の件名' && p.company === '子の会社' && p.contact === '諸見' && p.type === 'WEB' && p.orderType === 'スチール撮影', '親（受注ノート側）はワークシートの編集値を優先');
ok(p.date === '' && p.receivedAt === '2026-10-13' && p.copiedFrom === 'T26135' && p.clientCode === 'C003' && p.staff === '川崎', '親の日程は空・受注日は今日・どこからコピーしたかを残す');
ok(p.crewC === '平岡' && p.crewA === '上地' && p.memo === '子メモ', '親のクルー・メモも編集値を優先');
const r2 = _buildWSCopy('T26001', 'T26002', { title: 'A', company: 'B', type: 'TV', orderType: '撮影' }, {}, '2026-10-13T01:00:00Z', '2026-10-13');
ok(r2.project.title === 'A' && r2.project.company === 'B' && r2.child['wsd-shootdate'] === '' && Object.keys(r2.child).length > 0, 'ワークシートを一度も保存していない案件も親の値でコピーできる');
ok(JSON.stringify(saved.equip) === JSON.stringify({ em001: { checked: true, qty: 2, memo: 'x' } }) && saved['wsd-shootdate'] === '9/24〜25', '元の案件は変わらない');

console.log('\n=== 配線 ===');
ok(/id="wsd-copy-btn" onclick="copyWSAsNew\(\)"/.test(src) && src.indexOf('id="wsd-copy-btn"') < src.indexOf('onclick="deleteCurrentWS()"'), 'ボタンは削除ボタンの上にある');
const fn = grabFunction(src, 'copyWSAsNew');
ok(/_isDirty\('ws-detail-screen'\)/.test(fn), '編集中なら先に保存を促す');
ok(/showConfirm\(/.test(fn) && /_verifyOrderNumFreeRemote\(newNum, prefix\)/.test(fn), '確認してから、他端末の番号と被らないか確かめる');
ok(/pushKind\('order', \[\{ '受注No': newNum, _project: project, _updatedAt: nowIso \}\], \{ claimNew: true \}\)/.test(fn) && /pushKind\('child', \[Object\.assign\(\{\}, child, \{ '受注No': newNum \}\)\]\)/.test(fn) && /_handleOrderClaimRejected\(newNum\)/.test(fn), '新規登録と同じ経路で同期（先取り主張・負けたら付け替え）');
ok(/openWS\(openNum\);\s*toggleWsEdit\(true\);/.test(fn), '作ったら編集画面で開く');
ok(!/localStorage\.setItem\('ws_' \+ srcNum/.test(fn) && !/saveProject\(srcNum/.test(fn), '元の案件には書き込まない');
['_wsCopyPrefix', '_buildWSCopy', 'copyWSAsNew'].forEach(f => { const m = src.match(new RegExp('^( *)(?:async )?function ' + f + '\\(', 'm')); ok(!!m && m[1].length === 2, f + ' がトップレベル'); });
ok.done();
