const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createQrMatrix, qrSvg } = require('../qr-code');

test('ticket QR encoder creates a complete version 6 matrix without personal data', () => {
  const payload='https://busops-albaturist.onrender.com/ticket/QUxCLTIwMjYtMDAwMTIz.signed-token';
  const matrix=createQrMatrix(payload);
  assert.equal(matrix.length,41);
  assert.ok(matrix.every(row=>row.length===41&&row.every(value=>typeof value==='boolean')));
  assert.ok(matrix.flat().filter(Boolean).length>500);
  const svg=qrSvg(payload);
  assert.match(svg,/viewBox="0 0 49 49"/);
  assert.doesNotMatch(svg,/Emine|telefon|betaling/i);
});

test('assigned drivers and on-duty sales managers can open the protected passenger scanner', () => {
  const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),passenger=fs.readFileSync(path.join(root,'public','passenger-bootstrap.js'),'utf8'),html=fs.readFileSync(path.join(root,'public','index.html'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(app,/BarcodeDetector/);
  assert.match(app,/window\.jsQR/);
  assert.match(app,/ticket-scan/);
  assert.match(app,/QR-koden tilhører ikke den valgte passager/);
  assert.match(passenger,/\['driver',\s*'sales_manager'\]\.includes\(state\.user\.role\)/);
  assert.match(passenger,/class="checkin-name-trigger" data-passenger-actions/);
  assert.match(passenger,/data-sheet-action="scan-ticket"/);
  assert.match(passenger,/openTicketScanner\(id\)/);
  assert.doesNotMatch(app,/data-open-ticket-scanner/);
  assert.match(html,/jsqr@1\.4\.0\/dist\/jsQR\.js/);
  assert.match(css,/\.ticket-scanner/);
  assert.match(server,/passenger\.qr_checked_in/);
  assert.match(server,/Kun en tildelt chauffør eller salgschefen på vagt kan checke ind ved at scanne billetten/);
});

test('digital and PDF tickets use only the bundled original Alba Turist logo', () => {
  const root=path.join(__dirname,'..');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const pdf=fs.readFileSync(path.join(root,'ticket-pdf.js'),'utf8');
  assert.match(server,/<img src="\/assets\/alba-turist-logo\.jpg" alt="Alba Turist">/);
  assert.match(pdf,/public', 'assets', 'alba-turist-logo\.jpg/);
  assert.equal(fs.existsSync(path.join(root,'public','assets','alba-turist-logo.jpg')),true);
});
