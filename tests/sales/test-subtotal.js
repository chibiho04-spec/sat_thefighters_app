// tests/sales/test-subtotal.js — 売上表に税抜の総額を出す（2026-10-05）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const scr = grabFunction(src, 'renderSalesScreen');

console.log('=== 画面：全体 ===');
ok(/const sumSubtotal    = countedItems\.reduce\(\(s, it\) => s \+ \(Number\(it\.subtotal\) \|\| 0\), 0\);/.test(scr), '税抜合計は「請求済み」の案件だけを足す（請求合計と同じ対象）');
ok(/const sumTax         = countedItems\.reduce/.test(scr), '消費税の合計も同じ対象');
ok(/id="sales-subtotal-line"[\s\S]*?税抜合計 <b[^>]*>\$\{fmt\(sumSubtotal\)\}<\/b>[\s\S]*?消費税 \$\{fmt\(sumTax\)\}[\s\S]*?税込（請求合計） \$\{fmt\(sumTotal\)\}/.test(scr), '税抜合計・消費税・税込を並べて表示');
console.log('\n=== 画面：月ごと ===');
ok(/const grpSub  = grpBilled\.reduce/.test(scr) && /税抜 \$\{fmt\(grpSub\)\}/.test(scr), '月の見出しにも税抜を表示');
console.log('\n=== PDF の合計行 ===');
const i = src.indexOf("const sumSubtotal  = filtered.reduce");
const pdf = src.slice(i, i + 700);
ok(i > 0 && /<td colspan="4">合計/.test(pdf) && /yen\(sumSubtotal\)[\s\S]*yen\(sumTax\)[\s\S]*yen\(sumTotal\)/.test(pdf), '合計行に 税抜額・消費税・合計 の順で入る（列の位置が見出しと合う）');
const cols = src.slice(src.lastIndexOf('const cols = [', i), i).match(/h:'([^']+)'/g).map(x => x.slice(3, -1));
ok(cols.slice(0, 7).join(',') === '受注No,作業日,取引先,件名,税抜額,消費税,合計', '見出しの5〜7列目が 税抜額・消費税・合計: ' + cols.join(','));
console.log('\n=== 税抜＋消費税＝合計 が成り立つ作り ===');
const calc = grabFunction(src, '_calcCaseSales');
ok(/const total    = \(subtotal - discount\) \+ tax;/.test(calc) && /const subtotalNet = subtotal - discount;/.test(calc) && /subtotal: subtotalNet, tax, total,/.test(calc), '請求書あり：税抜（値引き後）＋消費税＝合計');
ok(/subtotal = oa;\s*tax      = Math\.floor\(oa \* 0\.1\);\s*total    = oa \+ tax;/.test(src), '請求書なし（受注金額から計上）：同じく成り立つ');
ok.done();
