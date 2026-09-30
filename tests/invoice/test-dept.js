// tests/invoice/test-dept.js — 請求書の「担当部署」（請求先名の下・担当者の上）2026-09-30
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

console.log('=== 記入欄の位置 ===');
const iC = src.indexOf('id="inv-screen-company"'), iD = src.indexOf('id="inv-screen-dept"'), iP = src.indexOf('id="inv-screen-contact"');
ok(iD > 0 && iC < iD && iD < iP, '請求先名 → 担当部署 → 担当者 の順');

console.log('\n=== 値の出し入れ（擬似DOM） ===');
const els = {}; ['inv-screen-company','inv-screen-contact','inv-screen-dept','inv-screen-honorific','inv-screen-client','inv-screen-zip','inv-screen-addr'].forEach(id => { els[id] = { value: '', textContent: '' }; });
global.document = { getElementById: id => els[id] || null };
['_getInvDept','_syncClientLine','_setInvHonorific','_setInvClientFields','_applyInvClient'].forEach(n => (0, eval)(grabFunction(src, n)));
_setInvClientFields('ウェブキャスト', '狩俣', '御中', ' 制作部 ');
ok(els['inv-screen-dept'].value === ' 制作部 ' && _getInvDept() === '制作部', '部署をセットでき、取り出すときは前後の空白を落とす');
_setInvClientFields('別の会社', '', '御中');
ok(els['inv-screen-dept'].value === '', '部署を渡さなければ空になる（前の書類の部署が残らない）');
_applyInvClient({ '担当者': '山田', '担当者部署': '営業部', '住所': 'x', '郵便番号': '900-0000' });
ok(els['inv-screen-dept'].value === '営業部' && els['inv-screen-contact'].value === '山田', '取引先マスタを選ぶと担当者部署も入る');
_applyInvClient({ '担当者': '山田' });
ok(els['inv-screen-dept'].value === '', 'マスタに部署が無ければ空');

console.log('\n=== 保存と復元の配線 ===');
ok((src.match(/dept:     _getInvDept\(\),/g) || []).length === 2, 'テンプレ／納品書化の収集に入っている');
ok(/status\.dept     = _getInvDept\(\);/.test(grabFunction(src, 'saveInvDoc')), '保存（saveInvDoc）に入っている');
ok(/dept:      g\('inv-screen-dept'\) \? _getInvDept\(\) : \(prev\.dept \|\| ''\)/.test(src), '印刷時の保存に入っている');
ok((src.match(/_setInvClientFields\([^;]*\.dept( \|\| '')?\);/g) || []).length === 4, '開くとき4か所（テンプレ・納品書・請求書・WSから）で復元する');
ok(/company: c\.company, contact: c\.contact, dept: c\.dept \|\| '', honorific: c\.honorific,/.test(src), 'テンプレートにも保存');

console.log('\n=== 書類（印刷） ===');
const doc = grabFunction(src, 'buildDocHTML');
ok(/const dept     = escapeHtml\(_getInvDept\(\)\);/.test(doc), 'escapeHtml を通す');
const a = doc.indexOf('${company}'), b = doc.indexOf('${dept ?'), c = doc.indexOf('${contact ?');
ok(a > 0 && a < b && b < c, '会社名 → 部署 → 担当 の順に出る');
ok(/\$\{dept \? `<div[^`]*>\$\{dept\}<\/div>` : ''\}/.test(doc), '空なら行ごと出さない');
ok.done();
