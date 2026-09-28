// tests/media/test-csv.js — LINE bot のシート（CSV）の読み取りと重複除外
const S = require('./_setup');
const ok = S.makeOk();
S.load(['_mediaBuFlag', '_parseCsv', '_parseMediaCSV', '_importMediaCsvRows']);
S.loadConst('_MEDIA_CSV_COLS');

console.log('=== CSV の読み取り ===');
let rows = _parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2\n');
ok(rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'say "hi"' && rows[2][1] === '2', '引用符・カンマ・CRLF・空行');
ok(_parseCsv('﻿a,b\n1,2')[0][0] === 'a', 'BOM を落とす');

console.log('\n=== bot の列 → アプリの行 ===');
const csv = '現場名,使用日,持ち出したメディア,使用メディア,バックアップ,使用者,バックアップした人,返却者\n' +
            '首里城VP,2026/08/17,"CF160_1, CF160_2, CF160_3","CF160_1, CF160_2, CF160_3",○,城間,平岡,城間\n' +
            'ロケハン,2026/08/18,CF160_4,,,上原,,\n';
let p = _parseMediaCSV(csv);
ok(!p.error && p.rows.length === 2, '2行読める（見出しの順番が違ってもよい）');
const r0 = p.rows[0];
ok(r0['使用日'] === '2026/08/17' && r0['現場名'] === '首里城VP' && r0['メディア種別'] === 'LINE' && r0['使用カード'] === 'CF160_1, CF160_2, CF160_3'
   && r0['BU確認'] === '○' && r0['使用者'] === '城間' && r0['返却者'] === '城間' && r0['備考'] === '持出: CF160_1, CF160_2, CF160_3／BU担当: 平岡', '列の対応: ' + JSON.stringify(r0));
ok(p.rows[1]['BU確認'] === '' && p.rows[1]['備考'] === '持出: CF160_4', '空欄は空のまま');
p = _parseMediaCSV('使用日,使用したメディア,現場名\n2026/08/19,CF256_1,別名の見出し');
ok(!p.error && p.rows[0]['使用カード'] === 'CF256_1', '「使用したメディア」の見出しでも拾う');
ok(/使用日/.test(_parseMediaCSV('a,b\n1,2').error), '必要な見出しが無ければエラー');
ok(/空/.test(_parseMediaCSV('').error), '空ならエラー');

console.log('\n=== 重複除外と ID ===');
const existing = [{ 'ID': 'L0002', '使用日': '2026/08/17', '現場名': '首里城VP', '使用者': '城間' }, { 'ID': 'M001' }];
const res = _importMediaCsvRows(_parseMediaCSV(csv).rows, existing);
ok(res.dup === 1 && res.toAdd.length === 1, '使用日＋現場名＋使用者が同じ行は飛ばす');
ok(res.toAdd[0]['ID'] === 'L0003', 'ID は L の最大＋1 から');
const res2 = _importMediaCsvRows(_parseMediaCSV(csv + 'ロケハン,2026/08/18,CF160_4,,,上原,,\n').rows, []);
ok(res2.toAdd.length === 2 && res2.dup === 1 && res2.toAdd.map(r => r['ID']).join(',') === 'L0001,L0002', 'CSV の中の重複も飛ばす。ID は連番');
ok.done();
