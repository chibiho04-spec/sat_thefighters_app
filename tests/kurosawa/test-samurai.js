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
ok(/body\.kurosawa \.character\s*\{\s*transform:\s*scale\(0\.85\);\s*transform-origin:\s*bottom center/.test(kz), 'キャラを足元基準で 0.85 に縮めて頭上に余白を作る');
ok(/@media \(min-width: 769px\)\s*\{\s*body\.kurosawa \.character\s*\{\s*transform:\s*scale\(0\.6\);\s*transform-origin:\s*bottom left/.test(kz), 'デスクトップは元の 0.7 に合わせて 0.6・左下基準');
// 月代：てっぺんは肌、髪は左右の側頭だけ
const hair = kz.slice(kz.indexOf('body.kurosawa .char-head::before'), kz.indexOf('body.kurosawa .character::before'));
ok(/top:\s*2px;\s*left:\s*-2px;\s*width:\s*5px;\s*height:\s*12px/.test(hair), '髪は左側頭の細い縦長（5×12）＝頭のてっぺんは肌が見える（月代）');
ok(/border:\s*0/.test(hair), '髪の枠線は消す（元の2px枠が太らせない）');
ok(/box-shadow:\s*21px 0 0 0 #1a0e08/.test(hair), '右側頭にも同じ形（左右対称）');
ok(!/width:\s*26px/.test(hair), '元の横長ブロック（26px）は使わない ★リーゼントに見えた原因');
// 髷：頭頂に立つ小さな束
const mage = kz.slice(kz.indexOf('body.kurosawa .character::before'), kz.indexOf('body.kurosawa .char-body {'));
ok(/content:\s*''/.test(mage), '髷（.character::before）');
ok(/top:\s*-7px;\s*left:\s*18px;\s*width:\s*4px;\s*height:\s*9px/.test(mage), '髷は頭頂中央に立つ細い束（4×9・x18＝頭の中心）');
ok(/border-radius:\s*2px 2px 0 0/.test(mage), '束の先を少し丸める');
ok(!/box-shadow/.test(mage), '髷にコピー（横の束・結び目）は付けない');
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
