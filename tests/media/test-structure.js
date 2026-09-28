// tests/media/test-structure.js — HTML/JS の配線を正規表現で確認（Task 2〜8 で追記していく）
const S = require('./_setup');
const ok = S.makeOk();
const src = S.src;
const top = fn => { const m = src.match(new RegExp('^( *)(?:async )?function ' + fn + '\\(', 'm')); return !!m && m[1].length === 2; };

console.log('=== Task 2: 記入欄の共通部品 ===');
['_mediaFormRowsHtml', '_renderMediaCardGroup', '_getMediaCardSel', '_toggleMediaCard', '_copyMediaOutToUsed', '_promptNewMediaCard',
 '_addMediaCardFromForm', '_renderMediaNameGroup', '_pickMediaName', '_onMediaNameInput', '_renderMediaBuGroup', '_pickMediaBu',
 '_getMediaBu', '_renderMediaForm', '_collectMediaForm'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
const rows = S.grabFunction(src, '_mediaFormRowsHtml');
// 名前の3欄（user/buby/return）は nameRow で `${prefix}-${which}` として作られる
['-out-group"', '-used-group"', '-bu-group"', '-memo"', '-${which}-group"', '-${which}"'].forEach(id =>
  ok(rows.indexOf('${prefix}' + id) >= 0, '記入欄に ' + id + ' がある'));
["'user'", "'buby'", "'return'"].forEach(w => ok(rows.indexOf(w) >= 0, 'nameRow を ' + w + ' で呼んでいる'));
ok(/持ち出しと同じ/.test(rows), '「持ち出しと同じ」ボタンがある');
ok(/＋ 追加/.test(S.grabFunction(src, '_renderMediaCardGroup')), '持ち出し欄に「＋ 追加」がある');
ok(!/<label[^>]*>[^<]*<button/.test(S.grabFunction(src, '_mediaFormRowsHtml')), '「使用したカード」の行は label で button を包まない');
ok(/if \(!body \|\| !body\.dataset\.built\) return null;/.test(S.grabFunction(src, '_collectMediaForm')), '_collectMediaForm は未構築なら null');

console.log('\n=== Task 3: ワークシート記入画面 ===');
ok(!/id="wsd-media"/.test(src), '旧「メディア使用記録」textarea（#wsd-media）が無い');
ok(/id="wsd-media-toggle"/.test(src) && /id="wsd-media-body"/.test(src) && /id="wsd-media-count"/.test(src), '折りたたみバーと本体がある');
ok(src.indexOf('id="wsd-vehicle-extra"') < src.indexOf('id="wsd-media-toggle"') && src.indexOf('id="wsd-media-body"') < src.indexOf('セクション3: 作業後記入'), '使用車両の後・作業後記入の前にある（2026-09-29 本人決定）');
ok(!/\$\{prefix\}-date/.test(S.grabFunction(src, '_mediaFormRowsHtml')) && /date: ''/.test(S.grabFunction(src, '_collectMediaForm')), '使用日の欄は無い（日程と同じ）');
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
ok(/\$\{mediaLine\}/.test(pr) && !/escapeHtml\(mediaLine\)/.test(pr), '印刷は mediaLine を素で挿す（二重エスケープしない）');
ok(!/使用者|BU|返却/.test(pr.slice(pr.indexOf("secBar('メディア')"), pr.indexOf("secBar('レンタル・私物')"))), '印刷のメディア節は持ち出しだけ');

console.log('\n=== Task 5: 簡易ワークシート ===');
ok(/id="sw-media-body"/.test(src), '簡易WSに記入欄の本体がある');
ok(src.indexOf('id="sw-equip-checklist"') < src.indexOf('id="sw-media-body"') && src.indexOf('id="sw-media-body"') < src.indexOf('id="sw-memo"'), '使用機材の後・備考の前');
ok(/_renderMediaForm\('sw-media', null, 'new-simple-ws-screen'\)/.test(S.grabFunction(src, 'openNewSimpleWS')), '新規で空の記入欄を描く');
const oe = S.grabFunction(src, 'openEditSimpleWS');
ok(/_renderMediaForm\('sw-media'/.test(oe) && /rec\.user/.test(oe), '編集で復元（使用者が空なら簡易WSの使用者）');
const ss = S.grabFunction(src, 'saveSimpleWS');
ok(/const media = _collectMediaForm\('sw-media'\) \|\| _normalizeMedia\(_prev\)/.test(ss) && (ss.match(/ memo, media,/g) || []).length === 2, '保存が media を持つ（未構築なら既存を保つ・更新と新規の両方）');
ok(/_mediaPrintLine\(_collectMediaForm\('sw-media'\)\)/.test(S.grabFunction(src, 'openSimpleWSPrint')), '印刷に持ち出しの行');
ok(/_wsEquipCats\(master, _swEquip\)/.test(S.grabFunction(src, 'renderSwEquipChecklist')), '簡易WSの機材リストもメディアを出さない');
ok(!/簡易ワークシート（単発の機材使用記録・ローカル保存のみ）/.test(src), '節の古いコメント「ローカル保存のみ」を直した');

console.log('\n=== Task 6: メディア管理画面 ===');
ok(!/id="new-media-screen"/.test(src) && !/#new-media-screen/.test(src), '単独の記録画面（HTML・CSS）が無い');
['openNewMedia', 'closeNewMedia', 'saveNewMedia'].forEach(fn => ok(!new RegExp('function ' + fn + '\\(').test(src), fn + ' が無い'));
ok(!/new-media-screen/.test(S.grabConst(src, '_NAV_EDIT_PANELS').map(p => p.id).join(',')), '_NAV_EDIT_PANELS から外した');
ok(!/openNewMedia\(\)/.test(src), '「＋」ボタンが無い');
['id="media-refresh-btn"', 'id="media-cards-status"', 'id="media-filter-chips"', 'id="media-search"', 'id="media-items"'].forEach(id => ok(src.indexOf(id) >= 0, id + ' がある'));
['refreshMediaPage', 'setMediaFilter', 'renderMediaList', '_mediaRecords', '_mediaCardStatus'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
ok(/async function refreshMediaPage/.test(src) && /_setBtnBusy\(btn, true, '🔄 取得中…'\)/.test(S.grabFunction(src, 'refreshMediaPage')), '更新ボタンは処理中表示');
ok(!/onclick=/.test(S.grabFunction(src, 'renderMediaList')) && /data-key="\$\{escapeHtml\(r\.key\)\}"/.test(S.grabFunction(src, 'renderMediaList')) && /openWS\(key\)/.test(S.grabFunction(src, '_onMediaItemsClick')) && !/closeMediaList\(\)/.test(S.grabFunction(src, '_onMediaItemsClick')) && /onclick="_onMediaItemsClick\(event\)"/.test(src), 'タップは委譲ハンドラで開く（onclick に受注No を埋め込まない・一覧は閉じない）');

console.log('\n=== Task 7: カード一覧の画面 ===');
['openMediaCards', 'closeMediaCards', 'renderMediaCards', 'addMediaCardFromList', 'toggleMediaCardRetired', '_onMediaItemsClick', '_refreshMediaCardButtons'].forEach(fn => ok(top(fn), fn + ' がトップレベル'));
ok(/_promptNewMediaCard\(\)/.test(S.grabFunction(src, 'addMediaCardFromList')), '記入欄と同じ追加の対話を使う');
ok(/onclick="toggleMediaCardRetired\(this\.dataset\.card\)"/.test(S.grabFunction(src, 'renderMediaCards')), '廃棄ボタンは data-card 経由（id を onclick 文字列に埋めない）');
ok(/confirm\(/.test(S.grabFunction(src, 'toggleMediaCardRetired')), '廃棄は確認する');
ok(/_rerenderIfOpen\('media-cards-screen', renderMediaCards\)/.test(src), '設定が同期で届いたらカード一覧を描き直す');
ok(top('_refreshMediaCardButtons') && /_refreshMediaCardButtons\('wsd-media'/.test(src) && /_refreshMediaCardButtons\('sw-media'/.test(src), '開いている記入欄のボタンも描き直す');
ok((src.match(/#media-cards-screen,/g) || []).length === 3, 'デスクトップ幅のルール3か所に入っている');
ok(/は貸出中です（返却が記録されていません）/.test(S.grabFunction(src, 'toggleMediaCardRetired')), '貸出中の廃棄は確認文にその旨を出す');
ok((src.match(/_mediaListInvalidate\(\); renderMediaList\(\)/g) || []).length >= 6, '保存後・同期後にメディア一覧を描き直す（media/order/child/simpleWS の redraw と saveWS/saveSimpleWS）');
ok(/id: 'media-cards-screen', close: \(\) => closeMediaCards\(\)/.test(src), 'カード一覧はナビタブで閉じる（_NAV_LIST_PANELS）');

console.log('\n=== Task 8: LINE取込 ===');
ok(/id="media-csv-file"/.test(src) && /importMediaCsvFile\(this\.files/.test(src), 'ファイル選択がある');
ok(/async function importMediaCsvFile/.test(src), '取込関数がある');
const imp = S.grabFunction(src, '_importMediaCsvText'); // 取込の本体（CSV ファイル・シート直読みの両方が使う）
ok(/confirm\(/.test(imp) && /pushKind\('media'/.test(imp) && /_saveMediaRows\(/.test(imp), '確認→送信→キャッシュ反映');
ok(/await pullKind\('media'\)/.test(imp) && /CHUNK = 100/.test(imp) && /_saveMediaRows\(/.test(imp), '取込前に media を取り込み、100件ずつ送り、キャッシュは共通関数で保存');
ok(/let sent = 0/.test(imp) && /stamped\.slice\(0, sent\)/.test(imp), '途中で失敗しても送信済みの分はキャッシュに残し、その旨を伝える');

ok(top('importMediaFromLineSheet') && /async function importMediaFromLineSheet/.test(src) && top('_importMediaCsvText') && top('_lineSheetCsvUrl'), 'シート直読みの関数がある');
ok(/onclick="importMediaFromLineSheet\(\)"/.test(src) && /onclick="document\.getElementById\('media-csv-file'\)\.click\(\)"/.test(src), '📥 LINE取込＝シート直読み、📄 CSV＝ファイル');
ok(!/spreadsheets\/d\/1c7O5kB1/.test(src), 'bot のシートのリンクはコードに書かない（端末ごとに保存）');
ok(/_importMediaCsvText\(text\)/.test(S.grabFunction(src, 'importMediaCsvFile')) && /_importMediaCsvText\(text\)/.test(S.grabFunction(src, 'importMediaFromLineSheet')), '両方とも同じ取込の本体を使う');
ok.done();
