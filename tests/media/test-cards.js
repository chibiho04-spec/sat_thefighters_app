// tests/media/test-cards.js — カードの一覧（既定・追加・廃棄・選択肢）
const S = require('./_setup');
const ok = S.makeOk();
S.loadConst('_DEFAULT_MEDIA_CARDS');
S.load(['_isValidMediaCardId', 'getMediaCards', '_saveMediaCards', '_addMediaCard', '_setMediaCardRetired', '_mediaCardChoices']);
global.MEDIA_CARDS_CONFIG_KEY = 'mediaCards';

console.log('=== 既定 ===');
global.localStorage = S.fakeStorage();
ok(_DEFAULT_MEDIA_CARDS.length === 6, '既定は6枚');
ok(_DEFAULT_MEDIA_CARDS.map(c => c.id).join(',') === 'CF160_1,CF160_2,CF160_3,CF160_4,CF256_1,CF256_2', 'id が bot と同じ形式');
ok(getMediaCards().length === 6 && getMediaCards()[4].type === 'CFexpress Type A 256GB', '設定が無ければ既定が出る');

console.log('\n=== 設定があればそれを使う ===');
global.localStorage = S.fakeStorage({ app_config_records: JSON.stringify([{ 'キー': 'mediaCards', list: [{ id: 'SD64_1', type: 'SD 64GB', retired: false }, { id: 'bad id', type: '' }] }]) });
ok(getMediaCards().length === 1 && getMediaCards()[0].id === 'SD64_1', '設定の一覧が出る（形式違いの id は捨てる）');
global.localStorage = S.fakeStorage({ app_config_records: JSON.stringify([{ 'キー': 'orderTypes', list: ['配信'] }]) });
ok(getMediaCards().length === 6, '別キーの設定しか無ければ既定');

console.log('\n=== 追加 ===');
global.localStorage = S.fakeStorage(); _calls.push = []; _calls.pendingAdd = [];
ok(_isValidMediaCardId('CF256_3') && !_isValidMediaCardId('CF 256') && !_isValidMediaCardId('') && !_isValidMediaCardId('a'.repeat(21)), 'id の形式チェック');
let r = _addMediaCard('CF256_3', 'CFexpress Type A 256GB');
ok(r.ok && r.card.id === 'CF256_3', '追加できる');
ok(getMediaCards().length === 7 && getMediaCards()[6].id === 'CF256_3', '既定6枚＋1で保存される');
ok(JSON.parse(localStorage.getItem('app_config_records')).some(x => x['キー'] === 'mediaCards'), 'config レコードに書かれる');
ok(_calls.pendingAdd.some(c => c.kind === 'config' && c.id === 'mediaCards'), 'URL未設定なら未送信キューへ');
r = _addMediaCard('CF256_3', '');
ok(!r.ok && /既に/.test(r.error), '重複は拒否');
r = _addMediaCard('CF 1', '');
ok(!r.ok && /英数字/.test(r.error), '形式違いは拒否');
ok(getMediaCards().filter(c => c.id === 'CF256_3').length === 1, '拒否されたときは増えない');

console.log('\n=== 廃棄／復活 ===');
ok(_setMediaCardRetired('CF160_4', true) && getMediaCards().find(c => c.id === 'CF160_4').retired === true, '廃棄できる');
ok(_setMediaCardRetired('CF160_4', false) && getMediaCards().find(c => c.id === 'CF160_4').retired === false, '復活できる');
ok(_setMediaCardRetired('NOPE', true) === false, '無い id は false');

console.log('\n=== 選択ボタンに出すカード ===');
_setMediaCardRetired('CF160_4', true);
let ch = _mediaCardChoices([]);
ok(!ch.some(c => c.id === 'CF160_4'), '廃棄カードは出ない');
ch = _mediaCardChoices(['CF160_4']);
ok(ch.some(c => c.id === 'CF160_4'), '既に選ばれていれば廃棄でも出る');
ch = _mediaCardChoices(['OLD_9']);
ok(ch.some(c => c.id === 'OLD_9' && c.retired), '一覧に無い id が選ばれていれば末尾に出る');
ok(_mediaCardChoices(['CF160_1']).findIndex(c => c.id === 'CF160_1') === 0, '順番は一覧の順');
ok.done();
