// tests/staff/test-names.js — スタッフの下の名前を公式サイト（okinawa-sat.com/staff.html）に合わせる（2026-09-17）
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();

// サイト掲載の氏名（2026-09-17 取得）。平岡はサイトに無い。
const SITE = {
  kawasaki: ['哲也', 'Tetsuya Kawasaki'], uehara: ['覚史', 'Masura Uehara'], morita: ['祥悟', 'Shogo Morita'],
  kawano: ['健治', 'Kenji Kawano'], shin: ['心', 'Shin Shiroma'], arasaki: ['盛斗', 'Morito Arasaki'],
  hazama: ['世', 'Sei Hazama'], matsuda: ['広一', 'Hirokazu Matsuda'], kamiji: ['博隆', 'Hirotaka Uechi'],
};

global.STAFF_KEYS = grabConst(src, 'STAFF_KEYS');
// _defaultStaffMaster は複数行の配列なので grabConst の非貪欲一致では最初の { } で切れる。全体を切り出す。
const defSrc = src.match(/const _defaultStaffMaster = (\[[\s\S]*?\n  \]);/)[1];
const _defaultStaffMaster = eval('(' + defSrc + ')');
global._defaultStaffMaster = _defaultStaffMaster;
global._STAFF_NAME_FIX = eval('(' + src.match(/const _STAFF_NAME_FIX = (\{[\s\S]*?\n  \});/)[1] + ')');
eval(grabFunction(src, '_fixStaffName'));
eval(grabFunction(src, 'loadStaffMaster'));

console.log('=== 既定値がサイトと一致 ===');
ok(_defaultStaffMaster.length === 10, '既定は10人（平岡を含む）');
Object.keys(SITE).forEach(k => {
  const d = _defaultStaffMaster.find(s => s.key === k);
  ok(!!d && d.firstName === SITE[k][0] && d.english === SITE[k][1], k + ': ' + (d ? d.name + ' ' + d.firstName + ' / ' + d.english : '見つからない'));
});
ok(_defaultStaffMaster.find(s => s.key === 'hazama').name === '玻座真', '玻座真の漢字（座・真）がサイトと同じ');
ok(_defaultStaffMaster.find(s => s.key === 'hiraoka').firstName === '誠', '平岡はそのまま残す');

console.log('\n=== 端末・シートに残った古い名前を読み込み時に直す ===');
const OLD = { uehara: ['健二', 'Kenji Uehara'], kawano: ['大輔', 'Daisuke Kawano'], arasaki: ['博', 'Hiroshi Arasaki'],
  hazama: ['光', 'Hikaru Hazama'], morita: ['直人', 'Naoto Morita'], kamiji: ['剛', 'Tsuyoshi Uechi'], matsuda: ['義明', 'Yoshiaki Matsuda'] };
const saved = _defaultStaffMaster.map(s => Object.assign({}, s, OLD[s.key] ? { firstName: OLD[s.key][0], english: OLD[s.key][1] } : {}));
saved.find(s => s.key === 'morita').role = '編集チーフ'; // 本人が編集した他の項目は保持されること
global.localStorage = fakeStorage({ staff_master: JSON.stringify(saved) });
const list = loadStaffMaster();
Object.keys(OLD).forEach(k => {
  const s = list.find(x => x.key === k);
  ok(s.firstName === SITE[k][0] && s.english === SITE[k][1], k + ': 古い「' + OLD[k][0] + '」→「' + s.firstName + '」');
});
ok(list.find(x => x.key === 'morita').role === '編集チーフ', '名前以外の編集内容（職種）は消えない');
ok(list.find(x => x.key === 'kawasaki').firstName === '哲也', '元から正しい人は変わらない');

console.log('\n=== 本人が別の名前に編集していた場合は尊重 ===');
const custom = _defaultStaffMaster.map(s => Object.assign({}, s));
custom.find(s => s.key === 'uehara').firstName = '覚史（かくし）';
global.localStorage = fakeStorage({ staff_master: JSON.stringify(custom) });
ok(loadStaffMaster().find(x => x.key === 'uehara').firstName === '覚史（かくし）', '一覧に無い値はそのまま');
const blank = _defaultStaffMaster.map(s => Object.assign({}, s));
blank.find(s => s.key === 'kawano').firstName = ''; blank.find(s => s.key === 'kawano').english = '';
global.localStorage = fakeStorage({ staff_master: JSON.stringify(blank) });
ok(loadStaffMaster().find(x => x.key === 'kawano').firstName === '健治', '空欄なら正しい名前を入れる');

console.log('\n=== 保存データが無いとき ===');
global.localStorage = fakeStorage();
ok(loadStaffMaster().find(x => x.key === 'matsuda').firstName === '広一', '既定値がそのまま出る');

console.log('\n=== 置き場所（トップレベル） ===');
['_fixStaffName', 'loadStaffMaster'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル');
});
ok.done();
