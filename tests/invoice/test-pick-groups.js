// tests/invoice/test-pick-groups.js — 明細の「登録済みから選ぶ」を機材のカテゴリごとに分ける（2026-10-06）
const { html, grabFunction, grabConst, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
global._loadProductRows = () => [{ '商品コード': 'Z020', '商品名': 'カメラ機材費', '単価': '12000', '単位': '日' }];
global.loadEquipMaster = () => [
  { cat: '📷 カメラ', name: 'SONY FX6', code: '', price: 18000 }, { cat: '📷 カメラ', name: 'SONY PXW-Z200', code: 'Z020', price: 12000 },
  { cat: '🔭 レンズ', name: 'SONY Gmaster 14mm', code: '', price: 5000 }, { cat: '', name: 'カテゴリ未設定', code: '', price: 0 }, { cat: '📷 カメラ', name: '  ', code: '', price: 1 },
];
(0, eval)(grabFunction(src, '_buildInvPickList'));
const list = _buildInvPickList();
console.log('=== 一覧の中身 ===');
ok(list.length === 5, '名前が空の機材は出さない。それ以外は全部出る（商品1＋機材4）: ' + list.map(x => x.name).join(','));
ok(list.filter(x => x.group === '📦 商品リスト').length === 1, '商品リストは今までどおり1つの見出し');
ok(list.find(x => x.name === 'SONY FX6').group === '🎥 機材｜📷 カメラ' && list.find(x => x.name === 'SONY Gmaster 14mm').group === '🎥 機材｜🔭 レンズ', '機材はカテゴリごとの見出し');
ok(list.find(x => x.name === 'カテゴリ未設定').group === '🎥 機材｜📦 その他', 'カテゴリが無い機材は「その他」');

console.log('\n=== プルダウンの組み立て ===');
let out = '';
global.document = { getElementById: id => id === 'inv-modal-product' ? { set innerHTML(v) { out = v; }, get innerHTML() { return out; }, value: '' } : null };
global.escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global._invPickCache = [];
(0, eval)(grabFunction(src, '_fillInvModalProductOptions'));
_fillInvModalProductOptions();
const labels = [...out.matchAll(/<optgroup label="([^"]+)">/g)].map(m => m[1]);
ok(labels.join('|') === '━━ 📦 商品リスト（1件）━━|━━ 📷 カメラ（2件）━━|━━ 🔭 レンズ（1件）━━|━━ 📦 その他（1件）━━', '見出しは「━━ カテゴリ（件数）━━」で、機材マスタの並び順: ' + labels.join('|'));
ok(/<option value="2">　SONY PXW-Z200（Z020）　¥12,000<\/option>/.test(out), '品目は字下げして「名前（コード）　単価」');
ok(/<option value="">─ 手入力する ─<\/option>/.test(out), '先頭の「手入力する」は変わらない');
ok(_invPickCache.length === 5 && _invPickCache[2].name === 'SONY PXW-Z200', '選んだときに使う添字は一覧と対応している');
ok.done();
