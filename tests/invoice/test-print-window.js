// tests/invoice/test-print-window.js — 請求書などの印刷ウィンドウ：スマホ（iOS Safari）でも PC と同じ幅で組む（2026-09-30）
const { html, grabFunction, makeOk } = require('../kurosawa/_extract');
const ok = makeOk();
const src = html();
const fn = grabFunction(src, 'openPrintPreview');
const i = src.indexOf('function openPrintPreview');
const body = src.slice(i, src.indexOf('// ===== 設定画面 =====', i)); // 印刷ウィンドウを開く処理まで

console.log('=== iOS では幅を A4 の印字幅に固定 ===');
ok(/const _iosViewportPx = Math\.round\(186 \/ 25\.4 \* 96\);/.test(body), '186mm を px に換算（703）');
ok(Math.round(186 / 25.4 * 96) === 703, '換算値は 703');
ok(/const _viewport = _systemMargin \? `width=\$\{_iosViewportPx\}` : 'width=device-width,initial-scale=1';/.test(body), 'iOS/Safari は固定幅、それ以外は従来どおり');
ok(/<meta name="viewport" content="\$\{_viewport\}">/.test(body), 'viewport に反映している');
ok(!/content="width=device-width,initial-scale=1">/.test(body.slice(body.indexOf('win.document.write'))), '書き出す HTML に device-width の直書きが残っていない');
console.log('\n=== 中身の幅を PC と揃える ===');
const ios = body.match(/_systemMargin\s*\?\s*`@page \{ size: A4; margin: 12mm; \}([\s\S]*?)`/)[1];
ok(/padding: 0 3mm;/.test(ios), 'iOS は左右 3mm（12+3＝15mm ＝ PC と同じ）');
ok(/-webkit-text-size-adjust: 100%/.test(ios), '文字の自動拡大を止める');
const pc = body.match(/:\s*`@page \{ size: A4; margin: 0; \}([\s\S]*?)`/)[1];
ok(/padding: 0 15mm;/.test(pc), 'PC は従来どおり左右 15mm');
ok.done();
