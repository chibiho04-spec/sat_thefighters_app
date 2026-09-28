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
const els = {};
global.document = { getElementById: id => { if (!(id in els)) { if (!/^wsd-media-/.test(id)) return null; els[id] = makeEl(id); } return els[id]; }, querySelectorAll: () => [] };
global.localStorage = S.fakeStorage();
global._markDirty = () => {};
// body に流し込むと中の要素が生える仕組みは無いので、_mediaFormRowsHtml の id を全部 makeEl で用意する
['date','out-group','used-group','user-group','user','bu-group','buby-group','buby','return-group','return','memo','body'].forEach(s => { els['wsd-media-' + s] = makeEl('wsd-media-' + s); });

console.log('=== 流し込み → 回収 ===');
const src = { date: '2026/08/17', out: ['CF160_1', 'CF160_2'], used: ['CF160_1'], user: '城間', bu: true, buBy: '平岡', returnBy: '城間', memo: '約80GB' };
_renderMediaForm('wsd-media', src, 'ws-detail-screen');
ok(els['wsd-media-body'].dataset.built === '1' && /wsd-media-out-group/.test(els['wsd-media-body'].innerHTML), 'body に記入欄の HTML が入る');
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

console.log('\n=== 廃棄カードと空の記録 ===');
_renderMediaForm('wsd-media', null, 'ws-detail-screen');
ok(_collectMediaForm('wsd-media').out.length === 0 && _collectMediaForm('wsd-media').bu === false && els['wsd-media-user'].value === '', '空の記録は全部空');
ok.done();
