const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'busops-phase3.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'busops-phase3.css'), 'utf8');

test('phase 3 loads after phase 2 and targets the existing booking flow', () => {
  assert.ok(index.indexOf('/busops-phase3.css') > index.indexOf('/busops-phase2.css'));
  assert.ok(index.indexOf('/busops-phase3.js') > index.indexOf('/busops-phase2.js'));
  assert.match(script, /#passengerForm/);
  assert.match(script, /renderTabBeforePhaseThree/);
  assert.match(script, /renderTripBeforePhaseThree/);
});

test('phase 3 is presentation-only and preserves booking business logic', () => {
  assert.doesNotMatch(script, /\/api\//);
  assert.doesNotMatch(script, /fetch\(/);
  assert.doesNotMatch(script, /onsubmit\s*=/);
  assert.match(script, /booking-panel/);
  assert.match(script, /booking-summary/);
  assert.match(script, /ticket-type-cards/);
});

test('phase 3 provides desktop, tablet and mobile booking layouts', () => {
  assert.match(css, /phase3-booking-workspace/);
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /phase3-booking-actions/);
});
