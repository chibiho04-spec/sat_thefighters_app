// tests/media/test-form.js — 記入欄の流し込みと回収（最小の擬似DOMで実際の関数を動かす）
const S = require('./_setup');
const ok = S.makeOk();
// _rawMediaCards が参照する定数（test-cards.js と同じ流し込み方）
S.loadConst('_DEFAULT_MEDIA_CARDS');
global.MEDIA_CARDS_CONFIG_KEY = 'mediaCards';
S.load(['_isValidMediaCardId', '_rawMediaCards', 'getMediaCards', '_saveMediaCards', '_addMediaCard', '_mediaCardChoices', '_normalizeMedia', '_mediaHasRecord',
        '_mediaFormRowsHtml', '_mediaBtn', '_renderMediaCardGroup', '_getMediaCardSel', '_afterMediaChange', '_toggleMediaCard', '_copyMediaOutToUsed',
        '_promptNewMediaCard', '_addMediaCardFromForm',
        '_renderMediaNameGroup', '_pickMediaName', '_onMediaNameInput', '_renderMediaBuGroup', '_pickMediaBu', '_getMediaBu', '_renderMediaForm', '_collectMediaForm']);

// ---- 最小の擬似DOM：innerHTML に書かれた <button ...> を要素として持つ ----
function makeEl(id) {
  const el = { id, value: '', dataset: {}, _children: [], _html: '' };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (h) => { el._html = h; el._children = []; h.replace(/<button([^>]*)>([\s\S]*?)<\/button>/g, (_, attrs, text) => {
      const b = { tagName: 'BUTTON', textContent: text.replace(/<[^>]+>/g, ''), dataset: {}, _cls: new Set() };
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || ''; cls.split(/\s+/).filter(Boolean).forEach(c => b._cls.add(c));
      attrs.replace(/data-([a-z]+)="([^"]*)"/g, (__, k, v) => { b.dataset[k] = v; });
      b.classList = { add: c => b._cls.add(c), remove: c => b._cls.delete(c), contains: c => b._cls.has(c),
        toggle: (c, on) => { if (on === undefined) on = !b._cls.has(c); on ? b._cls.add(c) : b._cls.delete(c); return on; } };
      el._children.push(b); return ''; }); }
  });
  el.querySelectorAll = sel => el._children.filter(b => sel.split('.').filter(Boolean).every(c => b._cls.has(c)));
  el.querySelector = sel => el.querySelectorAll(sel)[0] || null;
  return el;
}
// 擬似DOM の要素は、実際の記入欄 HTML（_mediaFormRowsHtml）から id を拾って作る（HTML と JS の id が本当に一致することを検証）
const els = {};
function buildFormEls(prefix, screenId) {
  const html = _mediaFormRowsHtml(prefix, screenId);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  ids.forEach(id => { els[id] = makeEl(id); });
  els[prefix + '-body'] = makeEl(prefix + '-body');
  return ids;
}
global.document = { getElementById: id => els[id] || null, querySelectorAll: () => [] };
global.localStorage = S.fakeStorage();
const ids = buildFormEls('wsd-media', 'ws-detail-screen');
ok(['date','out-group','used-group','user-group','user','bu-group','buby-group','buby','return-group','return','memo'].every(s => ids.includes('wsd-media-' + s)), 'HTML に必要な id が全部ある: ' + ids.join(','));

console.log('=== 流し込み → 回収 ===');
const src = { date: '2026/08/17', out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], user: '城間', bu: true, buBy: '平岡', returnBy: '城間', memo: '約80GB' };
_renderMediaForm('wsd-media', src, 'ws-detail-screen');
ok(els['wsd-media-body'].dataset.built === 'ws-detail-screen' && /wsd-media-out-group/.test(els['wsd-media-body'].innerHTML), 'body に記入欄の HTML が入る');
ok(els['wsd-media-out-group']._children.filter(b => b._cls.has('selected')).map(b => b.dataset.card).join(',') === 'CF160_1,CF160_2', '持ち出しの選択が付く');
ok(els['wsd-media-out-group']._children.length === 7, 'カード6枚＋「＋ 追加」');
ok(els['wsd-media-used-group']._children.length === 6, '使用側に「＋ 追加」は無い');
ok(els['wsd-media-user'].value === '城間' && els['wsd-media-user-group']._children.find(b => b.textContent === '城間')._cls.has('selected'), '使用者はボタンと入力欄の両方に出る');
ok(_getMediaBu('wsd-media') === true, 'BU ○ が選ばれている');
const back = _collectMediaForm('wsd-media');
ok(JSON.stringify(back) === JSON.stringify(_normalizeMedia(src)), '回収した値が元と同じ: ' + JSON.stringify(back));

console.log('\n=== ボタン操作 ===');
_toggleMediaCard(els['wsd-media-out-group']._children[2], 'wsd-media', 'ws-detail-screen'); // CF160_3 を追加
ok(_collectMediaForm('wsd-media').out.join(',') === 'CF160_1,CF160_2,CF160_3', 'カードをタップで追加');
_copyMediaOutToUsed('wsd-media', 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').used.join(',') === 'CF160_1,CF160_2,CF160_3', '「持ち出しと同じ」');
const kawasaki = els['wsd-media-return-group']._children.find(b => b.textContent === '川崎');
_pickMediaName(kawasaki, 'wsd-media', 'return', 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').returnBy === '川崎', '名前ボタンで入力欄が変わる');
_pickMediaName(kawasaki, 'wsd-media', 'return', 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').returnBy === '', 'もう一度押すと解除（返却未）');
els['wsd-media-buby'].value = '外注さん'; _onMediaNameInput('wsd-media', 'buby');
ok(_collectMediaForm('wsd-media').buBy === '外注さん' && !els['wsd-media-buby-group']._children.some(b => b._cls.has('selected')), '直接入力ならボタンの選択は外れる');
_pickMediaBu(els['wsd-media-bu-group']._children[0], 'wsd-media', 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').bu === false, 'BU を「未」に戻せる');

console.log('\n=== 「＋ 追加」 ===');
let answers = ['CF256_3', 'CFexpress Type A 256GB']; global.prompt = () => answers.shift();
_addMediaCardFromForm('wsd-media', 'ws-detail-screen');
ok(getMediaCards().some(c => c.id === 'CF256_3'), '共有のカード一覧に足される');
ok(_collectMediaForm('wsd-media').out.includes('CF256_3'), '持ち出しに選択済みで現れる');
ok(els['wsd-media-used-group']._children.some(b => b.dataset.card === 'CF256_3') && !_collectMediaForm('wsd-media').used.includes('CF256_3'), '使用側にはボタンだけ増える（未選択）');
answers = ['', '']; const before = getMediaCards().length; _addMediaCardFromForm('wsd-media', 'ws-detail-screen');
ok(getMediaCards().length === before, '空で返せば何もしない');

console.log('\n=== 空の記録 ===');
_renderMediaForm('wsd-media', null, 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').out.length === 0 && _collectMediaForm('wsd-media').bu === false && els['wsd-media-user'].value === '', '空の記録は全部空');

console.log('\n=== 未構築なら null（空で潰さない） ===');
ok(_collectMediaForm('nope-media') === null, '要素が無ければ null');
delete els['wsd-media-body'].dataset.built; els['wsd-media-body'].innerHTML = '';
ok(_collectMediaForm('wsd-media') === null, 'body が未構築なら null');
_renderMediaForm('wsd-media', { out: ['CF160_1'] }, 'ws-detail-screen');
ok(els['wsd-media-body'].dataset.built === 'ws-detail-screen' && _collectMediaForm('wsd-media').out.join(',') === 'CF160_1', '描き直せば回収できる（built には screenId）');
_renderMediaForm('wsd-media', { out: ['CF160_1'] }, 'other-screen');
ok(els['wsd-media-body'].dataset.built === 'other-screen', '別の screenId で呼ばれたら作り直す');

console.log('\n=== dirty の通知先 ===');
_calls.markDirty = [];
_renderMediaForm('wsd-media', null, 'ws-detail-screen');
_toggleMediaCard(els['wsd-media-out-group']._children[0], 'wsd-media', 'ws-detail-screen');
_copyMediaOutToUsed('wsd-media', 'ws-detail-screen');
_pickMediaName(els['wsd-media-user-group']._children[0], 'wsd-media', 'user', 'ws-detail-screen');
_pickMediaBu(els['wsd-media-bu-group']._children[1], 'wsd-media', 'ws-detail-screen');
ok(_calls.markDirty.length === 4 && _calls.markDirty.every(id => id === 'ws-detail-screen'), 'ボタン操作4種が ws-detail-screen を dirty にする: ' + _calls.markDirty.join(','));

console.log('\n=== 簡易WS の prefix（sw-media）でも同じ ===');
buildFormEls('sw-media', 'new-simple-ws-screen');
_calls.markDirty = [];
_renderMediaForm('sw-media', { out: ['CF160_2'], used: ['CF160_2'], user: '上原', bu: false, returnBy: '' }, 'new-simple-ws-screen');
const sw = _collectMediaForm('sw-media');
ok(sw && sw.out.join(',') === 'CF160_2' && sw.user === '上原' && sw.bu === false, 'sw-media で流し込み→回収');
_toggleMediaCard(els['sw-media-used-group']._children[0], 'sw-media', 'new-simple-ws-screen');
ok(_calls.markDirty.join(',') === 'new-simple-ws-screen', 'sw-media の操作は new-simple-ws-screen を dirty にする');

console.log('\n=== 廃棄カード（DOM 層） ===');
global.localStorage = S.fakeStorage({ app_config_records: JSON.stringify([{ 'キー': 'mediaCards', list: [{ id: 'CF160_1' }, { id: 'CF160_2', retired: true }] }]) });
_renderMediaForm('wsd-media', { out: ['CF160_2', 'OLD_9'] }, 'ws-detail-screen');
const outIds = els['wsd-media-out-group']._children.filter(b => b.dataset.card).map(b => b.dataset.card);
ok(outIds.join(',') === 'CF160_1,CF160_2,OLD_9', '廃棄済みでも選択済みなら出る・一覧に無い id は末尾: ' + outIds.join(','));
ok(_collectMediaForm('wsd-media').out.join(',') === 'CF160_2,OLD_9', '選択状態も保たれる');
_renderMediaForm('wsd-media', null, 'ws-detail-screen');
ok(els['wsd-media-out-group']._children.filter(b => b.dataset.card).map(b => b.dataset.card).join(',') === 'CF160_1', '何も選んでいなければ廃棄カードは出ない');
ok.done();
