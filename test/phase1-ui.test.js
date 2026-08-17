const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase 1 keeps the official logo and installs the presentation layer', () => {
  const html = read('public/index.html');
  assert.match(html, /class="phase1-official-logo" src="\/assets\/alba-turist-logo\.jpg"/);
  assert.match(html, /\/busops-phase1\.css/);
  assert.match(html, /\/busops-phase1\.js/);
});

test('Phase 1 dashboard preserves the four operational calculations', () => {
  const source = read('public/busops-phase1.js');
  for (const label of ['Kommende ture', 'Bookede passagerer', 'Checket ind', 'Sendt bagage']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /new Date\(trip\.departureAt\) > new Date\(\)/);
  assert.match(source, /trip\.counts\?\.passengers/);
  assert.match(source, /trip\.counts\?\.checkedIn/);
  assert.match(source, /trip\.counts\?\.baggage/);
  assert.doesNotMatch(source, /fetch\(|\/api\//);
});

test('Phase 1 includes desktop, tablet and mobile shell breakpoints', () => {
  const css = read('public/busops-phase1.css');
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /position: fixed/);
});
