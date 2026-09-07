// tests/login/test-office.js — 事務用アカウント（誰の名前にもならないログイン身分）
const { html, grabFunction, grabConst, fakeStorage, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const grab = (n) => grabFunction(src, n);

const STAFF_KEYS = grabConst(src, 'STAFF_KEYS');
const SUMO_FIGHTERS = grabConst(src, 'SUMO_FIGHTERS');
global.STAFF_KEYS = STAFF_KEYS; global.SUMO_FIGHTERS = SUMO_FIGHTERS;
const OFFICE_LOGIN_KEY = eval(src.match(/const OFFICE_LOGIN_KEY = ('[^']+');/)[1]);
global.OFFICE_LOGIN_KEY = OFFICE_LOGIN_KEY;
global.localStorage = fakeStorage();
eval(grab('_isOfficeLogin')); eval(grab('_loginDisplayName')); eval(grab('_loginGreeting'));

console.log('=== 身分の定義 ===');
ok(OFFICE_LOGIN_KEY === 'office', "キーは 'office'");
ok(!STAFF_KEYS.includes('office'), 'STAFF_KEYS には入れていない（10人のカード・力士の並びを壊さない）');
ok(STAFF_KEYS.length === 10, 'スタッフは10人のまま');

console.log('\n=== ハッシュ表 ===');
const T = eval('(' + src.match(/const STAFF_EMAIL_HASHES = (\{[\s\S]*?\n  \});/)[1] + ')');
eval(grab('_sha256Hex'));
const _EMAIL_SALT = eval(src.match(/const _EMAIL_SALT\s*=\s*(.+?);/)[1]);
const _EMAIL_ROUNDS = eval(src.match(/const _EMAIL_ROUNDS\s*=\s*(\d+);/)[1]);
eval(grab('_emailHash'));
ok(T[_emailHash('info@okinawa-sat.com')] === 'office', 'info@ は office に紐付く');
ok(Object.values(T).filter(v => v === 'office').length === 1, 'office は1件だけ');
ok(Object.values(T).filter(v => v && v !== 'office').every(v => STAFF_KEYS.includes(v)), 'それ以外の紐付け先は全部スタッフ');

console.log('\n=== Googleログイン後の分岐 ===');
const branch = src.slice(src.indexOf("const staffKey = STAFF_EMAIL_HASHES[emailHash]"), src.indexOf("const staffKey = STAFF_EMAIL_HASHES[emailHash]") + 400);
ok(/STAFF_KEYS\.includes\(staffKey\) \|\| staffKey === OFFICE_LOGIN_KEY/.test(branch), 'office は自動ログイン（スタッフ選択画面に行かない）');

console.log('\n=== 起動時の有効ユーザー判定（30分のセッション）===');
global.SESSION_TIMEOUT_MS = 30 * 60 * 1000;
eval(grab('_isSessionValid'));
const now = Date.now();
global.localStorage = fakeStorage({ last_login_name: 'office', last_login_time: String(now - 60000) });
ok(_isSessionValid() === true, 'office は再読み込みしてもログインが続く（1分後）');
global.localStorage = fakeStorage({ last_login_name: 'office', last_login_time: String(now - 31 * 60000) });
ok(_isSessionValid() === false, 'office も30分たてば切れる（スタッフと同じ）');
global.localStorage = fakeStorage({ last_login_name: 'shin', last_login_time: String(now - 60000) });
ok(_isSessionValid() === true, '城間は従来どおり有効');
global.localStorage = fakeStorage({ last_login_name: 'nobody', last_login_time: String(now - 60000) });
ok(_isSessionValid() === false, '知らない名前は従来どおり無効');

console.log('\n=== 表示名と挨拶 ===');
ok(_loginDisplayName('office') === '事務', "office → 「事務」");
ok(_loginDisplayName('shin') === '城間', 'shin → 城間（従来どおり）');
ok(_loginDisplayName('kawasaki') === '川崎', 'kawasaki → 川崎');
ok(_loginDisplayName('zzz') === 'Zzz', '知らない名前は頭文字大文字（従来どおり）');
ok(/事務用アカウントでログイン中/.test(_loginGreeting('office')) && !/おかえり/.test(_loginGreeting('office')), '事務の挨拶は専用（「おかえり、Office！」にならない）');
ok(/おかえり、城間！/.test(_loginGreeting('shin')), 'スタッフの挨拶は従来どおり');
ok(/_loginGreeting\(name\)/.test(grab('loginSuccess')) && /_loginGreeting\(savedName\)/.test(grab('_enterAppForUser')), 'ログイン直後と再読み込み後の両方が同じ挨拶関数を使う');

console.log('\n=== 事務では個人の情報を出さない ===');
let cardDisplay = 'flex';
global.document = { getElementById: (id) => id === 'user-staff-card' ? { style: { set display(v) { cardDisplay = v; }, get display() { return cardDisplay; } } } : null };
global.USER_STAFF = {}; global._fallbackUserStaff = () => null; global._applyCachedWorklog = () => { throw new Error('ここは通らないはず'); };
eval(grab('renderUserStaffCard'));
global.localStorage = fakeStorage({ last_login_name: 'office' });
let threw = false; try { renderUserStaffCard('office'); } catch (e) { threw = true; }
ok(!threw && cardDisplay === 'none', 'ステータスカードは非表示（勤務時間の反映にも進まない）');
const fw = grab('fetchWorklog');
ok(/if \(!staff \|\| !sid \|\| !url\) return;/.test(fw), '勤務時間の取り込みは USER_STAFF に無い名前で即終了（office は取りに行かない）');
eval(grab('_isStaffAdmin')); global.STAFF_ADMIN_KEYS = grabConst(src, 'STAFF_ADMIN_KEYS');
ok(_isStaffAdmin() === false, '事務は管理者ではない（他人の役職は編集できない）');
global.EDITOR_STAFF_KEYS = grabConst(src, 'EDITOR_STAFF_KEYS'); global.getStaffRole = () => '';
eval(grab('_isEditorLoggedIn'));
ok(_isEditorLoggedIn() === false, '事務は編集部扱いではない（機材リストは開いたまま）');

console.log('\n=== スコープ：トップレベル ===');
['_isOfficeLogin', '_loginDisplayName', '_loginGreeting'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル（字下げ ' + (m ? m[1].length : '?') + '）');
});
ok(/^  const OFFICE_LOGIN_KEY = /m.test(src), 'OFFICE_LOGIN_KEY がトップレベル');
ok.done();
