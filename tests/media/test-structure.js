// tests/media/test-structure.js — HTML/JS の配線を正規表現で確認（Task 2〜8 で追記していく）
const S = require('./_setup');
const ok = S.makeOk();
const src = S.src;
const top = fn => { const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm')); return !!m && m[1].length === 2; };

console.log('=== Task 2: 記入欄の共通部品 ===');
['_mediaFormRowsHtml', '_renderMediaCardGroup', '_getMediaCardSel', '_toggleMediaCard', '_copyMediaOutToUsed', '_promptNewMediaCard',
 '_addMediaCardFromForm', '_renderMediaNameGroup', '_pickMediaName', '_onMediaNameInput', '_renderMediaBuGroup', '_pickMediaBu',
 '_getMediaBu', '_renderMediaForm', '_collectMediaForm'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
const rows = S.grabFunction(src, '_mediaFormRowsHtml');
// 名前の3欄（user/buby/return）は nameRow で `${prefix}-${which}` として作られる
['-date"', '-out-group"', '-used-group"', '-bu-group"', '-memo"', '-${which}-group"', '-${which}"'].forEach(id =>
  ok(rows.indexOf('${prefix}' + id) >= 0, '記入欄に ' + id + ' がある'));
["'user'", "'buby'", "'return'"].forEach(w => ok(rows.indexOf(w) >= 0, 'nameRow を ' + w + ' で呼んでいる'));
ok(/持ち出しと同じ/.test(rows), '「持ち出しと同じ」ボタンがある');
ok(/＋ 追加/.test(S.grabFunction(src, '_renderMediaCardGroup')), '持ち出し欄に「＋ 追加」がある');
ok.done();
