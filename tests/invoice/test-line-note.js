// tests/invoice/test-line-note.js — 明細の備考を改行できる（2026-11-12）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const ta = src.match(/<textarea id="inv-modal-note"[^>]*>/)[0];
ok(/rows="2"/.test(ta) && !/inv-ta-1/.test(ta) && /oninput="_autoGrowNote\(this\)"/.test(ta) && /resize:vertical/.test(ta), '備考欄は2行・入力に合わせて伸びる（1行固定の指定を外した）');
ok(!/inv-modal-note[\s\S]{0,200}key === 'Enter'/.test(src), '備考欄で Enter を止める処理は無い');
(0, eval)(grabFunction(src, '_autoGrowNote'));
const el = { style: { height: '' }, scrollHeight: 100 }; _autoGrowNote(el);
ok(el.style.height === '102px', '中身の高さに合わせる');
el.scrollHeight = 900; _autoGrowNote(el); ok(el.style.height === '320px', '伸びすぎない（320px まで）');
ok(_autoGrowNote(null) === undefined, '要素が無くても落ちない');
ok(/nEl\.value = l\.note \|\| ''; nEl\.disabled = _invReadonly; _autoGrowNote\(nEl\);/.test(grabFunction(src, 'openInvLineModal')), '開いたとき保存済みの備考に合わせて高さを決める');
ok(/note:  \(document\.getElementById\('inv-modal-note'\)\?\.value \|\| ''\)\.trim\(\)/.test(grabFunction(src, 'saveInvLineModal')), '保存は前後の空白だけ落とし、途中の改行は残す');
ok(/class="inv-card-note" style="[^"]*white-space:pre-wrap;/.test(src), '明細カードで改行して表示');
ok(/<div style="white-space:pre-wrap;">\$\{note\}<\/div>/.test(grabFunction(src, 'buildDocHTML')) && /const note  = escapeHtml\(tr\.dataset\.note/.test(grabFunction(src, 'buildDocHTML')), '印刷も改行して表示（escapeHtml は通したまま）');
ok.done();
