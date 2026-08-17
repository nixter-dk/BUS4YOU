const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'busops-calendar-v1.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'busops-calendar-v1.js'), 'utf8');

test('Turkalender V1 loads after Dashboard V1 and all established design layers', () => {
  assert.ok(index.indexOf('/busops-calendar-v1.css') > index.indexOf('/busops-dashboard-v1.css'));
  assert.ok(index.indexOf('/busops-calendar-v1.js') > index.indexOf('/busops-dashboard-v1.js'));
});

test('Turkalender V1 is a presentation layer that preserves calendar behavior', () => {
  assert.match(js, /const previousRenderCalendar = renderCalendar/);
  assert.doesNotMatch(js, /fetch\s*\(|\/api\//);
  assert.doesNotMatch(js, /state\.trips\s*=|state\.calendarFilters\s*=|state\.calendarMode\s*=/);
  assert.doesNotMatch(js, /revenue|omsætning|chart|canvas/i);
});

test('Turkalender V1 covers alerts, controls, filters and all three calendar views', () => {
  [
    '.calendar-v1-alerts',
    '.calendar-v1-shell',
    '.calendar-v1-toolbar',
    '.calendar-v1-filters',
    '.calendar-v1-legend',
    '.calendar-v1-timeline',
    '.calendar-v1-week',
    '.calendar-v1-month',
    '.calendar-v1-trip'
  ].forEach(selector => assert.match(css, new RegExp(selector.replace('.', '\\.'))));
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
});

test('Turkalender V1 removes stale Dashboard semantics and names the calendar correctly', () => {
  assert.match(js, /BusOps turkalender/);
  assert.match(js, /BusOps driftsdashboard/);
  assert.match(js, /delete view\.dataset\.dashboardRole/);
  assert.match(js, /aria-current/);
});
