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
ok(!/<label[^>]*>[^<]*<button/.test(S.grabFunction(src, '_mediaFormRowsHtml')), '「使用したカード」の行は label で button を包まない');
ok(/if \(!body \|\| !body\.dataset\.built\) return null;/.test(S.grabFunction(src, '_collectMediaForm')), '_collectMediaForm は未構築なら null');

console.log('\n=== Task 3: ワークシート記入画面 ===');
ok(!/id="wsd-media"/.test(src), '旧「メディア使用記録」textarea（#wsd-media）が無い');
ok(/id="wsd-media-toggle"/.test(src) && /id="wsd-media-body"/.test(src) && /id="wsd-media-count"/.test(src), '折りたたみバーと本体がある');
ok(src.indexOf('id="wsd-equip-checklist"') < src.indexOf('id="wsd-media-toggle"') && src.indexOf('id="wsd-media-body"') < src.indexOf('👤 私物機材'), '機材リストの後・私物機材の前にある');
['_setWsdMediaOpen', 'toggleWsdMedia', '_updateWsdMediaCount', '_wsEquipCats'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
const saveWS = S.grabFunction(src, 'saveWS');
ok(/const m = _collectMediaForm\('wsd-media'\)/.test(saveWS) && /if \(m\) \{ data\.media = m; data\['wsd-media'\] = ''; \}/.test(saveWS), 'saveWS は記入欄が描けているときだけ media を保存し旧欄を空にする');
ok(!/const fields = \[[^\]]*'wsd-media'/.test(saveWS), 'saveWS の fields から wsd-media を外した');
const openWS = S.grabFunction(src, 'openWS');
ok(/_renderMediaForm\('wsd-media', _wsMediaForOpen\(saved, data\), 'ws-detail-screen'\)/.test(openWS), 'openWS は _wsMediaForOpen で整えてから記入欄に流し込む');
ok(top('_wsMediaForOpen'), '_wsMediaForOpen がトップレベル');
const rec = S.grabFunction(src, 'renderEquipChecklist');
ok(/_wsEquipCats\(master, savedEquip\)/.test(rec), '機材チェックリストが _wsEquipCats を使う');
ok(/_setWsdMediaOpen\(open\)/.test(rec), '開閉の既定にメディア欄も含む');
const hr = src.slice(src.indexOf('リスト系・機材選択があれば実データあり') - 400, src.indexOf('リスト系・機材選択があれば実データあり'));
ok(/if \(_mediaHasRecord\(s\.media\) \|\| String\(\(s\.media && s\.media\.memo\) \|\| ''\)\.trim\(\) !== ''\) return true;/.test(hr), '実データ判定に media（記録と備考）を含む');

console.log('\n=== Task 4: 閲覧画面と印刷 ===');
ok(/id="wsv-media-section"/.test(src) && /id="wsv-media-val"/.test(src), '閲覧画面に節がある');
ok(src.indexOf('id="wsv-media-section"') < src.indexOf('id="wsv-rental-section"'), 'レンタル/私物の前にある');
const view = S.grabFunction(src, 'renderWsView');
ok(/_mediaViewHtml\(/.test(view) && /wsv-media-section/.test(view), 'renderWsView が節を描く');
const pr = S.grabFunction(src, 'openWorksheetPrint');
ok(/const mediaLine = _mediaPrintLine\(saved2\.media\)/.test(pr), '印刷が持ち出しの1行を作る');
ok(pr.indexOf("secBar('使用機材')") < pr.indexOf("secBar('メディア')") && pr.indexOf("secBar('メディア')") < pr.indexOf("secBar('レンタル・私物')"), '使用機材の直後に出る');

ok.done();
