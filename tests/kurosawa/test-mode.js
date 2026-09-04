// tests/kurosawa/test-mode.js — Task 1（モード切替）・Task 2（白黒の膜）
const { html, grabFunction, fakeStorage, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();

console.log('=== モード切替の関数 ===');
let bodyClasses = new Set();
global.document = {
  body: { classList: { add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c), contains: c => bodyClasses.has(c), toggle: (c, on) => { on ? bodyClasses.add(c) : bodyClasses.delete(c); } } },
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.localStorage = fakeStorage();
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, 'applyKurosawaMode'));
eval(grabFunction(src, 'toggleKurosawaMode'));

ok(isKurosawa() === false, '初期状態は OFF');
toggleKurosawaMode();
ok(isKurosawa() === true, '1回押すと ON');
ok(localStorage.getItem('kurosawa_mode') === '1', "保存値は '1'");
ok(bodyClasses.has('kurosawa'), 'body に kurosawa クラスが付く');
toggleKurosawaMode();
ok(isKurosawa() === false, 'もう1回押すと OFF');
ok(localStorage.getItem('kurosawa_mode') === '0', "保存値は '0'");
ok(!bodyClasses.has('kurosawa'), 'body からクラスが消える');

console.log('\n=== 保存値がおかしくても落ちない ===');
['', 'abc', null, '2', 'true'].forEach(v => {
  global.localStorage = fakeStorage(v === null ? {} : { kurosawa_mode: v });
  ok(isKurosawa() === false, "保存値 " + JSON.stringify(v) + " は OFF 扱い");
});
global.localStorage = fakeStorage({ kurosawa_mode: '1' });
ok(isKurosawa() === true, "保存値 '1' だけ ON");

console.log('\n=== 配線 ===');
ok(/id="kz-toggle-btn"/.test(src), 'ボタン #kz-toggle-btn がある');
ok(/onclick="toggleKurosawaMode\(\)"/.test(src), 'ボタンが toggleKurosawaMode を呼ぶ');
ok(src.indexOf('id="kz-toggle-btn"') < src.indexOf('title="データ管理">データ管理</button>'), 'ボタンはデータ管理の左');
const boot = src.slice(src.indexOf("const s = parseFloat(localStorage.getItem('font_scale'))") - 400,
                       src.indexOf("const s = parseFloat(localStorage.getItem('font_scale'))"));
ok(/applyKurosawaMode\(\)/.test(boot), '起動時に applyKurosawaMode() を呼ぶ（font_scale の直前）');
console.log('\n=== 白黒オーバーレイ（2枚構成）===');
const { css } = require('./_extract');
const styles = css(src);
ok(/<div id="kz-overlay" aria-hidden="true"><\/div>/.test(src), '#kz-overlay（白黒化）がある');
ok(/<div id="kz-grain" aria-hidden="true"><\/div>/.test(src), '#kz-grain（粒子・影）がある');
ok(src.indexOf('id="kz-overlay"') < src.indexOf('<div class="phone-frame">'), 'phone-frame より前（外側）にある');
ok(/#kz-overlay,\s*#kz-grain\s*\{\s*display:\s*none;?\s*\}/.test(styles), '既定は2枚とも非表示');
// 1枚目：白黒化だけ
const ov = styles.slice(styles.indexOf('body.kurosawa #kz-overlay'), styles.indexOf('body.kurosawa #kz-grain'));
ok(/position:\s*fixed/.test(ov) && /inset:\s*0/.test(ov), '白黒化の膜：画面全体に固定');
ok(/pointer-events:\s*none/.test(ov), '白黒化の膜：タップを邪魔しない');
ok(/z-index:\s*2147483000/.test(ov), '白黒化の膜：ダイアログより上');
ok(/-webkit-backdrop-filter:\s*grayscale\(1\)/.test(ov), 'Safari 用の -webkit- 付き');
ok(/[^-]backdrop-filter:\s*grayscale\(1\)\s*contrast\(1\.25\)/.test(ov), 'グレースケール＋コントラスト');
ok(!/mix-blend-mode/.test(ov), '白黒化の膜に mix-blend-mode が無い ★同じ要素に付けると Chrome で効かなくなる');
ok(!/opacity/.test(ov), '白黒化の膜に opacity が無い ★同上');
// 2枚目：粒子と影
const gr = styles.slice(styles.indexOf('body.kurosawa #kz-grain'), styles.indexOf('.phone-frame {'));
ok(/z-index:\s*2147483001/.test(gr), '粒子の膜は白黒化の膜より上');
ok(/pointer-events:\s*none/.test(gr), '粒子の膜：タップを邪魔しない');
ok(/feTurbulence/.test(gr), '粒子（feTurbulence）がある');
ok(/radial-gradient/.test(gr), '四隅の影がある');
ok(/mix-blend-mode:\s*multiply/.test(gr) && /opacity:\s*\.55/.test(gr), '粒子の膜に multiply と opacity .55');
ok(!/backdrop-filter/.test(gr), '粒子の膜に backdrop-filter は無い（役割を混ぜない）');
ok(/@media print[\s\S]*#kz-overlay,\s*#kz-grain\s*\{\s*display:\s*none\s*!important/.test(styles), '印刷時は2枚とも消える');
console.log('\n=== スコープ：ボタンから呼べる位置（トップレベル）にあるか ===');
// 2026-09-04 の不具合：applyFontScale() の中に定義してしまい onclick から見えなかった。
// トップレベル関数はこのファイルでは2スペース字下げ。4スペース以上なら何かの関数の中。
['isKurosawa', 'applyKurosawaMode', 'toggleKurosawaMode'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル（字下げ ' + (m ? m[1].length : '?') + '）');
});
ok(!/applyKurosawaMode\(\)/.test(src.slice(0, src.indexOf('function isKurosawa'))) || true, '（参考）定義より前の呼び出しは関数宣言の巻き上げで動く');
ok.done();
