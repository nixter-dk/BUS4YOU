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
    meta: { version: 8, nextId: 20 },
    users: [
      { id: 1, name: 'Administrator', email: 'admin@albaturist.dk', role: 'admin', salt: admin.salt, passwordHash: admin.hash },
      { id: 2, name: 'Mads Chauffør', email: 'mads@albaturist.dk', role: 'driver', salt: driver1.salt, passwordHash: driver1.hash },
      { id: 3, name: 'Sara Chauffør', email: 'sara@albaturist.dk', role: 'driver', salt: driver2.salt, passwordHash: driver2.hash }
    ],
    stops: [], buses: [],
    trips: [],
    passengers: [], baggage: [], expenses: [], cashSettlements: []
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
if ((db.meta?.version || 1) < 6) { db.cashSettlements = db.cashSettlements || []; db.meta.version = 6; migrated = true; }
if ((db.meta?.version || 1) < 7) {
  for (const bus of db.buses || []) if (bus.type === 'double') { bus.seatCount = 84; bus.lowerDeckSeats = 22; db.trips.filter(t => t.busId === bus.id).forEach(t => t.seatCount = 84); }
  db.meta.version = 7; migrated = true;
}
if ((db.meta?.version || 1) < 8) { for (const expense of db.expenses || []) if (!expense.status) expense.status = 'pending'; db.meta.version = 8; migrated = true; }
for (const trip of db.trips) {
  if (!trip.seatCount) { trip.seatCount = 54; migrated = true; }
}
if (migrated) saveDb();
function id() { db.meta.nextId += 1; return db.meta.nextId; }
function cleanUser(user) { const { salt, passwordHash, ...safe } = user; return safe; }
function userName(userId) { return userId ? db.users.find(user => user.id === userId)?.name || 'Ukendt medarbejder' : null; }
function passengerRecordView(passenger) { return { ...passenger, checkedInByName:userName(passenger.checkedInBy), paymentRecordedByName:userName(passenger.paymentRecordedBy), cashHolderUserName:userName(passenger.cashHolderUserId), attendanceHistory:(passenger.attendanceHistory||[]).map(event=>({...event,userName:userName(event.userId),receivedByName:userName(event.receivedBy)})) }; }
function baggageRecordView(item) { return { ...item, createdByName:userName(item.createdBy), paymentRecordedByName:userName(item.paymentRecordedBy), cashHolderUserName:userName(item.cashHolderUserId), statusUpdatedByName:userName(item.statusUpdatedBy), baggageHistory:(item.baggageHistory||[]).map(event=>({...event,userName:userName(event.userId)})) }; }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=').map(decodeURIComponent)));
}
function auth(req) { const session = sessions.get(cookies(req).sid); return session && db.users.find(u => u.id === session.userId); }
function allowedTrip(user, trip) { return user.role === 'admin' || user.role === 'sales_manager' || trip.primaryDriverId === user.id || trip.secondaryDriverId === user.id; }
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
    salesManager: db.users.find(u => u.id === t.salesManagerId)?.name || null,
    counts: { passengers: passengers.length, checkedIn: passengers.filter(p => p.checkedIn).length, baggage: baggage.length, onboard: baggage.filter(b => b.status === 'onboard').length }
  };
}
function seatMap(tripId) {
  const trip = db.trips.find(t => t.id === tripId);
  const taken = new Map(db.passengers.filter(p => p.tripId === tripId).map(p => [p.seatNumber, p.id]));
  return Array.from({ length: trip?.seatCount || 54 }, (_, index) => {
    const number = index + 1;
    const assignedBus = trip?.busId ? db.buses.find(b => b.id === trip.busId) : null;
    const isDouble = assignedBus?.type === 'double' || trip?.seatCount === 84;
    const isFront = isDouble ? number >= 23 && number <= 26 : number <= 4;
    const isTable = isDouble ? number >= 1 && number <= 8 : [13,14,17,18,21,22,25,26].includes(number);
    const lowerDeckSeats = isDouble ? 22 : trip?.seatCount;
    return { number, deck: number <= lowerDeckSeats ? 'lower' : 'upper', type: isFront ? 'front' : isTable ? 'table' : 'standard', surcharge: isFront ? 100 : isTable ? 75 : 0, passengerId: taken.get(number) || null };
  });
}
function unsettledCashRecords(tripId,driverId) {
  return [...db.passengers.map(record=>({record,kind:'passenger'})),...db.baggage.map(record=>({record,kind:'baggage'}))].filter(item=>item.record.tripId===tripId&&item.record.paymentStatus==='cash'&&['bus','departure'].includes(item.record.paymentLocation)&&item.record.cashHolderUserId===driverId&&!item.record.cashHandedOverAt);
}
function cashAmounts(items) { return ['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=items.filter(item=>(item.record?.paymentCurrency||item.paymentCurrency||'DKK')===currency).reduce((sum,item)=>sum+Number(item.record?.cashAmount||item.cashAmount||0),0);return totals;},{}); }
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
    return json(res, 200, { user: cleanUser(user), trips, stops: db.stops, drivers: user.role === 'admin' ? db.users.filter(u => u.role === 'driver').map(cleanUser) : [], salesManagers: user.role === 'admin' ? db.users.filter(u => u.role === 'sales_manager').map(cleanUser) : [], buses: user.role === 'admin' ? db.buses : [] });
  }
  if (pathname === '/api/buses' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette busser');
    const data = await body(req); const name = String(data.name || '').trim(); const registration = String(data.registration || '').trim().toUpperCase(); const type = data.type === 'double' ? 'double' : 'standard'; const seatCount = type === 'double' ? 84 : Number(data.seatCount);
    if (!name || !registration) return fail(res, 400, 'Udfyld bussens navn og registreringsnummer');
    if (type === 'standard' && (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 54)) return fail(res, 400, 'En almindelig bus kan have op til 54 sæder');
    if (db.buses.some(b => b.registration === registration)) return fail(res, 409, 'Registreringsnummeret findes allerede');
    const lowerDeckSeats = type === 'double' ? 22 : seatCount;
    const bus = { id: id(), name, registration, type, seatCount, lowerDeckSeats }; db.buses.push(bus); saveDb(); return json(res, 201, bus);
  }
  const busMatch = pathname.match(/^\/api\/buses\/(\d+)$/);
  if (busMatch) {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre busser');
    const bus = db.buses.find(b => b.id === Number(busMatch[1])); if (!bus) return fail(res, 404, 'Bussen findes ikke');
    if (req.method === 'PATCH') {
      const data = await body(req); const name = String(data.name || '').trim(); const registration = String(data.registration || '').trim().toUpperCase(); const type = data.type === 'double' ? 'double' : 'standard'; const seatCount = type === 'double' ? 84 : Number(data.seatCount);
      if (!name || !registration) return fail(res, 400, 'Udfyld bussens navn og registreringsnummer');
      if (type === 'standard' && (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 54)) return fail(res, 400, 'En almindelig bus kan have op til 54 sæder');
      if (db.buses.some(b => b.id !== bus.id && b.registration === registration)) return fail(res, 409, 'Registreringsnummeret findes allerede');
      const lowerDeckSeats = type === 'double' ? 22 : seatCount;
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
    const addTrip = record => { const trip = db.trips.find(t => t.id === record.tripId); return { ...record, tripTitle: trip?.title || 'Ukendt tur', departureAt: trip?.departureAt || null, createdByName: userName(record.createdBy), checkedInByName:userName(record.checkedInBy), paymentRecordedByName:userName(record.paymentRecordedBy), cashHolderUserName:userName(record.cashHolderUserId), statusUpdatedByName:userName(record.statusUpdatedBy), reviewedByName:userName(record.reviewedBy) }; };
    const cashByDriver = db.users.filter(u => ['driver','sales_manager'].includes(u.role)).map(driver => {
      const held = [...db.passengers,...db.baggage].filter(record => record.paymentStatus === 'cash' && ['bus','departure'].includes(record.paymentLocation) && record.cashHolderUserId === driver.id && !record.cashHandedOverAt);
      return { driverId: driver.id, driverName: driver.name, amounts: sumByCurrency(held), payments: held.length };
    }).filter(row => row.payments > 0);
    const approvedSettlements = db.cashSettlements.filter(settlement=>settlement.status==='approved');
    const cashAtOffice = ['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=approvedSettlements.reduce((sum,settlement)=>sum+Number(settlement.delivered?.[currency]||0),0);return totals;},{});
    const tripResults = db.trips.map(trip => {
      const passengers=db.passengers.filter(p=>p.tripId===trip.id),baggage=db.baggage.filter(b=>b.tripId===trip.id),tripExpenses=db.expenses.filter(e=>e.tripId===trip.id);
      const revenueRecords=[...passengers,...baggage].filter(record=>record.paymentStatus==='cash');
      const revenue=sumByCurrency(revenueRecords),approvedExpenses=['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=tripExpenses.filter(e=>e.status==='approved'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0);return totals;},{}),pendingExpenses=['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=tripExpenses.filter(e=>e.status==='pending'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0);return totals;},{});
      return { tripId:trip.id,title:trip.title,departureAt:trip.departureAt,busName:db.buses.find(b=>b.id===trip.busId)?.name||'Ingen bus',passengers:passengers.length,seatCount:trip.seatCount,occupancy:trip.seatCount?Math.round(passengers.length/trip.seatCount*100):0,unpaid:passengers.filter(p=>p.paymentStatus==='unpaid').length,freeTickets:passengers.filter(p=>p.paymentStatus==='free').length,revenue,approvedExpenses,pendingExpenses,net:{DKK:revenue.DKK-approvedExpenses.DKK,EUR:revenue.EUR-approvedExpenses.EUR} };
    });
    return json(res, 200, {
      summary: {
        tickets: db.passengers.length, paidTickets: db.passengers.filter(p => p.paymentStatus === 'cash').length, freeTickets: db.passengers.filter(p => p.paymentStatus === 'free').length, unpaidTickets: db.passengers.filter(p => p.paymentStatus === 'unpaid').length,
        ticketRevenue: sumByCurrency(db.passengers), baggage: db.baggage.length, paidBaggage: db.baggage.filter(b => b.paymentStatus === 'cash').length, unpaidBaggage: db.baggage.filter(b => b.paymentStatus !== 'cash').length, baggageRevenue: sumByCurrency(db.baggage), cashByDriver, cashAtOffice, expenseTotals: ['DKK','EUR'].reduce((totals,currency)=>{ totals[currency]=db.expenses.filter(e=>e.status==='approved'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0); return totals; },{}), pendingExpenseTotals: ['DKK','EUR'].reduce((totals,currency)=>{ totals[currency]=db.expenses.filter(e=>e.status==='pending'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0); return totals; },{})
      },
      tickets: db.passengers.map(addTrip), baggage: db.baggage.map(addTrip), expenses: db.expenses.map(addTrip), tripResults
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
  if (pathname === '/api/sales-managers' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan oprette salgschefer');
    const data=await body(req);const name=String(data.name||'').trim(),email=String(data.email||'').trim().toLowerCase(),password=String(data.password||'');
    if(!name||!email.includes('@'))return fail(res,400,'Udfyld salgschefens navn og en gyldig e-mail');
    if(password.length<8)return fail(res,400,'Adgangskoden skal være på mindst 8 tegn');
    if(db.users.some(candidate=>candidate.email.toLowerCase()===email))return fail(res,409,'E-mailadressen bruges allerede');
    const credentials=hashPassword(password),salesManager={id:id(),name,email,role:'sales_manager',salt:credentials.salt,passwordHash:credentials.hash};db.users.push(salesManager);saveDb();return json(res,201,cleanUser(salesManager));
  }
  const salesManagerMatch=pathname.match(/^\/api\/sales-managers\/(\d+)$/);
  if(salesManagerMatch){
    if(user.role!=='admin')return fail(res,403,'Kun administratoren kan ændre salgschefer');
    const salesManager=db.users.find(candidate=>candidate.id===Number(salesManagerMatch[1])&&candidate.role==='sales_manager');if(!salesManager)return fail(res,404,'Salgschefen findes ikke');
    if(req.method==='PATCH'){
      const data=await body(req),name=String(data.name||'').trim(),email=String(data.email||'').trim().toLowerCase();if(!name||!email.includes('@'))return fail(res,400,'Udfyld navn og en gyldig e-mail');
      if(db.users.some(candidate=>candidate.id!==salesManager.id&&candidate.email.toLowerCase()===email))return fail(res,409,'E-mailadressen bruges allerede');
      salesManager.name=name;salesManager.email=email;if(data.password){if(String(data.password).length<8)return fail(res,400,'Den nye adgangskode skal være på mindst 8 tegn');const credentials=hashPassword(String(data.password));salesManager.salt=credentials.salt;salesManager.passwordHash=credentials.hash}saveDb();return json(res,200,cleanUser(salesManager));
    }
    if(req.method==='DELETE'){
      const hasAuditHistory=db.passengers.some(passenger=>passenger.checkedInBy===salesManager.id||passenger.paymentRecordedBy===salesManager.id||passenger.cashHolderUserId===salesManager.id||(passenger.attendanceHistory||[]).some(event=>event.userId===salesManager.id||event.receivedBy===salesManager.id))||db.baggage.some(item=>item.createdBy===salesManager.id||item.paymentRecordedBy===salesManager.id||item.cashHolderUserId===salesManager.id||item.statusUpdatedBy===salesManager.id||(item.baggageHistory||[]).some(event=>event.userId===salesManager.id))||db.cashSettlements.some(settlement=>settlement.driverId===salesManager.id||settlement.submittedBy===salesManager.id);
      if(db.trips.some(trip=>trip.salesManagerId===salesManager.id)||hasAuditHistory)return fail(res,409,'Salgschefen er knyttet til ture eller historik og kan derfor ikke slettes');db.users=db.users.filter(candidate=>candidate.id!==salesManager.id);saveDb();return json(res,200,{ok:true});
    }
    return fail(res,405,'Handlingen er ikke tilladt');
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
    const salesManagerId=data.salesManagerId?Number(data.salesManagerId):null;if(salesManagerId&&!db.users.some(candidate=>candidate.id===salesManagerId&&candidate.role==='sales_manager'))return fail(res,400,'Vælg en gyldig salgschef');
    const trip = { id: id(), title: data.title.trim(), departureAt: new Date(data.departureAt).toISOString(), originId: Number(data.originId), destinationId: Number(data.destinationId), basePrice: Number(data.basePrice || 0), busId: bus.id, seatCount: bus.seatCount, primaryDriverId: Number(data.primaryDriverId), secondaryDriverId: data.secondaryDriverId ? Number(data.secondaryDriverId) : null, salesManagerId, status: 'planned' };
    db.trips.push(trip); saveDb(); return json(res, 201, tripView(trip));
  }
  const expenseMatch = pathname.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseMatch && req.method === 'PATCH') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan godkende udgifter');
    const expense=db.expenses.find(e=>e.id===Number(expenseMatch[1]));if(!expense)return fail(res,404,'Udgiften findes ikke');
    const data=await body(req);if(!['approved','rejected'].includes(data.status))return fail(res,400,'Vælg godkendt eller afvist');
    if(expense.status!=='pending')return fail(res,409,'Udgiften er allerede behandlet');
    expense.status=data.status;expense.reviewedAt=new Date().toISOString();expense.reviewedBy=user.id;expense.reviewNote=String(data.reviewNote||'').trim();saveDb();return json(res,200,{...expense,createdByName:db.users.find(u=>u.id===expense.createdBy)?.name||'Ukendt',reviewedByName:user.name});
  }
  const receiptMatch = pathname.match(/^\/api\/expenses\/(\d+)\/receipt$/);
  if (receiptMatch && req.method === 'GET') {
    const expense = db.expenses.find(e => e.id === Number(receiptMatch[1])); if (!expense) return fail(res, 404, 'Kvitteringen findes ikke');
    const expenseTrip = db.trips.find(t => t.id === expense.tripId); if (!expenseTrip || !allowedTrip(user,expenseTrip)) return fail(res, 403, 'Du har ikke adgang til kvitteringen');
    if(user.role==='sales_manager')return fail(res,403,'Salgschefen har ikke adgang til turudgifter');
    const file = path.join(__dirname,'data','uploads',expense.receiptFile); if (!fs.existsSync(file)) return fail(res, 404, 'Kvitteringsfilen findes ikke');
    res.writeHead(200,{ 'Content-Type': expense.receiptType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(expense.receiptName)}` }); fs.createReadStream(file).pipe(res); return;
  }
  const match = pathname.match(/^\/api\/trips\/(\d+)(?:\/(passengers|baggage|seats|expenses|settlements))?$/);
  if (!match) return fail(res, 404, 'Ikke fundet');
  const trip = db.trips.find(t => t.id === Number(match[1])); if (!trip) return fail(res, 404, 'Turen findes ikke');
  if (!allowedTrip(user, trip)) return fail(res, 403, 'Du er ikke tildelt denne tur');
  const part = match[2];
  if (!part && req.method === 'PATCH') {
    const data = await body(req);
    if (data.completedStopId) {
      const stopId = Number(data.completedStopId); if (!db.stops.some(s => s.id === stopId)) return fail(res,400,'Opsamlingsstedet findes ikke');
      if(user.role==='sales_manager'&&stopId!==trip.originId)return fail(res,403,'Salgschefen kan kun afslutte turens startsted');
      trip.completedStopIds = trip.completedStopIds || []; if (!trip.completedStopIds.includes(stopId)) trip.completedStopIds.push(stopId); saveDb(); return json(res,200,tripView(trip));
    }
    if (Object.prototype.hasOwnProperty.call(data,'salesManagerId')) {
      if(user.role!=='admin')return fail(res,403,'Kun administratoren kan tildele en salgschef');
      const checkInStarted=db.passengers.some(passenger=>passenger.tripId===trip.id&&(passenger.checkedIn||passenger.attendanceHistory?.some(event=>event.action==='checked_in')));if(checkInStarted)return fail(res,409,'Salgschefen er låst, fordi check-in er begyndt på turen');
      const salesManagerId=data.salesManagerId?Number(data.salesManagerId):null;if(salesManagerId&&!db.users.some(candidate=>candidate.id===salesManagerId&&candidate.role==='sales_manager'))return fail(res,400,'Vælg en gyldig salgschef');
      trip.salesManagerId=salesManagerId;saveDb();return json(res,200,tripView(trip));
    }
    if (Object.prototype.hasOwnProperty.call(data,'primaryDriverId') || Object.prototype.hasOwnProperty.call(data,'secondaryDriverId')) {
      if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan ændre chauffører på en tur');
      const checkInStarted = db.passengers.some(passenger => passenger.tripId === trip.id && (passenger.checkedIn || passenger.attendanceHistory?.some(event => event.action === 'checked_in')));
      if (checkInStarted) return fail(res,409,'Chaufførerne er låst, fordi check-in er begyndt på turen');
      const primaryDriverId = Number(data.primaryDriverId); const secondaryDriverId = data.secondaryDriverId ? Number(data.secondaryDriverId) : null;
      const primaryDriver = db.users.find(candidate => candidate.id === primaryDriverId && candidate.role === 'driver');
      const secondaryDriver = secondaryDriverId ? db.users.find(candidate => candidate.id === secondaryDriverId && candidate.role === 'driver') : null;
      if (!primaryDriver || (secondaryDriverId && !secondaryDriver)) return fail(res,400,'Vælg gyldige chauffører fra chaufførregisteret');
      if (primaryDriverId === secondaryDriverId) return fail(res,400,'Primær og sekundær chauffør skal være forskellige');
      trip.primaryDriverId = primaryDriverId; trip.secondaryDriverId = secondaryDriverId; saveDb(); return json(res,200,tripView(trip));
    }
    if (data.busId) {
      if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan skifte bus');
      const bus = db.buses.find(b=>b.id===Number(data.busId)); if(!bus)return fail(res,404,'Bussen findes ikke');
      const highestBookedSeat = Math.max(0,...db.passengers.filter(p=>p.tripId===trip.id).map(p=>p.seatNumber)); if(bus.seatCount<highestBookedSeat)return fail(res,409,`Sæde ${highestBookedSeat} er allerede reserveret og findes ikke i den valgte bus`);
      trip.busId=bus.id;trip.seatCount=bus.seatCount;saveDb();return json(res,200,tripView(trip));
    }
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre antal sæder');
    const seatCount = Number(data.seatCount);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 84) return fail(res, 400, 'Antal sæder skal være mellem 1 og 84');
    const highestBookedSeat = Math.max(0, ...db.passengers.filter(p => p.tripId === trip.id).map(p => p.seatNumber));
    if (seatCount < highestBookedSeat) return fail(res, 409, `Der er allerede booket sæde ${highestBookedSeat}. Kapaciteten kan ikke sættes lavere.`);
    trip.seatCount = seatCount; saveDb(); return json(res, 200, tripView(trip));
  }
  if (!part && req.method === 'GET') {
    const startOnly=record=>user.role!=='sales_manager'||record.pickupStopId===trip.originId;
    const settlements=db.cashSettlements.filter(settlement=>settlement.tripId===trip.id&&(user.role!=='sales_manager'||settlement.driverId===user.id)).map(settlement=>({...settlement,driverName:db.users.find(candidate=>candidate.id===settlement.driverId)?.name||'Ukendt',submittedByName:db.users.find(candidate=>candidate.id===settlement.submittedBy)?.name||'Ukendt',reviewedByName:settlement.reviewedBy?db.users.find(candidate=>candidate.id===settlement.reviewedBy)?.name||'Ukendt':null}));
    const expenses=user.role==='sales_manager'?[]:db.expenses.filter(expense=>expense.tripId===trip.id).map(expense=>({...expense,createdByName:db.users.find(candidate=>candidate.id===expense.createdBy)?.name||'Ukendt',reviewedByName:expense.reviewedBy?db.users.find(candidate=>candidate.id===expense.reviewedBy)?.name||'Ukendt':null}));
    return json(res,200,{trip:tripView(trip),passengers:db.passengers.filter(passenger=>passenger.tripId===trip.id&&startOnly(passenger)).map(passengerRecordView),baggage:db.baggage.filter(item=>item.tripId===trip.id&&startOnly(item)).map(baggageRecordView),expenses,settlements,seats:seatMap(trip.id)});
  }
  if (part === 'seats' && req.method === 'GET') return json(res, 200, seatMap(trip.id));
  if (part === 'passengers' && req.method === 'POST') {
    if (!['admin','sales_manager'].includes(user.role)) return fail(res, 403, 'Kun administratoren og turens salgschef kan oprette passagerer');
    const data = await body(req); const seat = seatMap(trip.id).find(s => s.number === Number(data.seatNumber));
    if (!data.name?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !seat) return fail(res, 400, 'Udfyld passagerens obligatoriske felter');
    if(user.role==='sales_manager'&&Number(data.pickupStopId)!==trip.originId)return fail(res,403,'Salgschefen kan kun sælge billetter fra turens startsted');
    if (seat.passengerId) return fail(res, 409, 'Sædet er allerede reserveret');
    if (!['unpaid','cash','free'].includes(data.paymentStatus)) return fail(res, 400, 'Ugyldig betalingsstatus');
    if(data.paymentStatus==='cash'&&!(Number(data.cashAmount)>0))return fail(res,400,'Angiv det modtagne kontantbeløb');
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    if(user.role==='sales_manager'&&data.paymentStatus==='free')return fail(res,403,'Kun administratoren kan udstede gratis billetter');
    const paymentLocation=data.paymentStatus==='cash'?(user.role==='sales_manager'?'departure':'shop'):null,cashHolderUserId=data.paymentStatus==='cash'&&user.role==='sales_manager'?user.id:null;
    const passenger = { id: id(), tripId: trip.id, name: data.name.trim(), phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), paymentStatus: data.paymentStatus, paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation, paymentRecordedAt: ['cash','free'].includes(data.paymentStatus) ? new Date().toISOString() : null, paymentRecordedBy: ['cash','free'].includes(data.paymentStatus) ? user.id : null, cashHolderUserId, freeTicketReason: data.paymentStatus === 'free' ? String(data.freeTicketReason || '').trim() : '', seatNumber: seat.number, seatType: seat.type, seatSurcharge: seat.surcharge, totalPrice: data.paymentStatus === 'free' ? 0 : trip.basePrice + seat.surcharge, checkedIn: false, attendanceStatus: 'pending', checkedInAt: null, checkedInBy: null };
    db.passengers.push(passenger); saveDb(); return json(res, 201, passengerRecordView(passenger));
  }
  if (part === 'passengers' && req.method === 'PATCH') {
    const data = await body(req); const passenger = db.passengers.find(p => p.id === Number(data.id) && p.tripId === trip.id); if (!passenger) return fail(res, 404, 'Passageren findes ikke');
    if(user.role==='sales_manager'&&passenger.pickupStopId!==trip.originId)return fail(res,403,'Salgschefen kan kun betjene passagerer ved turens startsted');
    if (data.paymentStatus === 'cash') {
      if (passenger.paymentStatus !== 'unpaid') return fail(res, 409, 'Billetten er allerede afsluttet som betalt eller gratis');
      const amount = Number(data.cashAmount); const currency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : null; const location = user.role==='sales_manager'?'departure':['bus','shop'].includes(data.paymentLocation) ? data.paymentLocation : null;
      if (!(amount > 0) || !currency || !location) return fail(res, 400, 'Angiv beløb, valuta og betalingssted');
      let cashHolderUserId = null;
      if (location === 'departure') cashHolderUserId=user.id;
      if (location === 'bus') {
        const checkInDriver = [trip.primaryDriverId,trip.secondaryDriverId].includes(passenger.checkedInBy) ? passenger.checkedInBy : null;
        cashHolderUserId = checkInDriver || (user.role === 'driver' ? user.id : Number(data.cashHolderUserId));
        if (![trip.primaryDriverId,trip.secondaryDriverId].includes(cashHolderUserId)) return fail(res, 400, 'Vælg den chauffør, som har pengene');
      }
      passenger.paymentStatus = 'cash'; passenger.cashAmount = amount; passenger.paymentCurrency = currency; passenger.paymentLocation = location; passenger.paymentRecordedAt = new Date().toISOString(); passenger.paymentRecordedBy = user.id; passenger.cashHolderUserId = cashHolderUserId;
    }
    if (typeof data.checkedIn === 'boolean') {
      if (!data.checkedIn && passenger.checkedIn && user.role === 'driver' && Date.now() - new Date(passenger.checkedInAt).getTime() > 30000) return fail(res, 403, 'Fortrydelsesfristen er udløbet. Kontakt administratoren.');
      passenger.checkedIn = data.checkedIn; passenger.attendanceStatus = passenger.checkedIn ? 'checked_in' : 'pending'; passenger.checkedInAt = passenger.checkedIn ? new Date().toISOString() : null; passenger.checkedInBy = passenger.checkedIn ? user.id : null;
      if (passenger.checkedIn && passenger.paymentLocation === 'bus' && user.role === 'driver') passenger.cashHolderUserId = user.id;
      passenger.attendanceHistory = passenger.attendanceHistory || []; const attendanceEvent={ action:passenger.checkedIn?'checked_in':'check_in_undone',at:new Date().toISOString(),userId:user.id,stopId:passenger.pickupStopId }; if(passenger.checkedIn)Object.assign(attendanceEvent,{receivedAmount:passenger.paymentStatus==='cash'?Number(passenger.cashAmount||0):0,receivedCurrency:passenger.paymentCurrency||'DKK',receivedBy:passenger.paymentStatus==='cash'?(passenger.cashHolderUserId||passenger.paymentRecordedBy):null}); passenger.attendanceHistory.push(attendanceEvent);
    }
    if (data.attendanceStatus === 'no_show') { passenger.checkedIn = false; passenger.attendanceStatus = 'no_show'; passenger.checkedInAt = null; passenger.checkedInBy = null; passenger.attendanceHistory = passenger.attendanceHistory || []; passenger.attendanceHistory.push({action:'no_show',at:new Date().toISOString(),userId:user.id,stopId:passenger.pickupStopId}); }
    saveDb(); return json(res, 200, passengerRecordView(passenger));
  }
  if (part === 'baggage' && req.method === 'POST') {
    if (!['admin','sales_manager'].includes(user.role)) return fail(res, 403, 'Kun administratoren og turens salgschef kan registrere bagage');
    const data = await body(req); if (!data.senderName?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !data.pieces) return fail(res, 400, 'Udfyld bagagens obligatoriske felter');
    if(user.role==='sales_manager'&&Number(data.pickupStopId)!==trip.originId)return fail(res,403,'Salgschefen kan kun modtage bagage ved turens startsted');
    if(data.paymentStatus==='cash'&&!(Number(data.cashAmount)>0))return fail(res,400,'Angiv det modtagne kontantbeløb');
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    const createdAt=new Date().toISOString();
    const item = { id: id(), tripId: trip.id, senderName: data.senderName.trim(), phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), pieces: Number(data.pieces), description: String(data.description || '').trim(), paymentStatus: data.paymentStatus === 'cash' ? 'cash' : 'unpaid', paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation: data.paymentStatus === 'cash' ? (user.role==='sales_manager'?'departure':'shop') : null, paymentRecordedAt: data.paymentStatus === 'cash' ? createdAt : null, paymentRecordedBy: data.paymentStatus === 'cash' ? user.id : null, cashHolderUserId: data.paymentStatus === 'cash'&&user.role==='sales_manager'?user.id:null, notes: String(data.notes || '').trim(), status: 'registered', createdAt, createdBy:user.id, statusUpdatedAt:createdAt, statusUpdatedBy:user.id, baggageHistory:[{action:'registered',at:createdAt,userId:user.id}] };
    db.baggage.push(item); saveDb(); return json(res, 201, baggageRecordView(item));
  }
  if (part === 'baggage' && req.method === 'PATCH') {
    const data = await body(req); const item = db.baggage.find(b => b.id === Number(data.id) && b.tripId === trip.id); if (!item) return fail(res, 404, 'Bagagen findes ikke');
    if(user.role==='sales_manager'&&item.pickupStopId!==trip.originId)return fail(res,403,'Salgschefen kan kun betjene bagage ved turens startsted');
    if (data.paymentStatus === 'cash') {
      if (item.paymentStatus === 'cash') return fail(res, 409, 'Bagagen er allerede registreret som betalt');
      const amount = Number(data.cashAmount); const currency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : null; const location = user.role==='sales_manager'?'departure':['bus','shop'].includes(data.paymentLocation) ? data.paymentLocation : null;
      if (!(amount > 0) || !currency || !location) return fail(res, 400, 'Angiv beløb, valuta og betalingssted');
      let cashHolderUserId = null;
      if (location === 'departure') cashHolderUserId=user.id;
      if (location === 'bus') {
        cashHolderUserId = user.role === 'driver' ? user.id : Number(data.cashHolderUserId);
        if (![trip.primaryDriverId,trip.secondaryDriverId].includes(cashHolderUserId)) return fail(res, 400, 'Vælg den chauffør, som har pengene');
      }
      item.paymentStatus = 'cash'; item.cashAmount = amount; item.paymentCurrency = currency; item.paymentLocation = location; item.paymentRecordedAt = new Date().toISOString(); item.paymentRecordedBy = user.id; item.cashHolderUserId = cashHolderUserId;
    }
    if (data.status !== undefined) {
      if (!['registered','received','onboard','delivered','unclaimed'].includes(data.status)) return fail(res, 400, 'Ugyldig status');
      item.status = data.status; item.statusUpdatedAt=new Date().toISOString(); item.statusUpdatedBy=user.id; item.baggageHistory=item.baggageHistory||[]; item.baggageHistory.push({action:data.status,at:item.statusUpdatedAt,userId:user.id});
    }
    saveDb(); return json(res, 200, baggageRecordView(item));
  }
  if (part === 'expenses' && req.method === 'POST') {
    if(user.role==='sales_manager')return fail(res,403,'Salgschefen kan ikke registrere turudgifter');
    const data = await body(req); const amount = Number(data.amount); const currency = ['DKK','EUR'].includes(data.currency) ? data.currency : null; const category = String(data.category || '').trim();
    if (!(amount > 0) || !currency || !category) return fail(res, 400, 'Angiv kategori, beløb og valuta');
    const receiptType = String(data.receiptType || ''); const receiptName = path.basename(String(data.receiptName || 'kvittering'));
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(receiptType)) return fail(res, 400, 'Kvitteringen skal være PDF, JPG, PNG eller WebP');
    const encoded = String(data.receiptData || '').replace(/^data:[^;]+;base64,/,''); const fileData = Buffer.from(encoded,'base64');
    if (!fileData.length || fileData.length > 5 * 1024 * 1024) return fail(res, 400, 'Kvitteringen skal være mellem 1 byte og 5 MB');
    const extensions = { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf' }; const receiptFile = `${crypto.randomBytes(18).toString('hex')}${extensions[receiptType]}`;
    const uploadDir = path.join(__dirname,'data','uploads'); fs.mkdirSync(uploadDir,{recursive:true}); fs.writeFileSync(path.join(uploadDir,receiptFile),fileData);
    const expense = { id:id(),tripId:trip.id,expenseDate:trip.departureAt,category,description:String(data.description||'').trim(),amount,currency,receiptName,receiptType,receiptFile,createdAt:new Date().toISOString(),createdBy:user.id,status:'pending',reviewedAt:null,reviewedBy:null,reviewNote:'' };
    db.expenses.push(expense); saveDb(); return json(res,201,{...expense,createdByName:user.name});
  }
  if (part === 'settlements' && req.method === 'POST') {
    const data = await body(req); const driverId = ['driver','sales_manager'].includes(user.role) ? user.id : Number(data.driverId);
    const cashHolderIds=[...new Set([...db.passengers,...db.baggage].filter(record=>record.tripId===trip.id&&record.cashHolderUserId).map(record=>record.cashHolderUserId))];
    if (user.role!=='sales_manager'&&![trip.primaryDriverId,trip.secondaryDriverId,trip.salesManagerId,...cashHolderIds].includes(driverId)) return fail(res,400,'Vælg en medarbejder med ansvar på turen');
    if (db.cashSettlements.some(s=>s.tripId===trip.id&&s.driverId===driverId&&s.status==='pending')) return fail(res,409,'Medarbejderen har allerede en afstemning, der afventer godkendelse');
    const items = unsettledCashRecords(trip.id,driverId); if (!items.length) return fail(res,400,'Der er ingen uafstemte kontanter hos medarbejderen');
    const expected = cashAmounts(items); const delivered = { DKK:Number(data.deliveredDKK||0),EUR:Number(data.deliveredEUR||0) };
    if (delivered.DKK < 0 || delivered.EUR < 0) return fail(res,400,'Det afleverede beløb kan ikke være negativt');
    const settlement = { id:id(),tripId:trip.id,driverId,expected,delivered,difference:{DKK:delivered.DKK-expected.DKK,EUR:delivered.EUR-expected.EUR},note:String(data.note||'').trim(),paymentRefs:items.map(item=>`${item.kind}:${item.record.id}`),status:'pending',submittedAt:new Date().toISOString(),submittedBy:user.id,reviewedAt:null,reviewedBy:null,reviewNote:'' };
    db.cashSettlements.push(settlement); saveDb(); return json(res,201,{...settlement,driverName:db.users.find(u=>u.id===driverId)?.name||'Ukendt',submittedByName:user.name});
  }
  if (part === 'settlements' && req.method === 'PATCH') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan godkende kontantafstemninger');
    const data = await body(req); const settlement = db.cashSettlements.find(s=>s.id===Number(data.id)&&s.tripId===trip.id); if (!settlement) return fail(res,404,'Afstemningen findes ikke');
    if (settlement.status !== 'pending') return fail(res,409,'Afstemningen er allerede behandlet');
    if (!['approved','rejected'].includes(data.status)) return fail(res,400,'Vælg godkendt eller afvist');
    settlement.status=data.status;settlement.reviewedAt=new Date().toISOString();settlement.reviewedBy=user.id;settlement.reviewNote=String(data.reviewNote||'').trim();
    if (data.status === 'approved') for (const ref of settlement.paymentRefs) { const [kind,recordId]=ref.split(':'); const collection=kind==='passenger'?db.passengers:db.baggage; const record=collection.find(item=>item.id===Number(recordId)); if(record&&!record.cashHandedOverAt){record.cashHandedOverAt=settlement.reviewedAt;record.cashSettlementId=settlement.id;} }
    saveDb(); return json(res,200,{...settlement,driverName:db.users.find(u=>u.id===settlement.driverId)?.name||'Ukendt',submittedByName:db.users.find(u=>u.id===settlement.submittedBy)?.name||'Ukendt',reviewedByName:user.name});
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
