const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('passenger and check-in lists use the responsive Bootstrap workspace', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'passenger-bootstrap.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'passenger-bootstrap.js'), 'utf8');
  assert.match(html, /bootstrap@5\.3\.8\/dist\/css\/bootstrap\.min\.css/);
  assert.match(html, /integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8\+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB"/);
  assert.match(html, /passenger-bootstrap\.css/);
  assert.match(html, /passenger-bootstrap\.js/);
  assert.match(app, /function bootstrapPassengerCard\(passenger\)/);
  assert.match(app, /function bootstrapPassengerGroups\(passengers\)/);
  assert.match(app, /data-passenger-actions=/);
  assert.match(app, /Ret eller slet/);
  assert.match(app, /Sortér: Sæde/);
  assert.match(css, /\.bootstrap-passenger-toolbar\{position:sticky/);
  assert.match(css, /@media\(max-width:760px\)\{\.bootstrap-passenger-workspace/);
  assert.match(css, /\.checkin-card\.card/);
});
