// tests/sales/test-dept-badge.js — 売上表の案件に「関わった部署」のバッジ（2026-10-30）
const { html, grabFunction, grabConst, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
global._DEPT_BADGES = grabConst(src, '_DEPT_BADGES');
['_caseDeptsFromData', 'caseDepts', '_deptBadgesHtml'].forEach(n => (0, eval)(grabFunction(src, n)));

console.log('=== 担当クルーから判定 ===');
ok(_caseDeptsFromData({ crewC: '城間' }, 'P26124').join() === '撮影', 'カメラマンがいれば撮影（P番号でも）');
ok(_caseDeptsFromData({ crewSound: '新崎' }, 'E26001').join() === '撮影', '音声も撮影');
ok(_caseDeptsFromData({ crewEdit: '森田' }, 'T26001').join() === '編集', '編集担当がいれば編集');
ok(_caseDeptsFromData({ crewD: '松田' }, 'T26001').join() === '制作' && _caseDeptsFromData({ crewPm2: '川野' }, 'T26001').join() === '制作', 'ディレクター/PM がいれば制作');
ok(_caseDeptsFromData({ crewProducer: '川崎', crewC: '城間', crewEdit: '森田' }, 'P26116').join() === '撮影,編集,制作', '複数なら 撮影・編集・制作 の順');
console.log('\n=== 受注分類から判定 ===');
ok(_caseDeptsFromData({ orderType: 'スチール撮影' }, 'P26001').join() === '撮影' && _caseDeptsFromData({ orderType: '撮影・編集' }, 'X').join() === '撮影,編集', '分類に撮影/編集');
ok(_caseDeptsFromData({ orderType: '企画・演出' }, 'T26001').join() === '制作' && _caseDeptsFromData({ orderType: 'プロデュース' }, 'T26001').join() === '制作', '分類に企画・演出／プロデュース');
console.log('\n=== 何も無ければ接頭辞 ===');
ok(_caseDeptsFromData({}, 'T26001').join() === '撮影' && _caseDeptsFromData({}, 'E26001').join() === '編集' && _caseDeptsFromData({}, 'P26001').join() === '制作', 'T→撮影 E→編集 P→制作');
ok(_caseDeptsFromData({ orderType: '機材レンタル' }, 'INV-26001').length === 0 && _caseDeptsFromData(null, '').length === 0, '判定できなければ空（バッジ無し）');
console.log('\n=== バッジの HTML ===');
global.getWsDisplayData = num => ({ crewC: '城間', crewEdit: '森田', orderType: '撮影' });
const h = _deptBadgesHtml('T26001');
ok((h.match(/<span/g) || []).length === 2 && /#2980b9[^<]*>撮影</.test(h) && /#27ae60[^<]*>編集</.test(h) && !/制作/.test(h), '関わった部署だけ、決まった色で');
global.getWsDisplayData = () => { throw new Error('x'); };
ok(_deptBadgesHtml('P26001').includes('制作'), 'ワークシートを読めなくても接頭辞で出す');
ok(/受注No: \$\{escapeHtml\(it\.num\)\}\$\{_deptBadgesHtml\(it\.num\)\}/.test(grabFunction(src, 'renderSalesScreen')), '売上表の受注No の横に出る');
ok.done();
