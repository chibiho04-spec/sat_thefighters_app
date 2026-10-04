// tests/invoice/test-dept.js — 請求書の「担当部署」（請求先名の下・担当者の上）2026-09-30
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

console.log('=== 記入欄の位置 ===');
const iC = src.indexOf('id="inv-screen-company"'), iD = src.indexOf('id="inv-screen-dept"'), iP = src.indexOf('id="inv-screen-contact"');
ok(iD > 0 && iC < iD && iD < iP, '請求先名 → 担当部署 → 担当者 の順');

console.log('\n=== 値の出し入れ（擬似DOM） ===');
const els = {}; ['inv-screen-company','inv-screen-contact','inv-screen-dept','inv-screen-honorific','inv-screen-client','inv-screen-zip','inv-screen-addr','inv-dept-hon'].forEach(id => { els[id] = { value: '', textContent: '', style: {} }; });
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
ok((src.match(/_setInvClientFields\([^;]*\.dept( \|\| '')?\);/g) || []).length === 5, '開くとき4か所（テンプレ・納品書・請求書・WSから）＋見積書の取り込みで復元する');
ok(/company: c\.company, contact: c\.contact, dept: c\.dept \|\| '', honorific: c\.honorific,/.test(src), 'テンプレートにも保存');

console.log('\n=== 書類（印刷） ===');
const doc = grabFunction(src, 'buildDocHTML');
ok(/const dept     = escapeHtml\(_getInvDept\(\)\);/.test(doc), 'escapeHtml を通す');
ok(/const moveHon = !!\(dept && companyOnly\);/.test(doc), '部署があるとき敬称を部署側へ移す判定がある');
// 宛名ブロックのテンプレートを実際に動かして、出来上がりの HTML を確かめる
const tplSrc = doc.slice(doc.indexOf("const m = String(client || '')"), doc.indexOf('})()}', doc.indexOf("const m = String(client || '')")));
const render = (client, dept, companyVal, honVal) => {
  global.document = { getElementById: id => ({ 'inv-screen-honorific': { value: honVal }, 'inv-screen-company': { value: companyVal } }[id] || null) };
  return new Function('client', 'dept', 'escapeHtml', tplSrc)(client, dept, x => String(x));
};
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/ ?\| ?/g, '|').replace(/\|+/g, '|').trim();
let h = render('株式会社C3FILM 御中（担当：緑川 様）', '東京支社', '株式会社C3FILM', '御中');
ok(strip(h) === '|株式会社C3FILM|東京支社 御中|担当：緑川 様|', '部署あり：会社名／部署 御中／担当 の順: ' + strip(h));
ok((h.match(/border-bottom/g) || []).length === 1, '下線は1本だけ');
const wrap = h.slice(h.indexOf('border-bottom'));
ok(wrap.indexOf('株式会社C3FILM') > 0 && wrap.indexOf('東京支社 御中') > wrap.indexOf('株式会社C3FILM') && wrap.indexOf('担当：') > wrap.indexOf('</div>\n              </div>'), '下線の枠は会社名と部署を包み、担当は枠の外');
ok(!/font-size:14pt;font-weight:bold;border-bottom/.test(h), '会社名の行そのものには下線を付けない（部署の下に1本）');
h = render('株式会社C3FILM 御中（担当：緑川 様）', '', '株式会社C3FILM', '御中');
ok(strip(h) === '|株式会社C3FILM 御中|担当：緑川 様|' && /font-size:14pt;font-weight:bold;border-bottom/.test(h), '部署なし：従来どおり会社名 御中 の下に下線: ' + strip(h));
h = render('個人事務所 様', '企画室', '個人事務所', '様');
ok(strip(h) === '|個人事務所|企画室 様|', '敬称が「様」でも部署の後ろへ');

console.log('\n=== 記入画面でも並びが分かる ===');
global.document = { getElementById: id => els[id] || null }; // 上の印刷テストで差し替えた document を戻す
els['inv-screen-honorific'].value = '御中';
_setInvClientFields('ウェブキャスト', '狩俣', '御中', '制作部');
ok(els['inv-dept-hon'].textContent === '御中' && els['inv-screen-honorific'].style.opacity === '0.35', '部署があれば部署欄の右に敬称、会社名の横は薄く');
ok(els['inv-screen-client'].textContent === 'ウェブキャスト 御中（担当：狩俣 様）', '内部の宛名文字列は従来どおり（他の処理に影響しない）');
_setInvClientFields('ウェブキャスト', '狩俣', '御中', '');
ok(els['inv-dept-hon'].textContent === '' && els['inv-screen-honorific'].style.opacity === '', '部署が無ければ元どおり');
ok(/id="inv-screen-dept"[^>]*oninput="_syncClientLine\(\)"/.test(src), '部署を入力したら表示を更新する');
ok.done();
