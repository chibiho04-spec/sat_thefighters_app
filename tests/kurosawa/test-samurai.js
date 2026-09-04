// tests/kurosawa/test-samurai.js — ホーム上部の川崎会長が KUROSAWA mode で浪人になる（CSS）
const { html, css, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();
const styles = css(src);

console.log('=== ホーム上部の川崎会長（CSSキャラ）===');
ok(/<div class="character">\s*<div class="char-head"><\/div>\s*<div class="char-body"><\/div>/.test(src), 'キャラは .character > .char-head / .char-body の構成');
ok(/<div class="char-name-tag">▶ 川崎会長<\/div>/.test(src), '名前タグ「▶ 川崎会長」がある');

const kz = styles.slice(styles.indexOf('KUROSAWA mode：ホーム上部の川崎会長を浪人に'), styles.indexOf('.phone-frame {'));
ok(kz.length > 0, '浪人用の CSS ブロックがある');
ok(/body\.kurosawa \.character::before[\s\S]*?content:\s*''/.test(kz), 'ちょんまげ（.character::before）');
ok(/body\.kurosawa \.char-body\s*\{[\s\S]*?background:\s*#2c2c2c/.test(kz), '着物は暗い色');
ok(/border-bottom:\s*5px solid #6a6a6a/.test(kz), '帯（border-bottom）');
ok(/body\.kurosawa \.char-body::after[\s\S]*?width:\s*6px/.test(kz), '襟は細い白');
ok(/body\.kurosawa \.char-leg[\s\S]*?background:\s*#3a3a3a/.test(kz), '袴');
ok(/body\.kurosawa \.character::after[\s\S]*?rotate\(14deg\)/.test(kz), '腰の刀（斜め）');
ok(/box-shadow:\s*0 25px 0 0 #5a3a1a/.test(kz), '刀の柄（下にずらした茶色）');

console.log('\n=== 通常時には影響しない ===');
const normal = styles.slice(0, styles.indexOf('KUROSAWA mode：ホーム上部の川崎会長を浪人に'));
ok(!/\.character::before|\.character::after/.test(normal), '通常の .character に ::before/::after は無い（浪人の部品が常時出ない）');
ok(kz.split('body.kurosawa').length - 1 >= 6, '浪人の指定はすべて body.kurosawa 配下（' + (kz.split('body.kurosawa').length - 1) + '件）');
ok(!/^\s*\.char-|^\s*\.character/m.test(kz), 'body.kurosawa の付いていない .char- 指定が混ざっていない');

console.log('\n=== スタッフ一覧側の差し替えは残っていない（取り消し済み）===');
ok(!/hat === 'samurai'/.test(src), "makePixelChar に 'samurai' 分岐が無い");
ok(!/function _charPalette/.test(src), '_charPalette が無い');
ok(/makePixelChar\(fighter\.palette\)/.test(src), 'スタッフ一覧のアバターは元の呼び方に戻っている');
ok.done();
