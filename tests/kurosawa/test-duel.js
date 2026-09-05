// tests/kurosawa/test-duel.js — Task 5（相撲 → 斬り合いの読み替え）
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();

console.log('=== 技テーブル：相撲と斬り合いが同じ添字＝同じ倍率 ===');
const SUMO_TECHNIQUES = grabConst(src, 'SUMO_TECHNIQUES');
const SUMO_TECH_POWER = grabConst(src, 'SUMO_TECH_POWER');
const KZ_TECHNIQUES   = grabConst(src, 'KZ_TECHNIQUES');
const KZ_TECH_POWER   = grabConst(src, 'KZ_TECH_POWER');
ok(KZ_TECHNIQUES.length === 10 && SUMO_TECHNIQUES.length === 10, '両方10件');
ok(new Set(KZ_TECHNIQUES).size === 10, '斬り合いの技名に重複なし');
KZ_TECHNIQUES.forEach((t, i) => {
  const s = SUMO_TECHNIQUES[i];
  ok(KZ_TECH_POWER[t] === SUMO_TECH_POWER[s], (i + 1) + '. ' + s + ' ' + SUMO_TECH_POWER[s] + ' = ' + t + ' ' + KZ_TECH_POWER[t]);
});
ok(KZ_TECH_POWER['一閃'] === 1.6, '一閃が一発逆転（1.6）');
const expected = ['袈裟斬り','突き','逆袈裟','唐竹割り','胴払い','受け流し','小手打ち','抜刀術','一閃','燕返し'];
ok(JSON.stringify(KZ_TECHNIQUES) === JSON.stringify(expected), '設計書どおりの10技');

console.log('\n=== 切替関数 ===');
global.localStorage = fakeStorage();
global.SUMO_TECHNIQUES = SUMO_TECHNIQUES; global.SUMO_TECH_POWER = SUMO_TECH_POWER;
global.KZ_TECHNIQUES = KZ_TECHNIQUES;     global.KZ_TECH_POWER = KZ_TECH_POWER;
global.SUMO_WORDS = grabConst(src, 'SUMO_WORDS'); global.KZ_WORDS = grabConst(src, 'KZ_WORDS');
eval(grabFunction(src, 'isKurosawa'));
eval(grabFunction(src, '_techList')); eval(grabFunction(src, '_techPower')); eval(grabFunction(src, '_words'));
ok(_techList() === SUMO_TECHNIQUES && _techPower() === SUMO_TECH_POWER, 'OFF：相撲のテーブル');
ok(_words().title === '🏟️ 大相撲 SUMO', 'OFF：相撲の言葉');
localStorage.setItem('kurosawa_mode', '1');
ok(_techList() === KZ_TECHNIQUES && _techPower() === KZ_TECH_POWER, 'ON：斬り合いのテーブル');
ok(_words().title === '⚔️ 決闘 KETTO' && _words().east === '東 武士' && _words().start === '⚔️ いざ尋常に！', 'ON：斬り合いの言葉');
ok(_words().badge === 'KETTO' && _words().navIcon === '⚔️' && _words().navLabel === 'KETTO', 'ON：バッジとナビが KETTO');
ok(_words().miss === '空を斬る！' && /一刀両断/.test(_words().crit) && /下剋上/.test(_words().upset), 'ON：実況の言葉');
['title','east','west','start','miss','crit','upset','end','badge','referee','navIcon','navLabel'].forEach(k =>
  ok(typeof SUMO_WORDS[k] === 'string' && typeof KZ_WORDS[k] === 'string', '言葉 ' + k + ' が両方にある'));

console.log('\n=== 直書きが残っていないか ===');
const turn = grabFunction(src, 'sumoTurn'), fin = grabFunction(src, 'sumoFinish'), start = grabFunction(src, 'startSumo'), dmg = grabFunction(src, 'sumoCalcDamage');
ok(!/SUMO_TECHNIQUES\[/.test(turn) && /_techList\(\)/.test(turn), 'sumoTurn は _techList() を使う');
ok(!/SUMO_TECH_POWER\[/.test(dmg) && /_techPower\(\)/.test(dmg), 'sumoCalcDamage は _techPower() を使う');
ok(!/空振り！/.test(turn) && !/会心の一撃/.test(turn) && !/金星/.test(turn), 'sumoTurn に相撲の直書きが無い');
ok(!/はっけよい/.test(start), 'startSumo に「はっけよい」の直書きが無い');
ok(!/'勝負あり！'/.test(fin), 'sumoFinish に「勝負あり！」の直書きが無い');

console.log('\n=== 画面の id と差し替え関数 ===');
['sumo-title','sumo-east-label','sumo-west-label','sumo-start-btn','sumo-badge'].forEach(id => ok(new RegExp('id="' + id + '"').test(src), 'id ' + id + ' がある'));
ok(/function _applySumoWords/.test(src), '_applySumoWords がある');
ok(/_applySumoWords\(\)/.test(grabFunction(src, 'applyKurosawaMode')), 'applyKurosawaMode が _applySumoWords を呼ぶ');

console.log('\n=== スコープ：トップレベルにあるか（Task 1 の教訓）===');
['_techList', '_techPower', '_words', '_applySumoWords'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル（字下げ ' + (m ? m[1].length : '?') + '）');
});
ok.done();
