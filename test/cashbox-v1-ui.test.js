const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'busops-cashbox-v1.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'busops-cashbox-v1.js'), 'utf8');

test('Pengekasse V1 loads after Dashboard and Turkalender V1', () => {
  assert.ok(index.indexOf('/busops-cashbox-v1.css') > index.indexOf('/busops-calendar-v1.css'));
  assert.ok(index.indexOf('/busops-cashbox-v1.js') > index.indexOf('/busops-calendar-v1.js'));
});

test('Pengekasse V1 preserves balances, transfer behavior and role permissions', () => {
  assert.match(js, /const previousRenderSalesCashbox = renderSalesCashbox/);
  assert.doesNotMatch(js, /fetch\s*\(|\/api\//);
  assert.doesNotMatch(js, /state\.(trips|trip|user)\s*=/);
  assert.doesNotMatch(js, /cashAmount|amountDKK|amountEUR|paymentRefs/);
});

test('Pengekasse V1 styles the existing financial hierarchy and responsive states', () => {
  [
    '.cashbox-v1-hero',
    '.cashbox-v1-summary',
    '.cashbox-v1-metric',
    '.cashbox-v1-panel',
    '.cashbox-v1-empty',
    '.cashbox-v1-transfer-form',
    '.cashbox-v1-trip-card',
    '.cashbox-v1-transfer-row'
  ].forEach(selector => assert.match(css, new RegExp(selector.replace('.', '\\.'))));
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
});

test('Pengekasse V1 synchronizes visible and accessible role-specific navigation labels', () => {
  assert.match(js, /nav\.setAttribute\('aria-label', label\)/);
  assert.match(js, /nav\.onclick = renderSalesCashbox/);
  assert.match(js, /Min budgetkasse/);
  assert.match(js, /Min pengekasse/);
  assert.match(js, /aria-current/);
});
