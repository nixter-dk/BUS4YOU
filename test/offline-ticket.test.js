const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTicketPdf } = require('../ticket-pdf');

test('ticket generator creates a real one-page PDF with booking data', () => {
  const pdf = createTicketPdf({
    bookingNumber:'ALB-2026-000123',contactName:'Familie Aliji',contactPhone:'+45 12 34 56 78',reprint:true,
    payment:{paid:true,label:'Betalt kontant',amount:'900,00 DKK'},
    journeys:[{legLabel:'UDREJSE',from:'København',to:'Tetovo',departure:'16. august 2026 10.00',arrival:'17. august 2026 08.00',seat:'4, 5',extraSeat:'6',tripTitle:'København - Tetovo'}],
    passengers:[{name:'Emine Aliji',seats:'Sæde 4'},{name:'Familie medlem',seats:'Sæde 5 + 6'}],generatedAt:'16. august 2026 09.00',generatedBy:'Administrator',
    qrPayload:'https://busops-albaturist.onrender.com/ticket/QUxCLTIwMjYtMDAwMTIz.secure-token'
  });
  assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');
  assert.match(pdf.toString('binary'),/\/Type \/Page/);
  assert.match(pdf.toString('binary'),/\/MediaBox \[0 0 420\.94 595\.28\]/);
  assert.match(pdf.toString('binary'),/\/Subtype \/Image/);
  assert.match(pdf.toString('binary'),/\/Logo 6 0 R/);
  assert.ok(pdf.length>9000);
});

test('offline shell, IndexedDB queue, image optimization and alarm UI are wired', () => {
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'public','index.html'),'utf8'),app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),offline=fs.readFileSync(path.join(root,'public','offline.js'),'utf8'),worker=fs.readFileSync(path.join(root,'public','sw.js'),'utf8'),dockerfile=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
  assert.match(html,/offline\.js/);
  assert.match(app,/optimizeUploadImage/);
  assert.match(app,/syncOfflineActions/);
  assert.match(app,/operationalAlertMarkup/);
  assert.match(app,/ticket\.pdf/);
  assert.match(offline,/indexedDB\.open/);
  assert.match(worker,/busops-shell/);
  assert.match(worker,/caches\.match/);
  assert.match(dockerfile,/COPY ticket-pdf\.js/);
  assert.match(dockerfile,/COPY qr-code\.js/);
});
