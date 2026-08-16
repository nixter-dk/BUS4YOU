const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const CP1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

function pdfHex(value) {
  const bytes = [];
  for (const character of String(value ?? '')) {
    const code = character.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (CP1252.has(code)) bytes.push(CP1252.get(code));
    else bytes.push(0x3f);
  }
  return `<${Buffer.from(bytes).toString('hex').toUpperCase()}>`;
}

function number(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function wrapText(value, maxCharacters = 70) {
  const words = String(value || '').split(/\s+/).filter(Boolean), lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

function buildPdf(objects) {
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')], offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = length;
    const buffer = Buffer.isBuffer(object)
      ? Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')])
      : Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'binary');
    parts.push(buffer); length += buffer.length;
  });
  const xrefOffset = length;
  const xref = [`xref`, `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let index = 1; index <= objects.length; index++) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  parts.push(Buffer.from(`${xref.join('\n')}\n`, 'binary'));
  return Buffer.concat(parts);
}

function createTicketPdf(ticket) {
  const commands = [], rows = Array.isArray(ticket.journeys) ? ticket.journeys : [];
  const text = (x, y, value, size = 10, bold = false, color = '0.05 0.10 0.25') => {
    commands.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm ${pdfHex(value)} Tj ET`);
  };
  const line = (x1, y1, x2, y2, color = '0.82 0.86 0.92', width = 1) => commands.push(`${color} RG ${number(width)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S`);
  const fill = (x, y, width, height, color, radius = 0) => {
    void radius;
    commands.push(`${color} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f`);
  };

  fill(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '0.97 0.98 1');
  fill(0, PAGE_HEIGHT - 126, PAGE_WIDTH, 126, '0.03 0.12 0.34');
  fill(38, PAGE_HEIGHT - 92, 48, 48, '0.05 0.39 0.96');
  text(51, PAGE_HEIGHT - 76, 'AT', 17, true, '1 1 1');
  text(103, PAGE_HEIGHT - 61, 'ALBA TURIST', 10, true, '0.54 0.72 1');
  text(103, PAGE_HEIGHT - 88, ticket.reprint ? 'BILLET - GENUDSKRIFT' : 'REJSEBILLET', 23, true, '1 1 1');
  text(390, PAGE_HEIGHT - 60, 'BOOKINGNUMMER', 8, true, '0.54 0.72 1');
  text(390, PAGE_HEIGHT - 84, ticket.bookingNumber || '-', 14, true, '1 1 1');
  text(390, PAGE_HEIGHT - 103, ticket.reprint ? 'Genudskrift - ingen ny betaling' : 'Original billet', 8, false, '0.82 0.88 1');

  let y = PAGE_HEIGHT - 164;
  text(38, y, ticket.contactName || 'Passager', 19, true);
  text(38, y - 21, ticket.contactPhone || 'Intet telefonnummer', 9, false, '0.32 0.38 0.50');
  const paymentLabel = ticket.payment?.label || 'Betalingsstatus ikke angivet';
  fill(392, y - 25, 165, 42, ticket.payment?.paid ? '0.88 0.97 0.91' : '1 0.95 0.82');
  text(405, y - 2, paymentLabel, 10, true, ticket.payment?.paid ? '0.05 0.42 0.20' : '0.65 0.34 0.02');
  text(405, y - 18, ticket.payment?.amount || '', 8, false, ticket.payment?.paid ? '0.05 0.42 0.20' : '0.65 0.34 0.02');

  y -= 68;
  text(38, y, 'REJSEPLAN', 9, true, '0.05 0.39 0.96');
  y -= 20;
  for (const journey of rows) {
    fill(38, y - 83, 519, 92, '1 1 1');
    text(52, y - 12, journey.legLabel || 'Rejse', 9, true, '0.05 0.39 0.96');
    text(52, y - 34, journey.from || '-', 13, true);
    text(258, y - 34, 'TIL', 8, true, '0.40 0.46 0.58');
    text(300, y - 34, journey.to || '-', 13, true);
    text(52, y - 55, journey.departure || '-', 9, false, '0.25 0.31 0.42');
    if (journey.arrival) text(300, y - 55, journey.arrival, 9, false, '0.25 0.31 0.42');
    text(52, y - 73, `Sæde ${journey.seat || '-'}${journey.extraSeat ? ` + ekstra sæde ${journey.extraSeat}` : ''}`, 9, true, '0.05 0.42 0.20');
    if (journey.tripTitle) text(300, y - 73, journey.tripTitle, 8, false, '0.40 0.46 0.58');
    y -= 106;
  }

  text(38, y, 'PASSAGERER', 9, true, '0.05 0.39 0.96'); y -= 18;
  const passengerLines = ticket.passengers?.length ? ticket.passengers : [{ name: ticket.contactName || '-', seats: '-' }];
  for (const passenger of passengerLines.slice(0, 10)) {
    line(38, y - 7, 557, y - 7);
    text(42, y + 5, passenger.name || '-', 10, true);
    text(355, y + 5, passenger.seats || '-', 9, false, '0.25 0.31 0.42');
    y -= 25;
  }

  if (ticket.note) {
    y -= 5; text(38, y, 'BEMÆRKNING', 8, true, '0.05 0.39 0.96'); y -= 15;
    for (const noteLine of wrapText(ticket.note, 82).slice(0, 3)) { text(38, y, noteLine, 8, false, '0.30 0.36 0.47'); y -= 13; }
  }

  fill(0, 0, PAGE_WIDTH, 48, '0.03 0.12 0.34');
  text(38, 28, 'Alba Turist - medbring billetten ved check-in', 8, true, '1 1 1');
  text(38, 14, `Genereret ${ticket.generatedAt || ''} af ${ticket.generatedBy || 'BusOps'}`, 7, false, '0.72 0.80 0.94');
  text(422, 20, 'busops.albaturist.dk', 8, false, '0.72 0.80 0.94');

  const stream = Buffer.from(commands.join('\n'), 'binary');
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(PAGE_WIDTH)} ${number(PAGE_HEIGHT)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'binary'), stream, Buffer.from('\nendstream', 'binary')])
  ]);
}

module.exports = { createTicketPdf };
