// tests/kurosawa/_extract.js
// index.html から関数・const を切り出して eval できる形で返す。各テストが使う。
const fs = require('fs');
const path = require('path');
const HTML_PATH = path.join(__dirname, '..', '..', 'index.html');

function html() { return fs.readFileSync(HTML_PATH, 'utf8'); }

// function NAME( ... ) { ... } の本文を対応する閉じ括弧まで返す
function grabFunction(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('関数が見つからない: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('関数の終わりが見つからない: ' + name);
}

// const NAME = [ ... ] / { ... } の値部分を JS の値として返す
function grabConst(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([\\[{][\\s\\S]*?[\\]}]);'));
  if (!m) throw new Error('定数が見つからない: ' + name);
  return eval('(' + m[1] + ')');
}

// <style> の中身をすべて連結して返す
function css(src) {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi; let m, out = '';
  while ((m = re.exec(src))) out += '\n' + m[1];
  return out;
}

// 簡易 localStorage（テスト用）
function fakeStorage(init) {
  const store = Object.assign({}, init || {});
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _store: store,
  };
}

// 結果を数える ok()
function makeOk() {
  let ng = 0;
  const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) ng++; };
  ok.done = () => { process.exitCode = ng ? 1 : 0; return ng === 0; };
  return ok;
}

module.exports = { html, grabFunction, grabConst, css, fakeStorage, makeOk };
