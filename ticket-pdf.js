const fs = require('fs');
const path = require('path');
const { createQrMatrix } = require('./qr-code');

// A5 portrait is compact enough for a phone while still printing cleanly.
const PAGE_WIDTH = 420.94;
const PAGE_HEIGHT = 595.28;
const LOGO_PATH = path.join(__dirname, 'public', 'assets', 'alba-turist-logo.jpg');

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

function truncate(value, maxCharacters) {
  const text = String(value || '-');
  return text.length > maxCharacters ? `${text.slice(0, Math.max(1, maxCharacters - 1))}...` : text;
}

function compactDateTime(value) {
  const source = String(value || '-').trim();
  const match = source.match(/^(\d{1,2}\.)\s+([^\s]+)\s+\d{4},?\s+(\d{1,2}[.:]\d{2})$/);
  if (!match) return truncate(source, 20);
  const month = match[2].replace(/\.$/, '').slice(0, 3);
  return `${match[1]} ${month}. · ${match[3]}`;
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), components: buffer[offset + 9] };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (!length) break;
    offset += length + 2;
  }
  throw new Error('Alba Turist-logoet er ikke en gyldig JPEG-fil');
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
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let index = 1; index <= objects.length; index++) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  parts.push(Buffer.from(`${xref.join('\n')}\n`, 'binary'));
  return Buffer.concat(parts);
}

function createTicketPdf(ticket) {
  const commands = [], journeys = Array.isArray(ticket.journeys) ? ticket.journeys : [];
  const outbound = journeys[0] || {};
  const returnJourney = journeys[1] || null;
  const passengers = ticket.passengers?.length ? ticket.passengers : [{ name: ticket.contactName || '-', seats: '-' }];
  const logo = fs.readFileSync(LOGO_PATH), logoSize = jpegDimensions(logo);

  const text = (x, y, value, size = 10, bold = false, color = '0.09 0.13 0.22') => {
    commands.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm ${pdfHex(value)} Tj ET`);
  };
  const approximateWidth = (value, size, bold = false) => String(value || '').length * size * (bold ? 0.55 : 0.49);
  const textRight = (right, y, value, size = 10, bold = false, color) => text(right - approximateWidth(value, size, bold), y, value, size, bold, color);
  const line = (x1, y1, x2, y2, color = '0.86 0.89 0.94', width = 1) => commands.push(`${color} RG ${number(width)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S`);
  const roundedPath = (x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2), k = 0.55228475, c = r * k;
    return `${number(x + r)} ${number(y)} m ${number(x + width - r)} ${number(y)} l ${number(x + width - r + c)} ${number(y)} ${number(x + width)} ${number(y + r - c)} ${number(x + width)} ${number(y + r)} c ${number(x + width)} ${number(y + height - r)} l ${number(x + width)} ${number(y + height - r + c)} ${number(x + width - r + c)} ${number(y + height)} ${number(x + width - r)} ${number(y + height)} c ${number(x + r)} ${number(y + height)} l ${number(x + r - c)} ${number(y + height)} ${number(x)} ${number(y + height - r + c)} ${number(x)} ${number(y + height - r)} c ${number(x)} ${number(y + r)} l ${number(x)} ${number(y + r - c)} ${number(x + r - c)} ${number(y)} ${number(x + r)} ${number(y)} c h`;
  };
  const card = (x, y, width, height, fillColor = '1 1 1', strokeColor = null, radius = 12, strokeWidth = 1) => {
    commands.push(`${fillColor} rg${strokeColor ? ` ${strokeColor} RG ${number(strokeWidth)} w` : ''} ${roundedPath(x, y, width, height, radius)} ${strokeColor ? 'B' : 'f'}`);
  };
  const circle = (cx, cy, radius, fillColor) => {
    const c = radius * 0.55228475;
    commands.push(`${fillColor} rg ${number(cx + radius)} ${number(cy)} m ${number(cx + radius)} ${number(cy + c)} ${number(cx + c)} ${number(cy + radius)} ${number(cx)} ${number(cy + radius)} c ${number(cx - c)} ${number(cy + radius)} ${number(cx - radius)} ${number(cy + c)} ${number(cx - radius)} ${number(cy)} c ${number(cx - radius)} ${number(cy - c)} ${number(cx - c)} ${number(cy - radius)} ${number(cx)} ${number(cy - radius)} c ${number(cx + c)} ${number(cy - radius)} ${number(cx + radius)} ${number(cy - c)} ${number(cx + radius)} ${number(cy)} c f`);
  };
  const drawLogo = (x, y, width, height) => commands.push(`q ${number(width)} 0 0 ${number(height)} ${number(x)} ${number(y)} cm /Logo Do Q`);
  const drawQr = (x, y, width, payload) => {
    const matrix=createQrMatrix(payload),border=4,module=width/(matrix.length+border*2);
    commands.push(`1 1 1 rg ${number(x)} ${number(y)} ${number(width)} ${number(width)} re f`);
    matrix.forEach((row,rowIndex)=>row.forEach((dark,columnIndex)=>{
      if(!dark)return;
      const moduleX=x+(columnIndex+border)*module,moduleY=y+(matrix.length+border-1-rowIndex)*module;
      commands.push(`0.03 0.09 0.20 rg ${number(moduleX)} ${number(moduleY)} ${number(module+.03)} ${number(module+.03)} re f`);
    }));
  };
  const infoBlock = (x, y, label, value, detail = '') => {
    text(x, y + 31, label, 6.5, true, '0.60 0.60 0.57');
    text(x, y + 15, truncate(value, 20), 9.2, true, '1 1 1');
    if (detail) text(x, y + 2, truncate(detail, 28), 6.8, false, '0.70 0.70 0.67');
  };

  // Warm neutral canvas and a clean boarding-pass surface.
  commands.push(`0.95 0.945 0.925 rg 0 0 ${number(PAGE_WIDTH)} ${number(PAGE_HEIGHT)} re f`);
  card(18, 18, PAGE_WIDTH - 36, PAGE_HEIGHT - 36, '1 1 1', '0.86 0.85 0.82', 19);

  // Only the original Alba Turist artwork is used as branding.
  drawLogo(39, 532, 148, 29.8);
  card(278, 537, 108, 23, '0.97 0.97 0.96', '0.87 0.86 0.83', 11);
  textRight(374, 545, ticket.reprint ? 'GENUDSKRIFT' : 'DIGITAL REJSEBILLET', 5.6, true, '0.31 0.31 0.29');

  // Dark journey panel inspired by a modern boarding pass.
  card(30, 374, 360, 142, '0.08 0.08 0.08', null, 16);
  text(48, 492, 'FRA', 5.8, true, '0.60 0.60 0.57');
  textRight(372, 492, 'TIL', 5.8, true, '0.60 0.60 0.57');
  text(48, 467, truncate(outbound.from || 'Afgang', 17), 19.5, true, '1 1 1');
  textRight(372, 467, truncate(outbound.to || 'Destination', 17), 19.5, true, '1 1 1');
  line(164, 474, 255, 474, '0.46 0.46 0.43', 1);
  circle(164, 474, 3.3, '1 1 1');
  circle(255, 474, 3.3, '1 1 1');
  text(203, 468.5, 'BUS', 5.2, true, '0.67 0.67 0.63');
  line(48, 445, 372, 445, '0.20 0.20 0.19', 0.8);
  infoBlock(48, 394, 'AFGANG', compactDateTime(outbound.departure), outbound.from || '');
  line(162, 395, 162, 431, '0.22 0.22 0.21');
  infoBlock(178, 394, 'ANKOMST', compactDateTime(outbound.arrival), outbound.to || '');
  line(292, 395, 292, 431, '0.22 0.22 0.21');
  text(308, 425, 'SÆDE', 6.5, true, '0.60 0.60 0.57');
  text(308, 400, outbound.seat || '-', 21, true, '1 1 1');
  if (outbound.extraSeat) text(334, 403, `+ ${outbound.extraSeat}`, 6.5, true, '0.75 0.75 0.72');

  // Passenger identity with quiet, print-friendly hierarchy.
  text(34, 350, 'PASSAGER', 6, true, '0.52 0.52 0.49');
  text(34, 330, truncate(ticket.contactName || 'Passager', 31), 14, true, '0.10 0.10 0.10');
  textRight(386, 350, 'BOOKING', 6, true, '0.52 0.52 0.49');
  textRight(386, 331, ticket.bookingNumber || '-', 9.5, true, '0.18 0.18 0.17');
  line(34, 316, 386, 316, '0.91 0.90 0.87');

  // Payment is visible without dominating the ticket.
  const paid = Boolean(ticket.payment?.paid);
  card(34, 268, 352, 35, paid ? '0.93 0.98 0.96' : '1 0.97 0.90', paid ? '0.78 0.91 0.85' : '0.94 0.85 0.66', 9);
  circle(51, 285.5, 7.5, paid ? '0.04 0.55 0.38' : '0.82 0.54 0.08');
  if (paid) {
    line(47.8, 285.3, 50.1, 282.9, '1 1 1', 1.2);
    line(50.1, 282.9, 54.9, 288, '1 1 1', 1.2);
  } else text(49.3, 282.7, '!', 7, true, '1 1 1');
  text(65, 282.5, ticket.payment?.label || 'Betalingsstatus ikke angivet', 8.5, true, paid ? '0.03 0.42 0.29' : '0.49 0.32 0.04');
  textRight(371, 282.5, paid ? 'BETALT' : 'AFVENTER', 6.5, true, paid ? '0.03 0.42 0.29' : '0.49 0.32 0.04');

  let passengerTop = 246;
  if (returnJourney) {
    card(34, 211, 352, 43, '0.97 0.96 1', '0.88 0.86 0.95', 9);
    text(47, 240, returnJourney.legLabel || 'RETURREJSE', 5.8, true, '0.38 0.31 0.60');
    text(47, 225, `${truncate(returnJourney.from, 17)}  >  ${truncate(returnJourney.to, 17)}`, 8.3, true);
    text(47, 215.5, truncate(returnJourney.departure || '-', 42), 5.8, false, '0.42 0.39 0.50');
    textRight(372, 225, `Sæde ${returnJourney.seat || '-'}`, 6.7, true, '0.38 0.31 0.60');
    passengerTop = 197;
  }

  text(34, passengerTop, passengers.length > 1 ? `REJSENDE I BOOKINGEN · ${passengers.length}` : 'REJSENDE', 6, true, '0.40 0.40 0.37');
  const passengerSummary = passengers.map(passenger => `${passenger.name} (${passenger.seats || '-'})`).join('  ·  ');
  const passengerWrap=ticket.qrPayload?54:68;
  const passengerLines = wrapText(passengerSummary, passengerWrap).slice(0, returnJourney ? 1 : 2);
  let passengerY = passengerTop - 14;
  passengerLines.forEach((passengerLine, index) => {
    text(34, passengerY, passengerLine, index === 0 ? 7.8 : 7, index === 0, '0.16 0.16 0.15');
    passengerY -= 11;
  });
  if (wrapText(passengerSummary, passengerWrap).length > passengerLines.length) text(34, passengerY, `+ flere på booking ${ticket.bookingNumber || ''}`, 5.8, false, '0.46 0.46 0.43');

  // Perforated scan stub with a large, high-contrast QR code.
  line(34, 156, 386, 156, '0.80 0.79 0.75', 0.7);
  circle(18, 156, 9, '0.95 0.945 0.925');
  circle(403, 156, 9, '0.95 0.945 0.925');
  if(ticket.qrPayload){
    card(34, 38, 112, 112, '1 1 1', '0.86 0.85 0.82', 12);
    drawQr(40,44,100,ticket.qrPayload);
    text(171, 128, 'Scan ved check-in', 6, true, '0.50 0.50 0.47');
    text(171, 106, 'Vis koden til chaufføren', 13, true, '0.10 0.10 0.10');
    const scanNote = wrapText('Koden åbner kun denne booking og indeholder ingen personoplysninger.', 47).slice(0, 2);
    scanNote.forEach((noteLine,index)=>text(171, 89-index*10, noteLine, 6.2, false, '0.40 0.40 0.37'));
    text(171, 55, ticket.bookingNumber || '-', 6.5, true, '0.26 0.26 0.24');
  }

  text(34, 24, `Oprettet ${ticket.generatedAt || ''}`, 5, false, '0.53 0.53 0.50');
  textRight(386, 24, 'busops.albaturist.dk', 5.4, true, '0.24 0.24 0.22');

  const stream = Buffer.from(commands.join('\n'), 'binary');
  const colorSpace = logoSize.components === 1 ? '/DeviceGray' : '/DeviceRGB';
  const imageObject = Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logoSize.width} /Height ${logoSize.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, 'binary'),
    logo,
    Buffer.from('\nendstream', 'binary')
  ]);
  const contentObject = Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'binary'), stream, Buffer.from('\nendstream', 'binary')]);

  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(PAGE_WIDTH)} ${number(PAGE_HEIGHT)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 6 0 R >> >> /Contents 7 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    imageObject,
    contentObject
  ]);
}

module.exports = { createTicketPdf };
