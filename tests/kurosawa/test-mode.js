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
ok.done();
