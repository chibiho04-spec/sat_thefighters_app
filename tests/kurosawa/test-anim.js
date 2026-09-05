// tests/kurosawa/test-anim.js — 決闘の演出（武士スプライト・舞台・斬撃・閃光・ナビ）
const { html, css, grabFunction, makeOk } = require('./_extract');
const ok = makeOk();
const src = html();
const styles = css(src);

console.log('=== 舞台の要素に id が付いているか ===');
['sumo-maku','sumo-crowd','sumo-dohyo','sumo-dohyo-ring','sumo-nav-icon','sumo-nav-label'].forEach(id =>
  ok(new RegExp('id="' + id + '"').test(src), 'id ' + id));
ok(src.indexOf('id="sumo-dohyo"') < src.indexOf('id="sumo-dohyo-ring"') && src.indexOf('id="sumo-dohyo-ring"') < src.indexOf('id="sumo-p1-fighter"'), '土俵 > 楕円 > 力士 の順');

console.log('\n=== CSS：body.kurosawa 配下だけで舞台を変える ===');
const kz = styles.slice(styles.indexOf('KUROSAWA mode：決闘の演出'), styles.indexOf('.phone-frame {'));
ok(/body\.kurosawa #sumo-maku, body\.kurosawa #sumo-crowd \{ display: none; \}/.test(kz), '幕と観客席を隠す');
ok(/body\.kurosawa #sumo-dohyo-ring \{ display: none; \}/.test(kz), '土俵の楕円を隠す');
ok(/body\.kurosawa #sumo-dohyo::before[\s\S]*?border-radius: 50%/.test(kz), '月を出す');
ok(/body\.kurosawa \.sumo-attack-left\s*\{\s*animation: kzDashL/.test(kz) && /@keyframes kzDashL/.test(kz), '踏み込みのアニメ（左）');
ok(/body\.kurosawa \.sumo-attack-right\s*\{\s*animation: kzDashR/.test(kz) && /@keyframes kzDashR/.test(kz), '踏み込みのアニメ（右）');
ok(/\.kz-slash\s*\{[\s\S]*?animation: kzSlash/.test(kz) && /@keyframes kzSlashRev/.test(kz), '斬撃の線（左右）');
ok(/\.kz-flash\s*\{[\s\S]*?animation: kzFlash/.test(kz), '一閃の閃光');
ok(/body\.kurosawa \.zabuton\s*\{[\s\S]*?border-radius: 50% 0/.test(kz), '座布団が花びらになる');
ok(!/^\s*#sumo-|^\s*\.sumo-attack/m.test(kz.replace(/\.kz-[a-z]+[\s\S]*?\}/g,'')), 'body.kurosawa の付いていない舞台の指定が無い');

console.log('\n=== JS：武士スプライトと差し替え ===');
const svg = src.match(/const KZ_SAMURAI_SVG = `([\s\S]*?)`;/);
ok(!!svg, 'KZ_SAMURAI_SVG がある');
ok(/viewBox="0 0 20 25"/.test(svg[1]), '力士と同じ 20×25 の枠');
ok(/fill="#eeeeee"/.test(svg[1]) && /fill="#5a3a1a"/.test(svg[1]), '刀身と鍔がある');
ok(/x="9" y="0" width="2" height="2" fill="#1a1a1a"/.test(svg[1]), '髷がある');
const ap = grabFunction(src, '_applySumoSprites');
ok(/dataset\.kzOrig/.test(ap) && /scaleX\(-1\)/.test(ap), '元の力士を退避し、西は反転');
ok(/_applySumoSprites\(\)/.test(grabFunction(src, 'applyKurosawaMode')), 'applyKurosawaMode が差し替えを呼ぶ');

console.log('\n=== JS：斬撃と閃光の配線 ===');
const turn = grabFunction(src, 'sumoTurn');
ok((turn.match(/_kzSlash\(/g) || []).length === 2, 'sumoTurn で先手・後手の2回 斬撃を出す');
ok(/_kzSlash\(secondFighterEl, firstSide === 'left'\)/.test(turn) && /_kzSlash\(firstFighterEl, secondSide === 'left'\)/.test(turn), '斬撃は相手側に出る');
const fin = grabFunction(src, 'sumoFinish');
ok(/technique === '一閃'\) _kzFlash\(\)/.test(fin), '一閃で閃光');
ok(/SUMO_PUSH_TECHS\.includes\(technique\)/.test(fin), '決着の分岐は従来どおり（決闘の技名は含まれず「倒れる」になる）');
const slash = grabFunction(src, '_kzSlash'), flash = grabFunction(src, '_kzFlash');
ok(/isKurosawa\(\)/.test(slash) && /isKurosawa\(\)/.test(flash), '斬撃・閃光は KUROSAWA mode のときだけ');
ok(/setTimeout\([\s\S]*?remove\(\)/.test(slash) && /setTimeout\([\s\S]*?remove\(\)/.test(flash), '出した要素は自分で消す（残らない）');

console.log('\n=== スコープ：トップレベル ===');
['_applySumoSprites', '_kzSlash', '_kzFlash'].forEach(fn => {
  const m = src.match(new RegExp('^( *)function ' + fn + '\\(', 'm'));
  ok(!!m && m[1].length === 2, fn + ' がトップレベル（字下げ ' + (m ? m[1].length : '?') + '）');
});
ok.done();
