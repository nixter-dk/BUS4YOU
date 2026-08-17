const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'busops-dashboard-v1.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'busops-dashboard-v1.js'), 'utf8');

test('Dashboard V1 loads after the established application design layers', () => {
  const phase3Css = index.indexOf('/busops-phase3.css');
  const dashboardCss = index.indexOf('/busops-dashboard-v1.css');
  const phase3Js = index.indexOf('/busops-phase3.js');
  const dashboardJs = index.indexOf('/busops-dashboard-v1.js');
  assert.ok(phase3Css >= 0 && dashboardCss > phase3Css);
  assert.ok(phase3Js >= 0 && dashboardJs > phase3Js);
});

test('Dashboard V1 preserves original data calculations and business behavior', () => {
  assert.match(js, /const previousRenderDashboard = renderDashboard/);
  assert.doesNotMatch(js, /fetch\s*\(|\/api\//);
  assert.doesNotMatch(js, /state\.trips\s*=|state\.dashboard\s*=/);
  assert.match(js, /\/assets\/alba-turist-logo\.jpg/);
});

test('Dashboard V1 contains the approved professional design system and breakpoints', () => {
  ['#0b1730', '#10213f', '#17345e', '#4567e8', '#f5f7fb', '#182235', '#748096', '#e7ebf2', '#119b6b', '#d88b11', '#d9534f']
    .forEach(color => assert.match(css.toLowerCase(), new RegExp(color)));
  assert.match(css, /--busops-sidebar-width:\s*264px/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
});

test('Dashboard V1 styles the four existing KPI and departure components without fake charts', () => {
  assert.match(css, /\.phase1-kpi-grid/);
  assert.match(css, /\.dashboard-v1-kpi/);
  assert.match(css, /\.phase1-departures-panel/);
  assert.match(css, /\.dashboard-v1-departure/);
  assert.doesNotMatch(js, /revenue|omsætning|chart|canvas/i);
});

test('Dashboard V1 reports timetable-based active trips instead of claiming GPS live status', () => {
  assert.match(js, /tripLiveState\(trip\)\.state === 'underway'/);
  assert.match(js, /Beregnet ud fra tidstabel/);
  assert.match(js, /ture i gang/);
  assert.doesNotMatch(js, /Live driftsstatus/);
});
