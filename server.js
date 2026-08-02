const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, user) {
  const candidate = crypto.scryptSync(password, user.salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(user.passwordHash, 'hex'));
}
function seed() {
  const admin = hashPassword('admin123');
  const driver1 = hashPassword('chauffor123');
  const driver2 = hashPassword('chauffor123');
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(8, 0, 0, 0);
  return {
    meta: { version: 5, nextId: 20 },
    users: [
      { id: 1, name: 'Administrator', email: 'admin@albaturist.dk', role: 'admin', salt: admin.salt, passwordHash: admin.hash },
      { id: 2, name: 'Mads Chauffør', email: 'mads@albaturist.dk', role: 'driver', salt: driver1.salt, passwordHash: driver1.hash },
      { id: 3, name: 'Sara Chauffør', email: 'sara@albaturist.dk', role: 'driver', salt: driver2.salt, passwordHash: driver2.hash }
    ],
    stops: [], buses: [],
    trips: [],
    passengers: [], baggage: [], expenses: []
  };
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (_) { const db = seed(); saveDb(db); return db; }
}
function saveDb(value = db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, DB_FILE);
}
let db = loadDb();
let migrated = false;
if ((db.meta?.version || 1) < 3) {
  db.stops = []; db.trips = []; db.passengers = []; db.baggage = [];
  db.meta.version = 3; migrated = true;
}
if ((db.meta?.version || 1) < 4) { db.buses = db.buses || []; db.meta.version = 4; migrated = true; }
if ((db.meta?.version || 1) < 5) { db.expenses = db.expenses || []; db.meta.version = 5; migrated = true; }
for (const trip of db.trips) {
  if (!trip.seatCount) { trip.seatCount = 54; migrated = true; }
}
if (migrated) saveDb();
function id() { db.meta.nextId += 1; return db.meta.nextId; }
function cleanUser(user) { const { salt, passwordHash, ...safe } = user; return safe; }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=').map(decodeURIComponent)));
}
function auth(req) { const session = sessions.get(cookies(req).sid); return session && db.users.find(u => u.id === session.userId); }
function allowedTrip(user, trip) { return user.role === 'admin' || trip.primaryDriverId === user.id || trip.secondaryDriverId === user.id; }
function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}
function fail(res, status, message) { json(res, status, { error: message }); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 8e6) throw new Error('For meget data'); }
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error('Ugyldig JSON'); }
}
function tripView(t) {
  const passengers = db.passengers.filter(p => p.tripId === t.id);
  const baggage = db.baggage.filter(b => b.tripId === t.id);
  return { ...t,
    origin: db.stops.find(s => s.id === t.originId), destination: db.stops.find(s => s.id === t.destinationId),
    bus: db.buses.find(b => b.id === t.busId) || null,
    primaryDriver: db.users.find(u => u.id === t.primaryDriverId)?.name || null,
    secondaryDriver: db.users.find(u => u.id === t.secondaryDriverId)?.name || null,
    counts: { passengers: passengers.length, checkedIn: passengers.filter(p => p.checkedIn).length, baggage: baggage.length, onboard: baggage.filter(b => b.status === 'onboard').length }
  };
}
function seatMap(tripId) {
  const trip = db.trips.find(t => t.id === tripId);
  const taken = new Map(db.passengers.filter(p => p.tripId === tripId).map(p => [p.seatNumber, p.id]));
  return Array.from({ length: trip?.seatCount || 54 }, (_, index) => {
    const number = index + 1;
    const isFront = number <= 4;
    const isTable = [13,14,17,18,21,22,25,26].includes(number);
    const assignedBus = trip?.busId ? db.buses.find(b => b.id === trip.busId) : null;
    const lowerDeckSeats = assignedBus?.type === 'double' ? Math.min(assignedBus.lowerDeckSeats || 20, trip.seatCount) : trip?.seatCount;
    return { number, deck: number <= lowerDeckSeats ? 'lower' : 'upper', type: isFront ? 'front' : isTable ? 'table' : 'standard', surcharge: isFront ? 100 : isTable ? 75 : 0, passengerId: taken.get(number) || null };
  });
}
async function api(req, res, pathname) {
  if (pathname === '/api/login' && req.method === 'POST') {
    const data = await body(req); const user = db.users.find(u => u.email.toLowerCase() === String(data.email || '').toLowerCase());
    if (!user || !verifyPassword(String(data.password || ''), user)) return fail(res, 401, 'Forkert e-mail eller adgangskode');
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { userId: user.id, createdAt: Date.now() });
    return json(res, 200, { user: cleanUser(user) }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    sessions.delete(cookies(req).sid); return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const user = auth(req); if (!user) return fail(res, 401, 'Log ind for at fortsætte');
  if (pathname === '/api/me') return json(res, 200, { user: cleanUser(user) });
  if (pathname === '/api/bootstrap') {
    const trips = db.trips.filter(t => allowedTrip(user, t)).map(tripView);
    return json(res, 200, { user: cleanUser(user), trips, stops: db.stops, drivers: user.role === 'admin' ? db.users.filter(u => u.role === 'driver').map(cleanUser) : [], buses: user.role === 'admin' ? db.buses : [] });
  }
  if (pathname === '/api/buses' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette busser');
    const data = await body(req); const name = String(data.name || '').trim(); const registration = String(data.registration || '').trim().toUpperCase(); const type = data.type === 'double' ? 'double' : 'standard'; const seatCount = Number(data.seatCount);
    if (!name || !registration) return fail(res, 400, 'Udfyld bussens navn og registreringsnummer');
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > (type === 'double' ? 84 : 54)) return fail(res, 400, type === 'double' ? 'En dobbeltdækker kan have op til 84 sæder' : 'En almindelig bus kan have op til 54 sæder');
    if (db.buses.some(b => b.registration === registration)) return fail(res, 409, 'Registreringsnummeret findes allerede');
    const lowerDeckSeats = type === 'double' ? Number(data.lowerDeckSeats || 20) : seatCount;
    if (type === 'double' && (!Number.isInteger(lowerDeckSeats) || lowerDeckSeats < 1 || lowerDeckSeats >= seatCount)) return fail(res, 400, 'Angiv et gyldigt antal sæder på underetagen');
    const bus = { id: id(), name, registration, type, seatCount, lowerDeckSeats }; db.buses.push(bus); saveDb(); return json(res, 201, bus);
  }
  const busMatch = pathname.match(/^\/api\/buses\/(\d+)$/);
  if (busMatch) {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre busser');
    const bus = db.buses.find(b => b.id === Number(busMatch[1])); if (!bus) return fail(res, 404, 'Bussen findes ikke');
    if (req.method === 'PATCH') {
      const data = await body(req); const name = String(data.name || '').trim(); const registration = String(data.registration || '').trim().toUpperCase(); const type = data.type === 'double' ? 'double' : 'standard'; const seatCount = Number(data.seatCount);
      if (!name || !registration) return fail(res, 400, 'Udfyld bussens navn og registreringsnummer');
      if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > (type === 'double' ? 84 : 54)) return fail(res, 400, type === 'double' ? 'En dobbeltdækker kan have op til 84 sæder' : 'En almindelig bus kan have op til 54 sæder');
      if (db.buses.some(b => b.id !== bus.id && b.registration === registration)) return fail(res, 409, 'Registreringsnummeret findes allerede');
      const lowerDeckSeats = type === 'double' ? Number(data.lowerDeckSeats || 20) : seatCount;
      if (type === 'double' && (!Number.isInteger(lowerDeckSeats) || lowerDeckSeats < 1 || lowerDeckSeats >= seatCount)) return fail(res, 400, 'Angiv et gyldigt antal sæder på underetagen');
      const highestBooked = Math.max(0,...db.trips.filter(t => t.busId === bus.id).flatMap(t => db.passengers.filter(p => p.tripId === t.id).map(p => p.seatNumber)));
      if (seatCount < highestBooked) return fail(res, 409, `Der er allerede booket sæde ${highestBooked} på denne bus`);
      Object.assign(bus,{ name,registration,type,seatCount,lowerDeckSeats }); db.trips.filter(t => t.busId === bus.id).forEach(t => t.seatCount = seatCount); saveDb(); return json(res, 200, bus);
    }
    if (req.method === 'DELETE') {
      if (db.trips.some(t => t.busId === bus.id)) return fail(res, 409, 'Bussen er tildelt en tur og kan derfor ikke slettes');
      db.buses = db.buses.filter(b => b.id !== bus.id); saveDb(); return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'Handlingen er ikke tilladt');
  }
  if (pathname === '/api/reports' && req.method === 'GET') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan se salg og økonomi');
    const sumByCurrency = records => ['DKK','EUR'].reduce((result,currency) => {
      result[currency] = records.filter(record => record.paymentStatus === 'cash' && (record.paymentCurrency || 'DKK') === currency).reduce((sum,record) => sum + Number(record.cashAmount || 0),0); return result;
    },{});
    const addTrip = record => { const trip = db.trips.find(t => t.id === record.tripId); return { ...record, tripTitle: trip?.title || 'Ukendt tur', departureAt: trip?.departureAt || null, createdByName: record.createdBy ? db.users.find(u => u.id === record.createdBy)?.name || 'Ukendt' : null }; };
    const cashByDriver = db.users.filter(u => u.role === 'driver').map(driver => {
      const held = [...db.passengers,...db.baggage].filter(record => record.paymentStatus === 'cash' && record.paymentLocation === 'bus' && record.cashHolderUserId === driver.id);
      return { driverId: driver.id, driverName: driver.name, amounts: sumByCurrency(held), payments: held.length };
    }).filter(row => row.payments > 0);
    return json(res, 200, {
      summary: {
        tickets: db.passengers.length, paidTickets: db.passengers.filter(p => p.paymentStatus === 'cash').length, unpaidTickets: db.passengers.filter(p => p.paymentStatus !== 'cash').length,
        ticketRevenue: sumByCurrency(db.passengers), baggage: db.baggage.length, paidBaggage: db.baggage.filter(b => b.paymentStatus === 'cash').length, unpaidBaggage: db.baggage.filter(b => b.paymentStatus !== 'cash').length, baggageRevenue: sumByCurrency(db.baggage), cashByDriver, expenseTotals: ['DKK','EUR'].reduce((totals,currency)=>{ totals[currency]=db.expenses.filter(e=>e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0); return totals; },{})
      },
      tickets: db.passengers.map(addTrip), baggage: db.baggage.map(addTrip), expenses: db.expenses.map(addTrip)
    });
  }
  if (pathname === '/api/stops' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette opsamlingssteder');
    const data = await body(req); if (!data.name?.trim()) return fail(res, 400, 'Navn mangler');
    const stop = { id: id(), name: data.name.trim(), address: String(data.address || '').trim() }; db.stops.push(stop); saveDb(); return json(res, 201, stop);
  }
  if (pathname === '/api/drivers' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette chauffører');
    const data = await body(req);
    const name = String(data.name || '').trim(); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || '');
    if (!name || !email || !email.includes('@')) return fail(res, 400, 'Udfyld chaufførens navn og en gyldig e-mail');
    if (password.length < 8) return fail(res, 400, 'Adgangskoden skal være på mindst 8 tegn');
    if (db.users.some(u => u.email.toLowerCase() === email)) return fail(res, 409, 'E-mailadressen bruges allerede');
    const credentials = hashPassword(password);
    const driver = { id: id(), name, email, role: 'driver', salt: credentials.salt, passwordHash: credentials.hash };
    db.users.push(driver); saveDb(); return json(res, 201, cleanUser(driver));
  }
  const driverMatch = pathname.match(/^\/api\/drivers\/(\d+)$/);
  if (driverMatch) {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre chauffører');
    const driver = db.users.find(u => u.id === Number(driverMatch[1]) && u.role === 'driver');
    if (!driver) return fail(res, 404, 'Chaufføren findes ikke');
    if (req.method === 'PATCH') {
      const data = await body(req); const name = String(data.name || '').trim(); const email = String(data.email || '').trim().toLowerCase();
      if (!name || !email || !email.includes('@')) return fail(res, 400, 'Udfyld chaufførens navn og en gyldig e-mail');
      if (db.users.some(u => u.id !== driver.id && u.email.toLowerCase() === email)) return fail(res, 409, 'E-mailadressen bruges allerede');
      driver.name = name; driver.email = email;
      if (data.password) {
        if (String(data.password).length < 8) return fail(res, 400, 'Den nye adgangskode skal være på mindst 8 tegn');
        const credentials = hashPassword(String(data.password)); driver.salt = credentials.salt; driver.passwordHash = credentials.hash;
      }
      saveDb(); return json(res, 200, cleanUser(driver));
    }
    if (req.method === 'DELETE') {
      const assigned = db.trips.some(t => t.primaryDriverId === driver.id || t.secondaryDriverId === driver.id);
      if (assigned) return fail(res, 409, 'Chaufføren er tildelt en tur og kan derfor ikke slettes');
      db.users = db.users.filter(u => u.id !== driver.id); saveDb(); return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'Handlingen er ikke tilladt');
  }
  const stopMatch = pathname.match(/^\/api\/stops\/(\d+)$/);
  if (stopMatch) {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre opsamlingssteder');
    const stop = db.stops.find(s => s.id === Number(stopMatch[1]));
    if (!stop) return fail(res, 404, 'Opsamlingsstedet findes ikke');
    if (req.method === 'PATCH') {
      const data = await body(req); if (!data.name?.trim()) return fail(res, 400, 'Navn mangler');
      stop.name = data.name.trim(); stop.address = String(data.address || '').trim(); saveDb(); return json(res, 200, stop);
    }
    if (req.method === 'DELETE') {
      const inUse = db.trips.some(t => t.originId === stop.id || t.destinationId === stop.id) || db.passengers.some(p => p.pickupStopId === stop.id || p.destinationStopId === stop.id) || db.baggage.some(b => b.pickupStopId === stop.id || b.destinationStopId === stop.id);
      if (inUse) return fail(res, 409, 'Stedet bruges allerede og kan derfor ikke slettes');
      db.stops = db.stops.filter(s => s.id !== stop.id); saveDb(); return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'Handlingen er ikke tilladt');
  }
  if (pathname === '/api/trips' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette ture');
    const data = await body(req); if (!data.title || !data.departureAt || !data.originId || !data.destinationId || !data.primaryDriverId || !data.busId) return fail(res, 400, 'Udfyld turens obligatoriske felter');
    if (Number(data.primaryDriverId) === Number(data.secondaryDriverId)) return fail(res, 400, 'De to chauffører skal være forskellige');
    const bus = db.buses.find(b => b.id === Number(data.busId)); if (!bus) return fail(res, 400, 'Vælg en gyldig bus');
    const trip = { id: id(), title: data.title.trim(), departureAt: new Date(data.departureAt).toISOString(), originId: Number(data.originId), destinationId: Number(data.destinationId), basePrice: Number(data.basePrice || 0), busId: bus.id, seatCount: bus.seatCount, primaryDriverId: Number(data.primaryDriverId), secondaryDriverId: data.secondaryDriverId ? Number(data.secondaryDriverId) : null, status: 'planned' };
    db.trips.push(trip); saveDb(); return json(res, 201, tripView(trip));
  }
  const receiptMatch = pathname.match(/^\/api\/expenses\/(\d+)\/receipt$/);
  if (receiptMatch && req.method === 'GET') {
    const expense = db.expenses.find(e => e.id === Number(receiptMatch[1])); if (!expense) return fail(res, 404, 'Kvitteringen findes ikke');
    const expenseTrip = db.trips.find(t => t.id === expense.tripId); if (!expenseTrip || !allowedTrip(user,expenseTrip)) return fail(res, 403, 'Du har ikke adgang til kvitteringen');
    const file = path.join(__dirname,'data','uploads',expense.receiptFile); if (!fs.existsSync(file)) return fail(res, 404, 'Kvitteringsfilen findes ikke');
    res.writeHead(200,{ 'Content-Type': expense.receiptType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(expense.receiptName)}` }); fs.createReadStream(file).pipe(res); return;
  }
  const match = pathname.match(/^\/api\/trips\/(\d+)(?:\/(passengers|baggage|seats|expenses))?$/);
  if (!match) return fail(res, 404, 'Ikke fundet');
  const trip = db.trips.find(t => t.id === Number(match[1])); if (!trip) return fail(res, 404, 'Turen findes ikke');
  if (!allowedTrip(user, trip)) return fail(res, 403, 'Du er ikke tildelt denne tur');
  const part = match[2];
  if (!part && req.method === 'PATCH') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre antal sæder');
    const data = await body(req); const seatCount = Number(data.seatCount);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 84) return fail(res, 400, 'Antal sæder skal være mellem 1 og 84');
    const highestBookedSeat = Math.max(0, ...db.passengers.filter(p => p.tripId === trip.id).map(p => p.seatNumber));
    if (seatCount < highestBookedSeat) return fail(res, 409, `Der er allerede booket sæde ${highestBookedSeat}. Kapaciteten kan ikke sættes lavere.`);
    trip.seatCount = seatCount; saveDb(); return json(res, 200, tripView(trip));
  }
  if (!part && req.method === 'GET') return json(res, 200, { trip: tripView(trip), passengers: db.passengers.filter(p => p.tripId === trip.id), baggage: db.baggage.filter(b => b.tripId === trip.id), expenses: db.expenses.filter(e => e.tripId === trip.id).map(e => ({...e,createdByName:db.users.find(u=>u.id===e.createdBy)?.name||'Ukendt'})), seats: seatMap(trip.id) });
  if (part === 'seats' && req.method === 'GET') return json(res, 200, seatMap(trip.id));
  if (part === 'passengers' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette passagerer');
    const data = await body(req); const seat = seatMap(trip.id).find(s => s.number === Number(data.seatNumber));
    if (!data.name?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !seat) return fail(res, 400, 'Udfyld passagerens obligatoriske felter');
    if (seat.passengerId) return fail(res, 409, 'Sædet er allerede reserveret');
    if (!['unpaid','cash'].includes(data.paymentStatus)) return fail(res, 400, 'Ugyldig betalingsstatus');
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    const passenger = { id: id(), tripId: trip.id, name: data.name.trim(), phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), paymentStatus: data.paymentStatus, paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation: data.paymentStatus === 'cash' ? 'shop' : null, paymentRecordedAt: data.paymentStatus === 'cash' ? new Date().toISOString() : null, paymentRecordedBy: data.paymentStatus === 'cash' ? user.id : null, cashHolderUserId: null, seatNumber: seat.number, seatType: seat.type, seatSurcharge: seat.surcharge, totalPrice: trip.basePrice + seat.surcharge, checkedIn: false, attendanceStatus: 'pending', checkedInAt: null, checkedInBy: null };
    db.passengers.push(passenger); saveDb(); return json(res, 201, passenger);
  }
  if (part === 'passengers' && req.method === 'PATCH') {
    const data = await body(req); const passenger = db.passengers.find(p => p.id === Number(data.id) && p.tripId === trip.id); if (!passenger) return fail(res, 404, 'Passageren findes ikke');
    if (data.paymentStatus === 'cash') {
      if (passenger.paymentStatus === 'cash') return fail(res, 409, 'Billetten er allerede registreret som betalt');
      const amount = Number(data.cashAmount); const currency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : null; const location = ['bus','shop'].includes(data.paymentLocation) ? data.paymentLocation : null;
      if (!(amount > 0) || !currency || !location) return fail(res, 400, 'Angiv beløb, valuta og betalingssted');
      let cashHolderUserId = null;
      if (location === 'bus') {
        const checkInDriver = [trip.primaryDriverId,trip.secondaryDriverId].includes(passenger.checkedInBy) ? passenger.checkedInBy : null;
        cashHolderUserId = checkInDriver || (user.role === 'driver' ? user.id : Number(data.cashHolderUserId));
        if (![trip.primaryDriverId,trip.secondaryDriverId].includes(cashHolderUserId)) return fail(res, 400, 'Vælg den chauffør, som har pengene');
      }
      passenger.paymentStatus = 'cash'; passenger.cashAmount = amount; passenger.paymentCurrency = currency; passenger.paymentLocation = location; passenger.paymentRecordedAt = new Date().toISOString(); passenger.paymentRecordedBy = user.id; passenger.cashHolderUserId = cashHolderUserId;
    }
    if (typeof data.checkedIn === 'boolean') { passenger.checkedIn = data.checkedIn; passenger.attendanceStatus = passenger.checkedIn ? 'checked_in' : 'pending'; passenger.checkedInAt = passenger.checkedIn ? new Date().toISOString() : null; passenger.checkedInBy = passenger.checkedIn ? user.id : null; if (passenger.checkedIn && passenger.paymentLocation === 'bus' && user.role === 'driver') passenger.cashHolderUserId = user.id; }
    if (data.attendanceStatus === 'no_show') { passenger.checkedIn = false; passenger.attendanceStatus = 'no_show'; passenger.checkedInAt = null; passenger.checkedInBy = null; }
    saveDb(); return json(res, 200, passenger);
  }
  if (part === 'baggage' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan registrere bagage');
    const data = await body(req); if (!data.senderName?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !data.pieces) return fail(res, 400, 'Udfyld bagagens obligatoriske felter');
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    const item = { id: id(), tripId: trip.id, senderName: data.senderName.trim(), phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), pieces: Number(data.pieces), description: String(data.description || '').trim(), paymentStatus: data.paymentStatus === 'cash' ? 'cash' : 'unpaid', paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation: data.paymentStatus === 'cash' ? 'shop' : null, paymentRecordedAt: data.paymentStatus === 'cash' ? new Date().toISOString() : null, paymentRecordedBy: data.paymentStatus === 'cash' ? user.id : null, cashHolderUserId: null, notes: String(data.notes || '').trim(), status: 'registered' };
    db.baggage.push(item); saveDb(); return json(res, 201, item);
  }
  if (part === 'baggage' && req.method === 'PATCH') {
    const data = await body(req); const item = db.baggage.find(b => b.id === Number(data.id) && b.tripId === trip.id); if (!item) return fail(res, 404, 'Bagagen findes ikke');
    if (data.paymentStatus === 'cash') {
      if (item.paymentStatus === 'cash') return fail(res, 409, 'Bagagen er allerede registreret som betalt');
      const amount = Number(data.cashAmount); const currency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : null; const location = ['bus','shop'].includes(data.paymentLocation) ? data.paymentLocation : null;
      if (!(amount > 0) || !currency || !location) return fail(res, 400, 'Angiv beløb, valuta og betalingssted');
      let cashHolderUserId = null;
      if (location === 'bus') {
        cashHolderUserId = user.role === 'driver' ? user.id : Number(data.cashHolderUserId);
        if (![trip.primaryDriverId,trip.secondaryDriverId].includes(cashHolderUserId)) return fail(res, 400, 'Vælg den chauffør, som har pengene');
      }
      item.paymentStatus = 'cash'; item.cashAmount = amount; item.paymentCurrency = currency; item.paymentLocation = location; item.paymentRecordedAt = new Date().toISOString(); item.paymentRecordedBy = user.id; item.cashHolderUserId = cashHolderUserId;
    }
    if (data.status !== undefined) {
      if (!['registered','received','onboard','delivered','unclaimed'].includes(data.status)) return fail(res, 400, 'Ugyldig status');
      item.status = data.status;
    }
    saveDb(); return json(res, 200, item);
  }
  if (part === 'expenses' && req.method === 'POST') {
    const data = await body(req); const amount = Number(data.amount); const currency = ['DKK','EUR'].includes(data.currency) ? data.currency : null; const category = String(data.category || '').trim();
    if (!(amount > 0) || !currency || !category) return fail(res, 400, 'Angiv kategori, beløb og valuta');
    const receiptType = String(data.receiptType || ''); const receiptName = path.basename(String(data.receiptName || 'kvittering'));
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(receiptType)) return fail(res, 400, 'Kvitteringen skal være PDF, JPG, PNG eller WebP');
    const encoded = String(data.receiptData || '').replace(/^data:[^;]+;base64,/,''); const fileData = Buffer.from(encoded,'base64');
    if (!fileData.length || fileData.length > 5 * 1024 * 1024) return fail(res, 400, 'Kvitteringen skal være mellem 1 byte og 5 MB');
    const extensions = { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf' }; const receiptFile = `${crypto.randomBytes(18).toString('hex')}${extensions[receiptType]}`;
    const uploadDir = path.join(__dirname,'data','uploads'); fs.mkdirSync(uploadDir,{recursive:true}); fs.writeFileSync(path.join(uploadDir,receiptFile),fileData);
    const expense = { id:id(),tripId:trip.id,expenseDate:trip.departureAt,category,description:String(data.description||'').trim(),amount,currency,receiptName,receiptType,receiptFile,createdAt:new Date().toISOString(),createdBy:user.id };
    db.expenses.push(expense); saveDb(); return json(res,201,{...expense,createdByName:user.name});
  }
  return fail(res, 405, 'Handlingen er ikke tilladt');
}
function staticFile(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(file).pipe(res); return true;
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  try { if (pathname.startsWith('/api/')) await api(req, res, pathname); else if (!staticFile(res, pathname)) fail(res, 404, 'Ikke fundet'); }
  catch (error) { console.error(error); fail(res, 500, error.message || 'Intern fejl'); }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log(`BusOps kører på http://${HOST}:${PORT}`));
module.exports = { server, seed, hashPassword, verifyPassword, seatMap };
