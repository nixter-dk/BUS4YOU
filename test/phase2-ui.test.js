const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'busops-phase2.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'busops-phase2.css'), 'utf8');

test('phase 2 assets are loaded after the established application UI layers', () => {
  assert.match(index, /busops-phase1\.css[^>]*>[\s\S]*busops-phase2\.css/);
  assert.match(index, /bootstrap-icons-app\.js[^>]*>[\s\S]*busops-phase1\.js[^>]*>[\s\S]*busops-phase2\.js/);
});

test('phase 2 remains a presentation-only enhancement', () => {
  assert.doesNotMatch(script, /fetch\s*\(/);
  assert.doesNotMatch(script, /\/api\//);
  assert.doesNotMatch(script, /seatNumber\s*=/);
  assert.doesNotMatch(script, /\.sort\s*\(/);
});

test('trip detail keeps the full role-aware tab set while styling the core tabs', () => {
  for (const key of ['passengers', 'seats', 'baggage', 'checkin', 'expenses', 'settlements', 'departure', 'notifications']) {
    assert.match(script, new RegExp(`${key}:\\s*'bi-`));
  }
  assert.match(script, /decoratePassengerTab\(\)/);
  assert.match(script, /decorateSeatTab\(\)/);
  assert.match(script, /decorateBaggageTab\(\)/);
});

test('passenger and baggage tables receive mobile labels without changing their values', () => {
  assert.match(script, /cell\.dataset\.label = labels\[index\]/);
  assert.match(styles, /\.phase2-baggage-table tbody td::before/);
  assert.match(styles, /\.phase2-baggage-table thead\s*\{\s*display:\s*none/);
});

test('phase 2 has explicit desktop, tablet and mobile behavior', () => {
  assert.match(styles, /@media \(max-width:\s*1100px\)/);
  assert.match(styles, /@media \(max-width:\s*700px\)/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
