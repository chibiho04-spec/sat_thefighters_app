// tests/invoice/test-tax-kind.js — 明細の税区分に「不課税」を追加（2026-10-05）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
['_taxSelValue', '_taxLabel', '_taxKindOfRow'].forEach(n => (0, eval)(grabFunction(src, n)));

console.log('=== 区分の対応 ===');
ok(_taxSelValue({}) === '1' && _taxLabel({}) === '課税' && _taxLabel({ taxable: true }) === '課税', '既定は課税');
ok(_taxSelValue({ taxable: false }) === '0' && _taxLabel({ taxable: false }) === '非課税', '今までの非課税データはそのまま非課税');
ok(_taxSelValue({ taxable: false, taxKind: 'fuka' }) === '2' && _taxLabel({ taxable: false, taxKind: 'fuka' }) === '不課税', '不課税');
ok(_taxLabel({ taxable: true, taxKind: 'fuka' }) === '課税', '課税なら taxKind が残っていても課税');
console.log('\n=== 行から読む ===');
const row = (sel, span) => ({ querySelector: q => q === '.inv-line-tax' ? (sel == null ? null : { value: sel }) : (span == null ? null : { textContent: span }) });
ok(_taxKindOfRow(row('2')) === 'fuka' && _taxKindOfRow(row('0')) === '' && _taxKindOfRow(row('1')) === '', '編集中は select の値');
ok(_taxKindOfRow(row(null, ' 不課税 ')) === 'fuka' && _taxKindOfRow(row(null, '非課税')) === '' && _taxKindOfRow(row(null, null)) === '', '閲覧専用は表示の文字');

console.log('\n=== 画面 ===');
ok(/<option value="0">非課税<\/option>\s*<option value="2">不課税<\/option>/.test(src), '明細の編集画面：非課税の下に不課税');
ok((src.match(/<option value="2"[^>]*>不課税<\/option>/g) || []).length === 3, '選択肢は3か所（編集モーダル・行の2種）に入っている');
const save = grabFunction(src, 'saveInvLineModal');
ok(/taxable:   document\.getElementById\('inv-modal-tax'\)\.value === '1',/.test(save) && /taxKind:   document\.getElementById\('inv-modal-tax'\)\.value === '2' \? 'fuka' : ''/.test(save), '不課税は「税なし」として保存し、区分を別に持つ');

console.log('\n=== 計算は非課税と同じ（消費税が掛からない） ===');
const calc = grabFunction(src, 'calcInvTotal');
ok(/const taxable = taxEl \? \(taxEl\.value === '1'\)/.test(calc) && /!\/\^\(非課税\|不課税\)\$\/\.test\(taxTextEl\.textContent\.trim\(\)\)/.test(calc), '合計：select が 1 のときだけ課税。閲覧表示の「不課税」も税なし扱い');
ok(!/textContent\.trim\(\) !== '非課税'/.test(src) && !/textContent\?\.trim\(\) !== '非課税'/.test(src), '「非課税という文字でなければ課税」の古い判定が残っていない（不課税が課税扱いにならない）');
ok(/\(l && l\.taxable === false\) \? s : s \+/.test(grabFunction(src, '_calcCaseSales')), '売上表：taxable:false は税の対象外（不課税も同じ）');

console.log('\n=== 保存・表示・印刷に区分が残る ===');
ok((src.match(/taxKind: _taxKindOfRow\(tr\)/g) || []).length === 3, '明細を集める3か所すべてで区分を保存');
ok((src.match(/taxable: l\.taxable !== false, taxKind: l\.taxKind \|\| ''/g) || []).length === 2, 'テンプレート保存・納品書化でも区分を引き継ぐ');
ok(/_taxKindOfRow\(tr\) === 'fuka' \? '不課税' : '非課税'/.test(grabFunction(src, 'buildDocHTML')), '書類の備考欄の印は 不課税／非課税 を出し分ける');
ok(/tax-off">' \+ _taxLabel\(l\) \+ '<\/span>/.test(src), '明細カードのバッジも出し分ける');
ok.done();
