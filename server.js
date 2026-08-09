const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(path.dirname(DB_FILE), 'uploads');
const PUBLIC = path.join(__dirname, 'public');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';
const SESSION_TTL_MS = Math.max(15 * 60 * 1000, Number(process.env.SESSION_TTL_HOURS || 8) * 60 * 60 * 1000);
const REMEMBERED_SESSION_TTL_MS = Math.max(24 * 60 * 60 * 1000, Number(process.env.REMEMBERED_SESSION_DAYS || 30) * 24 * 60 * 60 * 1000);
// Baggage photos are transported as base64 inside JSON. Keep a generous
// request-level safety ceiling without imposing a baggage-photo size limit.
const MAX_JSON_BODY_BYTES = 128 * 1024 * 1024;
const loginAttempts = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, user) {
  const candidate = crypto.scryptSync(password, user.salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(user.passwordHash, 'hex'));
}
function seed() {
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || (IS_PRODUCTION ? '' : 'admin123');
  if (!adminPassword || adminPassword.length < 12) {
    if (IS_PRODUCTION) throw new Error('INITIAL_ADMIN_PASSWORD skal være mindst 12 tegn i produktion');
  }
  const admin = hashPassword(adminPassword || 'admin123');
  const driver1 = hashPassword('chauffor123');
  const driver2 = hashPassword('chauffor123');
  const users = [
    { id: 1, name: process.env.INITIAL_ADMIN_NAME || 'Administrator', email: String(process.env.INITIAL_ADMIN_EMAIL || 'admin@albaturist.dk').toLowerCase(), role: 'admin', salt: admin.salt, passwordHash: admin.hash }
  ];
  if (!IS_PRODUCTION) users.push(
    { id: 2, name: 'Mads Chauffør', email: 'mads@albaturist.dk', role: 'driver', salt: driver1.salt, passwordHash: driver1.hash },
    { id: 3, name: 'Sara Chauffør', email: 'sara@albaturist.dk', role: 'driver', salt: driver2.salt, passwordHash: driver2.hash }
  );
  return {
    meta: { version: 14, nextId: 20 },
    settings: { logoFile: null, logoType: null, logoName: null },
    users,
    stops: [], buses: [],
    trips: [],
    passengers: [], baggage: [], expenses: [], cashSettlements: [], cashTransfers: [], sessions: []
  };
}
function writeLocalDb(value) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, DB_FILE);
}
function loadLocalDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (_) { const value = seed(); writeLocalDb(value); return value; }
}
let db = null;
let pool = null;
let storageWriteQueue = Promise.resolve();
async function saveDb(value = db) {
  const snapshot = JSON.stringify(value);
  if (!pool) { writeLocalDb(value); return; }
  storageWriteQueue = storageWriteQueue.catch(() => {}).then(() => pool.query(
    `INSERT INTO busops_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [snapshot]
  ));
  await storageWriteQueue;
}
function migrateDb(value) {
  let migrated = false;
  value.meta = value.meta || { version: 1, nextId: 20 };
  if (!value.settings || typeof value.settings !== 'object') { value.settings = { logoFile:null,logoType:null,logoName:null }; migrated = true; }
  for (const name of ['users','stops','buses','trips','passengers','baggage','expenses','cashSettlements','cashTransfers']) if (!Array.isArray(value[name])) { value[name] = []; migrated = true; }
  if ((value.meta.version || 1) < 3) {
    value.stops = []; value.trips = []; value.passengers = []; value.baggage = [];
    value.meta.version = 3; migrated = true;
  }
  if ((value.meta.version || 1) < 4) { value.buses = value.buses || []; value.meta.version = 4; migrated = true; }
  if ((value.meta.version || 1) < 5) { value.expenses = value.expenses || []; value.meta.version = 5; migrated = true; }
  if ((value.meta.version || 1) < 6) { value.cashSettlements = value.cashSettlements || []; value.meta.version = 6; migrated = true; }
  if ((value.meta.version || 1) < 7) {
    for (const bus of value.buses) if (bus.type === 'double') { bus.seatCount = 84; bus.lowerDeckSeats = 22; value.trips.filter(t => t.busId === bus.id).forEach(t => t.seatCount = 84); }
    value.meta.version = 7; migrated = true;
  }
  if ((value.meta.version || 1) < 8) { for (const expense of value.expenses) if (!expense.status) expense.status = 'pending'; value.meta.version = 8; migrated = true; }
  if ((value.meta.version || 1) < 9) { for (const item of value.baggage) { item.photoName = item.photoName || null; item.photoType = item.photoType || null; item.photoFile = item.photoFile || null; } value.meta.version = 9; migrated = true; }
  if ((value.meta.version || 1) < 10 || !Array.isArray(value.sessions)) { value.sessions = []; value.meta.version = 10; migrated = true; }
  if ((value.meta.version || 1) < 11 || !Array.isArray(value.cashTransfers)) { value.cashTransfers = value.cashTransfers || []; value.meta.version = 11; migrated = true; }
  if ((value.meta.version || 1) < 12) { for (const item of value.baggage) if (item.recipientName === undefined) item.recipientName = ''; value.meta.version = 12; migrated = true; }
  if ((value.meta.version || 1) < 13) {
    for (const trip of value.trips) {
      if (Array.isArray(trip.timetable)) continue;
      const departureAt = new Date(trip.departureAt);
      const arrivalAt = new Date(departureAt.getTime() + (Number(trip.durationMinutes) || 480) * 60000);
      trip.timetable = [{ stopId: trip.originId, arrivalAt: departureAt.toISOString(), departureAt: departureAt.toISOString() }];
      if (trip.destinationId !== trip.originId) trip.timetable.push({ stopId: trip.destinationId, arrivalAt: arrivalAt.toISOString(), departureAt: arrivalAt.toISOString() });
    }
    value.meta.version = 13; migrated = true;
  }
  if ((value.meta.version || 1) < 14) { for (const passenger of value.passengers) if (passenger.ticketNumber === undefined) passenger.ticketNumber = ''; value.meta.version = 14; migrated = true; }
  for(const user of value.users){if(!['da','sq','de','en'].includes(user.language)){user.language='da';migrated=true}}
  for (const trip of value.trips) {
    if (!trip.seatCount) { trip.seatCount = 54; migrated = true; }
    if (!trip.durationMinutes) { trip.durationMinutes = 480; migrated = true; }
  }
  return migrated;
}
async function initializeStorage() {
  let created = false;
  if (DATABASE_URL) {
    const { Pool } = require('pg');
    const config = { connectionString: DATABASE_URL, max: Math.max(1, Number(process.env.DATABASE_POOL_SIZE || 5)) };
    if (process.env.DATABASE_SSL === 'no-verify') config.ssl = { rejectUnauthorized: false };
    else if (process.env.DATABASE_SSL === 'require') config.ssl = true;
    pool = new Pool(config);
    pool.on('error', error => console.error('PostgreSQL-forbindelse fejlede', error));
    await pool.query('CREATE TABLE IF NOT EXISTS busops_state (id SMALLINT PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const result = await pool.query('SELECT data FROM busops_state WHERE id = 1');
    db = result.rows[0]?.data || seed();
    created = !result.rows[0];
  } else db = loadLocalDb();
  const migrated = migrateDb(db);
  if (created || migrated) await saveDb();
}
const storageReady = initializeStorage();
storageReady.catch(error => console.error('BusOps kunne ikke klargøre datalageret', error.message));
function id() { db.meta.nextId += 1; return db.meta.nextId; }
function cleanUser(user) { const { salt, passwordHash, portraitFile, ...safe } = user; return { ...safe, hasPortrait:Boolean(portraitFile) }; }
function storeImage(data,{prefix,maxBytes=10*1024*1024}={}) {
  const type=String(data.type||''),name=path.basename(String(data.name||`${prefix}-billede`));
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw Object.assign(new Error('Billedet skal være JPG, PNG eller WebP'),{statusCode:400});
  const encoded=String(data.data||'').replace(/^data:[^;]+;base64,/,'');const bytes=Buffer.from(encoded,'base64');
  if(!bytes.length||bytes.length>maxBytes)throw Object.assign(new Error('Billedet skal være mellem 1 byte og 10 MB'),{statusCode:400});
  const extension={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[type],file=`${prefix}-${crypto.randomBytes(18).toString('hex')}${extension}`;
  fs.mkdirSync(UPLOAD_DIR,{recursive:true});fs.writeFileSync(path.join(UPLOAD_DIR,file),bytes);return{file,type,name};
}
function removeStoredFile(file){if(!file)return;const target=path.join(UPLOAD_DIR,path.basename(file));if(fs.existsSync(target))fs.unlinkSync(target)}
function storedImage(res,file,type){const target=path.join(UPLOAD_DIR,path.basename(file||''));if(!file||!fs.existsSync(target))return fail(res,404,'Billedet findes ikke');res.writeHead(200,{'Content-Type':type||'application/octet-stream','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});fs.createReadStream(target).pipe(res)}
function userName(userId) { return userId ? db.users.find(user => user.id === userId)?.name || 'Ukendt medarbejder' : null; }
function isFixedStartPoint(stop) { return ['københavn', 'tetovo'].includes(String(stop?.name || '').trim().toLocaleLowerCase('da-DK')); }
function editHistoryView(history) { return (history || []).map(event => ({ ...event, editedByName:userName(event.editedBy) })); }
function passengerRecordView(passenger) { return { ...passenger, checkedInByName:userName(passenger.checkedInBy), paymentRecordedByName:userName(passenger.paymentRecordedBy), cashHolderUserName:userName(passenger.cashHolderUserId), attendanceHistory:(passenger.attendanceHistory||[]).map(event=>({...event,userName:userName(event.userId),receivedByName:userName(event.receivedBy)})), editHistory:editHistoryView(passenger.editHistory) }; }
function baggageRecordView(item) { return { ...item, createdByName:userName(item.createdBy), paymentRecordedByName:userName(item.paymentRecordedBy), cashHolderUserName:userName(item.cashHolderUserId), statusUpdatedByName:userName(item.statusUpdatedBy), baggageHistory:(item.baggageHistory||[]).map(event=>({...event,userName:userName(event.userId)})), editHistory:editHistoryView(item.editHistory) }; }
function expenseRecordView(expense) { return { ...expense, createdByName:userName(expense.createdBy), paidByName:userName(expense.paidByUserId||expense.createdBy), reviewedByName:userName(expense.reviewedBy), reimbursedByName:userName(expense.reimbursedBy), editHistory:editHistoryView(expense.editHistory) }; }
function cashTransferView(transfer) { return { ...transfer, fromDriverName:userName(transfer.fromDriverId), toDriverName:userName(transfer.toDriverId), initiatedByName:userName(transfer.initiatedBy), respondedByName:userName(transfer.respondedBy) }; }
function isPendingPayment(record) { return ['unpaid','pay_dk','pay_mk'].includes(record?.paymentStatus); }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=').map(decodeURIComponent)));
}
function auth(req) {
  const sid = cookies(req).sid;
  const session = sid && db.sessions.find(candidate => candidate.id === sid && candidate.expiresAt > Date.now());
  return session && db.users.find(u => u.id === session.userId);
}
function sessionCookie(sid, maxAgeSeconds) {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  const maxAge = Number.isFinite(maxAgeSeconds) ? `; Max-Age=${Math.max(0,Math.floor(maxAgeSeconds))}` : '';
  return `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/${maxAge}${secure}`;
}
function requestIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'ukendt';
}
function loginAllowed(req) {
  const key = requestIp(req), now = Date.now(), windowMs = 15 * 60 * 1000;
  const attempts = (loginAttempts.get(key) || []).filter(time => now - time < windowMs);
  loginAttempts.set(key, attempts);
  return attempts.length < 10;
}
function recordFailedLogin(req) {
  const key = requestIp(req), attempts = loginAttempts.get(key) || [];
  attempts.push(Date.now()); loginAttempts.set(key, attempts);
}
function expectedOrigin(req) {
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host}`;
}
function validRequestOrigin(req) {
  if (!IS_PRODUCTION || ['GET','HEAD','OPTIONS'].includes(req.method)) return true;
  const origin = String(req.headers.origin || '');
  const extras = String(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return Boolean(origin) && [expectedOrigin(req), ...extras].includes(origin);
}
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (IS_PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function allowedTrip(user, trip) { return user.role === 'admin' || user.role === 'sales_manager' || trip.primaryDriverId === user.id || trip.secondaryDriverId === user.id; }
function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
function fail(res, status, message) { json(res, status, { error: message }); }
async function body(req) {
  let raw = '', receivedBytes = 0;
  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_JSON_BODY_BYTES) throw new Error('For meget data');
    raw += chunk;
  }
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error('Ugyldig JSON'); }
}
function tripView(t) {
  const passengers = db.passengers.filter(p => p.tripId === t.id);
  const baggage = db.baggage.filter(b => b.tripId === t.id);
  const expenses = db.expenses.filter(expense=>expense.tripId===t.id);
  const unsettledCash = [...passengers,...baggage].filter(record=>record.paymentStatus==='cash'&&['bus','departure'].includes(record.paymentLocation)&&record.cashHolderUserId&&!record.cashHandedOverAt);
  return { ...t,
    origin: db.stops.find(s => s.id === t.originId), destination: db.stops.find(s => s.id === t.destinationId),
    bus: db.buses.find(b => b.id === t.busId) || null,
    primaryDriver: db.users.find(u => u.id === t.primaryDriverId)?.name || null,
    secondaryDriver: db.users.find(u => u.id === t.secondaryDriverId)?.name || null,
    salesManager: db.users.find(u => u.id === t.salesManagerId)?.name || null,
    cancelledByName: userName(t.cancelledBy),
    counts: { passengers: passengers.length, checkedIn: passengers.filter(p => p.checkedIn).length, baggage: baggage.length, onboard: baggage.filter(b => b.status === 'onboard').length, unpaid: [...passengers,...baggage].filter(isPendingPayment).length, pendingExpenses:expenses.filter(expense=>(expense.status||'pending')==='pending').length, missingReceipts:expenses.filter(expense=>!expense.receiptFile).length, unsettledCash:unsettledCash.length }
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
    const isTable = isDouble ? number >= 5 && number <= 12 : [13,14,17,18,21,22,25,26].includes(number);
    const lowerDeckSeats = isDouble ? 22 : trip?.seatCount;
    return { number, deck: number <= lowerDeckSeats ? 'lower' : 'upper', type: isFront ? 'front' : isTable ? 'table' : 'standard', surcharge: isFront ? 100 : isTable ? 75 : 0, passengerId: taken.get(number) || null };
  });
}
function unsettledCashRecords(tripId,driverId) {
  return [...db.passengers.map(record=>({record,kind:'passenger'})),...db.baggage.map(record=>({record,kind:'baggage'}))].filter(item=>item.record.tripId===tripId&&item.record.paymentStatus==='cash'&&['bus','departure'].includes(item.record.paymentLocation)&&item.record.cashHolderUserId===driverId&&!item.record.cashHandedOverAt);
}
function cashAmounts(items) { return ['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=items.filter(item=>(item.record?.paymentCurrency||item.paymentCurrency||'DKK')===currency).reduce((sum,item)=>sum+Number(item.record?.cashAmount||item.cashAmount||0),0);return totals;},{}); }
function correctionReason(data) {
  const reason = String(data.correctionReason || '').trim();
  return reason.length >= 3 ? reason : null;
}
function changedFields(record, updates) {
  return Object.fromEntries(Object.entries(updates).filter(([key,value]) => String(record[key] ?? '') !== String(value ?? '')).map(([key,value]) => [key,{ from:record[key] ?? null,to:value ?? null }]));
}
function hasPendingSettlementReference(reference) {
  return db.cashSettlements.some(settlement => settlement.status === 'pending' && settlement.paymentRefs.includes(reference));
}
function hasPendingTransferReference(reference) {
  return db.cashTransfers.some(transfer => transfer.status === 'pending' && transfer.paymentRefs.includes(reference));
}
function hasCashAuditReference(reference) {
  return db.cashSettlements.some(settlement => (settlement.paymentRefs || []).includes(reference)) || db.cashTransfers.some(transfer => (transfer.paymentRefs || []).includes(reference));
}
function recordDeletion(trip, kind, record, user, reason) {
  trip.deletionHistory = trip.deletionHistory || [];
  trip.deletionHistory.push({ kind, record: { ...record }, deletedAt: new Date().toISOString(), deletedBy: user.id, deletedByName: user.name, reason });
}
function cashRecordByReference(reference, tripId) {
  const [kind,rawId] = String(reference).split(':');
  const collection = kind === 'passenger' ? db.passengers : kind === 'baggage' ? db.baggage : null;
  const record = collection?.find(item => item.id === Number(rawId) && item.tripId === tripId);
  return record ? { kind,record,reference:`${kind}:${record.id}` } : null;
}
async function api(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, storage: DATABASE_URL ? 'postgresql' : 'json', time: new Date().toISOString() });
  if(pathname==='/api/branding/logo'&&req.method==='GET')return storedImage(res,db.settings?.logoFile,db.settings?.logoType);
  if (pathname === '/api/login' && req.method === 'POST') {
    if (!loginAllowed(req)) return fail(res, 429, 'For mange loginforsøg. Vent 15 minutter og prøv igen');
    const data = await body(req); const user = db.users.find(u => u.email.toLowerCase() === String(data.email || '').toLowerCase());
    if (!user || !verifyPassword(String(data.password || ''), user)) { recordFailedLogin(req); return fail(res, 401, 'Forkert e-mail eller adgangskode'); }
    loginAttempts.delete(requestIp(req));
    const now = Date.now(), sid = crypto.randomBytes(32).toString('hex'),rememberMe=data.rememberMe===true||data.rememberMe==='true',ttl=rememberMe?REMEMBERED_SESSION_TTL_MS:SESSION_TTL_MS;
    db.sessions = db.sessions.filter(session => session.expiresAt > now);
    const previousSessions=db.sessions.filter(session=>session.userId===user.id).sort((left,right)=>right.createdAt-left.createdAt).slice(4);if(previousSessions.length){const removeIds=new Set(previousSessions.map(session=>session.id));db.sessions=db.sessions.filter(session=>!removeIds.has(session.id))}
    db.sessions.push({ id: sid, userId: user.id, createdAt: now, expiresAt: now + ttl, remembered:rememberMe });
    await saveDb();
    return json(res, 200, { user: cleanUser(user) }, { 'Set-Cookie': sessionCookie(sid, rememberMe?ttl/1000:undefined) });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    const sid = cookies(req).sid; db.sessions = db.sessions.filter(session => session.id !== sid); await saveDb();
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  const user = auth(req); if (!user) return fail(res, 401, 'Log ind for at fortsætte');
  if(pathname==='/api/profile/language'&&req.method==='PATCH'){
    const data=await body(req),language=String(data.language||'');if(!['da','sq','de','en'].includes(language))return fail(res,400,'Vælg et gyldigt sprog');user.language=language;await saveDb();return json(res,200,{language});
  }
  if(pathname==='/api/profile'&&req.method==='PATCH'){
    const data=await body(req),currentPassword=String(data.currentPassword||''),email=String(data.email||'').trim().toLowerCase(),newPassword=String(data.newPassword||'');
    if(!verifyPassword(currentPassword,user))return fail(res,401,'Den nuværende adgangskode er forkert');
    if(!email||!email.includes('@'))return fail(res,400,'Indtast en gyldig e-mailadresse');
    if(db.users.some(candidate=>candidate.id!==user.id&&candidate.email.toLowerCase()===email))return fail(res,409,'E-mailadressen bruges allerede');
    if(newPassword&&newPassword.length<12)return fail(res,400,'Den nye adgangskode skal være på mindst 12 tegn');
    if(email===user.email&& !newPassword)return fail(res,400,'Der er ingen ændringer at gemme');
    user.email=email;
    if(newPassword){const credentials=hashPassword(newPassword);user.salt=credentials.salt;user.passwordHash=credentials.hash;const currentSid=cookies(req).sid;db.sessions=db.sessions.filter(session=>session.userId!==user.id||session.id===currentSid)}
    await saveDb();return json(res,200,{user:cleanUser(user)});
  }
  if(pathname==='/api/branding'&&req.method==='PATCH'){
    if(user.role!=='admin')return fail(res,403,'Kun administratoren kan ændre appens logo');
    const data=await body(req),image=storeImage({data:data.logoData,type:data.logoType,name:data.logoName},{prefix:'app-logo'}),oldFile=db.settings?.logoFile;
    db.settings={...db.settings,logoFile:image.file,logoType:image.type,logoName:image.name};await saveDb();if(oldFile!==image.file)removeStoredFile(oldFile);return json(res,200,{hasLogo:true,logoName:image.name});
  }
  if (pathname === '/api/me') return json(res, 200, { user: cleanUser(user) });
  if (pathname === '/api/bootstrap') {
    const trips = db.trips.filter(t => allowedTrip(user, t)).map(tripView);
    return json(res, 200, { user: cleanUser(user), branding:{hasLogo:Boolean(db.settings?.logoFile),logoName:db.settings?.logoName||null}, trips, stops: db.stops, drivers: user.role === 'admin' ? db.users.filter(u => u.role === 'driver').map(cleanUser) : [], salesManagers: user.role === 'admin' ? db.users.filter(u => u.role === 'sales_manager').map(cleanUser) : [], buses: user.role === 'admin' ? db.buses : [] });
  }
  if(pathname==='/api/dashboard'&&req.method==='GET'){
    const visibleTrips=db.trips.filter(trip=>allowedTrip(user,trip)),tripIds=new Set(visibleTrips.map(trip=>trip.id)),passengers=db.passengers.filter(record=>tripIds.has(record.tripId)),baggage=db.baggage.filter(record=>tripIds.has(record.tripId)),expenses=db.expenses.filter(record=>tripIds.has(record.tripId));
    const heldAll=[...passengers,...baggage].filter(record=>record.paymentStatus==='cash'&&['bus','departure'].includes(record.paymentLocation)&&record.cashHolderUserId&&!record.cashHandedOverAt),held=user.role==='admin'?heldAll:heldAll.filter(record=>record.cashHolderUserId===user.id),holderIds=[...new Set(heldAll.map(record=>record.cashHolderUserId))];
    const isToday=value=>value&&new Date(value).toDateString()===new Date().toDateString(),receivedFilter=record=>record.paymentStatus==='cash'&&isToday(record.paymentRecordedAt)&&(user.role==='admin'||record.cashHolderUserId===user.id||record.paymentRecordedBy===user.id),todayTickets=passengers.filter(receivedFilter),todayBaggage=baggage.filter(receivedFilter);
    return json(res,200,{cashHeld:{...cashAmounts(held),payments:held.length,byPerson:user.role==='admin'?holderIds.map(userId=>{const records=heldAll.filter(record=>record.cashHolderUserId===userId);return{userId,userName:userName(userId),...cashAmounts(records),payments:records.length}}):[]},todayTicketRevenue:cashAmounts(todayTickets),todayBaggageRevenue:cashAmounts(todayBaggage),todayTicketSales:todayTickets.length,todayBaggageSales:todayBaggage.length,pendingExpenses:expenses.filter(expense=>(expense.status||'pending')==='pending'&&(user.role==='admin'||expense.createdBy===user.id)).length,missingReceipts:expenses.filter(expense=>!expense.receiptFile&&(user.role==='admin'||expense.createdBy===user.id)).length,openBaggage:baggage.filter(item=>!['delivered'].includes(item.status)).length,unpaid:[...passengers,...baggage].filter(isPendingPayment).length});
  }
  if (pathname === '/api/buses' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette busser');
    const data = await body(req); const name = String(data.name || '').trim(); const registration = String(data.registration || '').trim().toUpperCase(); const type = data.type === 'double' ? 'double' : 'standard'; const seatCount = type === 'double' ? 84 : Number(data.seatCount);
    if (!name || !registration) return fail(res, 400, 'Udfyld bussens navn og registreringsnummer');
    if (type === 'standard' && (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 54)) return fail(res, 400, 'En almindelig bus kan have op til 54 sæder');
    if (db.buses.some(b => b.registration === registration)) return fail(res, 409, 'Registreringsnummeret findes allerede');
    const lowerDeckSeats = type === 'double' ? 22 : seatCount;
    const bus = { id: id(), name, registration, type, seatCount, lowerDeckSeats }; db.buses.push(bus); await saveDb(); return json(res, 201, bus);
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
      Object.assign(bus,{ name,registration,type,seatCount,lowerDeckSeats }); db.trips.filter(t => t.busId === bus.id).forEach(t => t.seatCount = seatCount); await saveDb(); return json(res, 200, bus);
    }
    if (req.method === 'DELETE') {
      if (db.trips.some(t => t.busId === bus.id)) return fail(res, 409, 'Bussen er tildelt en tur og kan derfor ikke slettes');
      db.buses = db.buses.filter(b => b.id !== bus.id); await saveDb(); return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'Handlingen er ikke tilladt');
  }
  if (pathname === '/api/reports' && req.method === 'GET') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan se salg og økonomi');
    const sumByCurrency = records => ['DKK','EUR'].reduce((result,currency) => {
      result[currency] = records.filter(record => record.paymentStatus === 'cash' && (record.paymentCurrency || 'DKK') === currency).reduce((sum,record) => sum + Number(record.cashAmount || 0),0); return result;
    },{});
    const sumExpensesByCurrency = records => ['DKK','EUR'].reduce((result,currency) => { result[currency]=records.filter(record=>record.currency===currency).reduce((sum,record)=>sum+Number(record.amount||0),0); return result; },{});
    const addTrip = record => { const trip = db.trips.find(t => t.id === record.tripId); return { ...record, tripTitle: trip?.title || 'Ukendt tur', departureAt: trip?.departureAt || null, createdByName: userName(record.createdBy), paidByName:userName(record.paidByUserId||record.createdBy), checkedInByName:userName(record.checkedInBy), paymentRecordedByName:userName(record.paymentRecordedBy), cashHolderUserName:userName(record.cashHolderUserId), statusUpdatedByName:userName(record.statusUpdatedBy), reviewedByName:userName(record.reviewedBy), reimbursedByName:userName(record.reimbursedBy) }; };
    const cashByDriver = db.users.filter(u => ['driver','sales_manager'].includes(u.role)).map(driver => {
      const held = [...db.passengers,...db.baggage].filter(record => record.paymentStatus === 'cash' && ['bus','departure'].includes(record.paymentLocation) && record.cashHolderUserId === driver.id && !record.cashHandedOverAt);
      return { driverId: driver.id, driverName: driver.name, amounts: sumByCurrency(held), payments: held.length };
    }).filter(row => row.payments > 0);
    const approvedSettlements = db.cashSettlements.filter(settlement=>settlement.status==='approved');
    const cashAtOffice = ['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=approvedSettlements.reduce((sum,settlement)=>sum+Number(settlement.delivered?.[currency]||0),0);return totals;},{});
    const tripResults = db.trips.map(trip => {
      const passengers=db.passengers.filter(p=>p.tripId===trip.id),baggage=db.baggage.filter(b=>b.tripId===trip.id),tripExpenses=db.expenses.filter(e=>e.tripId===trip.id);
      const revenueRecords=[...passengers,...baggage].filter(record=>record.paymentStatus==='cash');
      const ticketRevenue=sumByCurrency(passengers),baggageRevenue=sumByCurrency(baggage),revenue=sumByCurrency(revenueRecords),approvedExpenses=['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=tripExpenses.filter(e=>e.status==='approved'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0);return totals;},{}),pendingExpenses=['DKK','EUR'].reduce((totals,currency)=>{totals[currency]=tripExpenses.filter(e=>e.status==='pending'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0);return totals;},{});
      const shopCash=sumByCurrency(revenueRecords.filter(record=>record.paymentLocation==='shop'));
      const handedOverCash=sumByCurrency(revenueRecords.filter(record=>['bus','departure'].includes(record.paymentLocation)&&record.cashHandedOverAt));
      const heldRecords=revenueRecords.filter(record=>['bus','departure'].includes(record.paymentLocation)&&record.cashHolderUserId&&!record.cashHandedOverAt),heldCash=sumByCurrency(heldRecords);
      const holderIds=[...new Set(heldRecords.map(record=>record.cashHolderUserId))],cashByHolder=holderIds.map(holderId=>{const records=heldRecords.filter(record=>record.cashHolderUserId===holderId);return{userId:holderId,userName:userName(holderId),amounts:sumByCurrency(records),payments:records.length};});
      const categories=[...new Set(tripExpenses.map(expense=>expense.category))].map(category=>({category,approved:sumExpensesByCurrency(tripExpenses.filter(expense=>expense.category===category&&expense.status==='approved')),pending:sumExpensesByCurrency(tripExpenses.filter(expense=>expense.category===category&&expense.status==='pending'))}));
      const settlements=db.cashSettlements.filter(settlement=>settlement.tripId===trip.id);
      return { tripId:trip.id,title:trip.title,departureAt:trip.departureAt,busName:db.buses.find(b=>b.id===trip.busId)?.name||'Ingen bus',passengers:passengers.length,seatCount:trip.seatCount,occupancy:trip.seatCount?Math.round(passengers.length/trip.seatCount*100):0,unpaid:passengers.filter(isPendingPayment).length,paidTickets:passengers.filter(p=>p.paymentStatus==='cash').length,freeTickets:passengers.filter(p=>p.paymentStatus==='free').length,baggage:baggage.length,paidBaggage:baggage.filter(item=>item.paymentStatus==='cash').length,unpaidBaggage:baggage.filter(isPendingPayment).length,ticketRevenue,baggageRevenue,revenue,approvedExpenses,pendingExpenses,expenseCategories:categories,cashFlow:{shop:shopCash,handedOver:handedOverCash,held:heldCash,byHolder:cashByHolder},settlements:{pending:settlements.filter(item=>item.status==='pending').length,approved:settlements.filter(item=>item.status==='approved').length,rejected:settlements.filter(item=>item.status==='rejected').length},net:{DKK:revenue.DKK-approvedExpenses.DKK,EUR:revenue.EUR-approvedExpenses.EUR} };
    });
    return json(res, 200, {
      summary: {
        tickets: db.passengers.length, paidTickets: db.passengers.filter(p => p.paymentStatus === 'cash').length, freeTickets: db.passengers.filter(p => p.paymentStatus === 'free').length, unpaidTickets: db.passengers.filter(isPendingPayment).length,
        ticketRevenue: sumByCurrency(db.passengers), baggage: db.baggage.length, paidBaggage: db.baggage.filter(b => b.paymentStatus === 'cash').length, unpaidBaggage: db.baggage.filter(isPendingPayment).length, baggageRevenue: sumByCurrency(db.baggage), cashByDriver, cashAtOffice, expenseTotals: ['DKK','EUR'].reduce((totals,currency)=>{ totals[currency]=db.expenses.filter(e=>e.status==='approved'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0); return totals; },{}), pendingExpenseTotals: ['DKK','EUR'].reduce((totals,currency)=>{ totals[currency]=db.expenses.filter(e=>e.status==='pending'&&e.currency===currency).reduce((sum,e)=>sum+Number(e.amount||0),0); return totals; },{})
      },
      tickets: db.passengers.map(addTrip), baggage: db.baggage.map(addTrip), expenses: db.expenses.map(addTrip), tripResults
    });
  }
  if (pathname === '/api/stops' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette opsamlingssteder');
    const data = await body(req); if (!data.name?.trim()) return fail(res, 400, 'Navn mangler');
    const stop = { id: id(), name: data.name.trim(), address: String(data.address || '').trim() }; db.stops.push(stop); await saveDb(); return json(res, 201, stop);
  }
  if (pathname === '/api/drivers' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette chauffører');
    const data = await body(req);
    const name = String(data.name || '').trim(); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || '');
    if (!name || !email || !email.includes('@')) return fail(res, 400, 'Udfyld chaufførens navn og en gyldig e-mail');
    if (password.length < 12) return fail(res, 400, 'Adgangskoden skal være på mindst 12 tegn');
    if (db.users.some(u => u.email.toLowerCase() === email)) return fail(res, 409, 'E-mailadressen bruges allerede');
    const credentials = hashPassword(password);let portrait={file:null,type:null,name:null};
    if(data.portraitData)portrait=storeImage({data:data.portraitData,type:data.portraitType,name:data.portraitName},{prefix:'driver'});
    const driver = { id: id(), name, email, role: 'driver', salt: credentials.salt, passwordHash: credentials.hash, portraitFile:portrait.file,portraitType:portrait.type,portraitName:portrait.name };
    db.users.push(driver); await saveDb(); return json(res, 201, cleanUser(driver));
  }
  if (pathname === '/api/sales-managers' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan oprette salgschefer');
    const data=await body(req);const name=String(data.name||'').trim(),email=String(data.email||'').trim().toLowerCase(),password=String(data.password||'');
    if(!name||!email.includes('@'))return fail(res,400,'Udfyld salgschefens navn og en gyldig e-mail');
    if(password.length<12)return fail(res,400,'Adgangskoden skal være på mindst 12 tegn');
    if(db.users.some(candidate=>candidate.email.toLowerCase()===email))return fail(res,409,'E-mailadressen bruges allerede');
    const credentials=hashPassword(password),salesManager={id:id(),name,email,role:'sales_manager',salt:credentials.salt,passwordHash:credentials.hash};db.users.push(salesManager);await saveDb();return json(res,201,cleanUser(salesManager));
  }
  const salesManagerMatch=pathname.match(/^\/api\/sales-managers\/(\d+)$/);
  if(salesManagerMatch){
    if(user.role!=='admin')return fail(res,403,'Kun administratoren kan ændre salgschefer');
    const salesManager=db.users.find(candidate=>candidate.id===Number(salesManagerMatch[1])&&candidate.role==='sales_manager');if(!salesManager)return fail(res,404,'Salgschefen findes ikke');
    if(req.method==='PATCH'){
      const data=await body(req),name=String(data.name||'').trim();if(!name)return fail(res,400,'Udfyld salgschefens navn');
      if((data.email&&String(data.email).trim().toLowerCase()!==salesManager.email)||data.password)return fail(res,403,'Salgschefen skal selv ændre e-mail og adgangskode under Min konto');
      salesManager.name=name;await saveDb();return json(res,200,cleanUser(salesManager));
    }
    if(req.method==='DELETE'){
      const hasAuditHistory=db.passengers.some(passenger=>passenger.checkedInBy===salesManager.id||passenger.paymentRecordedBy===salesManager.id||passenger.cashHolderUserId===salesManager.id||(passenger.attendanceHistory||[]).some(event=>event.userId===salesManager.id||event.receivedBy===salesManager.id))||db.baggage.some(item=>item.createdBy===salesManager.id||item.paymentRecordedBy===salesManager.id||item.cashHolderUserId===salesManager.id||item.statusUpdatedBy===salesManager.id||(item.baggageHistory||[]).some(event=>event.userId===salesManager.id))||db.cashSettlements.some(settlement=>settlement.driverId===salesManager.id||settlement.submittedBy===salesManager.id);
      if(db.trips.some(trip=>trip.salesManagerId===salesManager.id)||hasAuditHistory)return fail(res,409,'Salgschefen er knyttet til ture eller historik og kan derfor ikke slettes');db.users=db.users.filter(candidate=>candidate.id!==salesManager.id);await saveDb();return json(res,200,{ok:true});
    }
    return fail(res,405,'Handlingen er ikke tilladt');
  }
  const driverMatch = pathname.match(/^\/api\/drivers\/(\d+)$/);
  const driverPortraitMatch=pathname.match(/^\/api\/drivers\/(\d+)\/portrait$/);
  if(driverPortraitMatch&&req.method==='GET'){
    const driver=db.users.find(candidate=>candidate.id===Number(driverPortraitMatch[1])&&candidate.role==='driver');if(!driver)return fail(res,404,'Chaufføren findes ikke');return storedImage(res,driver.portraitFile,driver.portraitType);
  }
  if (driverMatch) {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre chauffører');
    const driver = db.users.find(u => u.id === Number(driverMatch[1]) && u.role === 'driver');
    if (!driver) return fail(res, 404, 'Chaufføren findes ikke');
    if (req.method === 'PATCH') {
      const data = await body(req); const name = String(data.name || '').trim();
      if (!name) return fail(res, 400, 'Udfyld chaufførens navn');
      if((data.email&&String(data.email).trim().toLowerCase()!==driver.email)||data.password)return fail(res,403,'Chaufføren skal selv ændre e-mail og adgangskode under Min konto');
      driver.name = name;
      if(data.portraitData){const image=storeImage({data:data.portraitData,type:data.portraitType,name:data.portraitName},{prefix:'driver'}),oldFile=driver.portraitFile;driver.portraitFile=image.file;driver.portraitType=image.type;driver.portraitName=image.name;if(oldFile!==image.file)removeStoredFile(oldFile)}
      await saveDb(); return json(res, 200, cleanUser(driver));
    }
    if (req.method === 'DELETE') {
      const assigned = db.trips.some(t => t.primaryDriverId === driver.id || t.secondaryDriverId === driver.id);
      if (assigned) return fail(res, 409, 'Chaufføren er tildelt en tur og kan derfor ikke slettes');
      removeStoredFile(driver.portraitFile);db.users = db.users.filter(u => u.id !== driver.id); await saveDb(); return json(res, 200, { ok: true });
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
      stop.name = data.name.trim(); stop.address = String(data.address || '').trim(); await saveDb(); return json(res, 200, stop);
    }
    if (req.method === 'DELETE') {
      const inUse = db.trips.some(t => t.originId === stop.id || t.destinationId === stop.id) || db.passengers.some(p => p.pickupStopId === stop.id || p.destinationStopId === stop.id) || db.baggage.some(b => b.pickupStopId === stop.id || b.destinationStopId === stop.id);
      if (inUse) return fail(res, 409, 'Stedet bruges allerede og kan derfor ikke slettes');
      db.stops = db.stops.filter(s => s.id !== stop.id); await saveDb(); return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'Handlingen er ikke tilladt');
  }
  if (pathname === '/api/trips' && req.method === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan oprette ture');
    const data = await body(req); if (!data.title || !data.departureAt || !data.originId || !data.destinationId || !data.primaryDriverId || !data.busId) return fail(res, 400, 'Udfyld turens obligatoriske felter');
    const origin = db.stops.find(stop => stop.id === Number(data.originId));
    if (!isFixedStartPoint(origin)) return fail(res, 400, 'Turens startpunkt skal være København eller Tetovo');
    if (Number(data.primaryDriverId) === Number(data.secondaryDriverId)) return fail(res, 400, 'De to chauffører skal være forskellige');
    const bus = db.buses.find(b => b.id === Number(data.busId)); if (!bus) return fail(res, 400, 'Vælg en gyldig bus');
    const salesManagerId=data.salesManagerId?Number(data.salesManagerId):null;if(salesManagerId&&!db.users.some(candidate=>candidate.id===salesManagerId&&candidate.role==='sales_manager'))return fail(res,400,'Vælg en gyldig salgschef');
    const durationMinutes=Math.max(30,Math.min(1440,Number(data.durationMinutes)||480));
    const departureAt = new Date(data.departureAt);
    const destinationAt = new Date(departureAt.getTime() + durationMinutes * 60000);
    const timetable = [{ stopId: Number(data.originId), arrivalAt: departureAt.toISOString(), departureAt: departureAt.toISOString() }];
    if (Number(data.destinationId) !== Number(data.originId)) timetable.push({ stopId: Number(data.destinationId), arrivalAt: destinationAt.toISOString(), departureAt: destinationAt.toISOString() });
    const trip = { id: id(), title: data.title.trim(), departureAt: departureAt.toISOString(), durationMinutes, originId: Number(data.originId), destinationId: Number(data.destinationId), timetable, basePrice: Number(data.basePrice || 0), busId: bus.id, seatCount: bus.seatCount, primaryDriverId: Number(data.primaryDriverId), secondaryDriverId: data.secondaryDriverId ? Number(data.secondaryDriverId) : null, salesManagerId, status: 'planned' };
    db.trips.push(trip); await saveDb(); return json(res, 201, tripView(trip));
  }
  const expenseMatch = pathname.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseMatch && req.method === 'PATCH') {
    const expense=db.expenses.find(e=>e.id===Number(expenseMatch[1]));if(!expense)return fail(res,404,'Udgiften findes ikke');
    const data=await body(req);
    if (data.edit === true) {
      const expenseTrip=db.trips.find(candidate=>candidate.id===expense.tripId);
      if(!expenseTrip||!allowedTrip(user,expenseTrip)||user.role==='sales_manager')return fail(res,403,'Du har ikke adgang til at rette udgiften');
      if(expense.reimbursementStatus==='paid')return fail(res,409,'En tilbagebetalt udgift kan ikke ændres');
      const reason=correctionReason(data);if(!reason)return fail(res,400,'Skriv kort, hvorfor udgiften rettes');
      const amount=Number(data.amount),currency=['DKK','EUR'].includes(data.currency)?data.currency:null,category=String(data.category||'').trim(),paymentMethod=['company_card','cash','private'].includes(data.paymentMethod)?data.paymentMethod:null;
      if(!(amount>0)||!currency||!category||!paymentMethod)return fail(res,400,'Angiv kategori, beløb, valuta og betalingsmetode');
      const allowedPayers=[expenseTrip.primaryDriverId,expenseTrip.secondaryDriverId,expense.createdBy,user.id].filter(Boolean),paidByUserId=Number(data.paidByUserId||expense.paidByUserId);
      if(!allowedPayers.includes(paidByUserId)&&user.role!=='admin')return fail(res,400,'Vælg en medarbejder med ansvar på turen');
      const updates={category,description:String(data.description||'').trim(),amount,currency,paymentMethod,paidByUserId};
      const changes=changedFields(expense,updates);if(!Object.keys(changes).length)return fail(res,400,'Der er ingen ændringer at gemme');
      Object.assign(expense,updates);expense.editHistory=expense.editHistory||[];expense.editHistory.push({editedAt:new Date().toISOString(),editedBy:user.id,reason,changes});
      if(expense.status!=='pending'){expense.status='pending';expense.reviewedAt=null;expense.reviewedBy=null;expense.reviewNote='Genåbnet efter rettelse';}
      expense.reimbursementStatus=paymentMethod==='private'?(expense.reimbursementStatus==='paid'?'paid':'pending'):'not_applicable';
      await saveDb();return json(res,200,expenseRecordView(expense));
    }
    if(data.receiptData){
      const expenseTrip=db.trips.find(trip=>trip.id===expense.tripId);if(!expenseTrip||!allowedTrip(user,expenseTrip)||user.role==='sales_manager')return fail(res,403,'Du har ikke adgang til udgiften');
      const receiptType=String(data.receiptType||''),receiptName=path.basename(String(data.receiptName||'kvittering'));if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(receiptType))return fail(res,400,'Kvitteringen skal være PDF, JPG, PNG eller WebP');const encoded=String(data.receiptData).replace(/^data:[^;]+;base64,/,'');const fileData=Buffer.from(encoded,'base64');if(!fileData.length||fileData.length>5*1024*1024)return fail(res,400,'Kvitteringen skal være mellem 1 byte og 5 MB');const extensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf'},receiptFile=`${crypto.randomBytes(18).toString('hex')}${extensions[receiptType]}`,uploadDir=UPLOAD_DIR;fs.mkdirSync(uploadDir,{recursive:true});fs.writeFileSync(path.join(uploadDir,receiptFile),fileData);expense.receiptType=receiptType;expense.receiptName=receiptName;expense.receiptFile=receiptFile;await saveDb();return json(res,200,{...expense,createdByName:userName(expense.createdBy),paidByName:userName(expense.paidByUserId||expense.createdBy),reviewedByName:userName(expense.reviewedBy)});
    }
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan godkende udgifter');
    if(data.reimbursementStatus==='paid'){
      if((expense.paymentMethod||'cash')!=='private')return fail(res,409,'Kun private udlæg kan tilbagebetales');
      if(expense.status!=='approved')return fail(res,409,'Udlægget skal godkendes før tilbagebetaling');
      if(expense.reimbursementStatus==='paid')return fail(res,409,'Udlægget er allerede tilbagebetalt');
      expense.reimbursementStatus='paid';expense.reimbursedAt=new Date().toISOString();expense.reimbursedBy=user.id;await saveDb();return json(res,200,{...expense,createdByName:userName(expense.createdBy),paidByName:userName(expense.paidByUserId||expense.createdBy),reviewedByName:userName(expense.reviewedBy),reimbursedByName:user.name});
    }
    if(!['approved','rejected'].includes(data.status))return fail(res,400,'Vælg godkendt eller afvist');
    if(expense.status!=='pending')return fail(res,409,'Udgiften er allerede behandlet');
    if(data.status==='approved'&&!expense.receiptFile)return fail(res,409,'Tilføj en kvittering før udgiften godkendes');
    expense.status=data.status;expense.reviewedAt=new Date().toISOString();expense.reviewedBy=user.id;expense.reviewNote=String(data.reviewNote||'').trim();await saveDb();return json(res,200,{...expense,createdByName:userName(expense.createdBy),paidByName:userName(expense.paidByUserId||expense.createdBy),reviewedByName:user.name});
  }
  const receiptMatch = pathname.match(/^\/api\/expenses\/(\d+)\/receipt$/);
  if (receiptMatch && req.method === 'GET') {
    const expense = db.expenses.find(e => e.id === Number(receiptMatch[1])); if (!expense || !expense.receiptFile) return fail(res, 404, 'Kvitteringen findes ikke');
    const expenseTrip = db.trips.find(t => t.id === expense.tripId); if (!expenseTrip || !allowedTrip(user,expenseTrip)) return fail(res, 403, 'Du har ikke adgang til kvitteringen');
    if(user.role==='sales_manager')return fail(res,403,'Salgschefen har ikke adgang til turudgifter');
    const file = path.join(UPLOAD_DIR,expense.receiptFile); if (!fs.existsSync(file)) return fail(res, 404, 'Kvitteringsfilen findes ikke');
    res.writeHead(200,{ 'Content-Type': expense.receiptType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(expense.receiptName)}` }); fs.createReadStream(file).pipe(res); return;
  }
  const baggagePhotoMatch = pathname.match(/^\/api\/baggage\/(\d+)\/photo$/);
  if (baggagePhotoMatch && req.method === 'GET') {
    const item = db.baggage.find(candidate => candidate.id === Number(baggagePhotoMatch[1])); if (!item || !item.photoFile) return fail(res,404,'Bagagebilledet findes ikke');
    const photoTrip = db.trips.find(candidate => candidate.id === item.tripId); if (!photoTrip || !allowedTrip(user,photoTrip)) return fail(res,403,'Du har ikke adgang til bagagebilledet');
    if (user.role === 'sales_manager' && item.pickupStopId !== photoTrip.originId) return fail(res,403,'Salgschefen kan kun se bagage fra turens startsted');
    const file = path.join(UPLOAD_DIR,item.photoFile); if (!fs.existsSync(file)) return fail(res,404,'Bagagebilledets fil findes ikke');
    res.writeHead(200,{ 'Content-Type': item.photoType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.photoName)}` }); fs.createReadStream(file).pipe(res); return;
  }
  const match = pathname.match(/^\/api\/trips\/(\d+)(?:\/(passengers|baggage|seats|expenses|settlements|transfers))?$/);
  if (!match) return fail(res, 404, 'Ikke fundet');
  const trip = db.trips.find(t => t.id === Number(match[1])); if (!trip) return fail(res, 404, 'Turen findes ikke');
  if (!allowedTrip(user, trip)) return fail(res, 403, 'Du er ikke tildelt denne tur');
  const part = match[2];
  if (!part && req.method === 'DELETE') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan slette en tur');
    const linked = {
      passengers: db.passengers.some(record => record.tripId === trip.id),
      baggage: db.baggage.some(record => record.tripId === trip.id),
      expenses: db.expenses.some(record => record.tripId === trip.id),
      settlements: db.cashSettlements.some(record => record.tripId === trip.id),
      transfers: db.cashTransfers.some(record => record.tripId === trip.id)
    };
    if (Object.values(linked).some(Boolean)) return fail(res,409,'Turen har registrerede passagerer, bagage, udgifter eller kontantafstemninger og skal derfor annulleres i stedet');
    db.trips = db.trips.filter(record => record.id !== trip.id); await saveDb(); return json(res,200,{ok:true});
  }
  if (!part && req.method === 'PATCH') {
    const data = await body(req);
    if (Object.prototype.hasOwnProperty.call(data,'status')) {
      if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan annullere en tur');
      if (data.status !== 'cancelled') return fail(res,400,'Turen kan kun ændres til annulleret');
      if (trip.status === 'cancelled') return fail(res,409,'Turen er allerede annulleret');
      const reason = String(data.cancellationReason || '').trim(); if (reason.length < 3) return fail(res,400,'Skriv en begrundelse for annulleringen');
      trip.status='cancelled';trip.cancellationReason=reason;trip.cancelledAt=new Date().toISOString();trip.cancelledBy=user.id;await saveDb();return json(res,200,tripView(trip));
    }
    if (trip.status === 'cancelled') return fail(res,409,'Turen er annulleret og kan ikke ændres');
    if (Object.prototype.hasOwnProperty.call(data,'timetable')) {
      if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan ændre turens tidtabel');
      if (!Array.isArray(data.timetable) || data.timetable.length < 1) return fail(res,400,'Tidsplanen skal indeholde mindst ét stoppested');
      const timetable = [], stopIds = new Set();
      for (const row of data.timetable) {
        const stopId = Number(row.stopId), arrival = new Date(row.arrivalAt), departure = new Date(row.departureAt);
        if (!db.stops.some(stop => stop.id === stopId)) return fail(res,400,'Tidsplanen indeholder et ukendt opsamlingssted');
        if (stopIds.has(stopId)) return fail(res,400,'Et opsamlingssted må kun stå én gang i tidsplanen');
        if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return fail(res,400,'Angiv både ankomst og afgang ved alle stoppesteder');
        if (arrival > departure) return fail(res,400,'Afgang kan ikke ligge før ankomst');
        stopIds.add(stopId); timetable.push({ stopId, arrivalAt: arrival.toISOString(), departureAt: departure.toISOString() });
      }
      timetable.sort((left,right) => new Date(left.arrivalAt) - new Date(right.arrivalAt));
      if (!stopIds.has(trip.originId) || !stopIds.has(trip.destinationId)) return fail(res,400,'Start- og slutsted skal være med i tidsplanen');
      for (let index=1; index<timetable.length; index++) if (new Date(timetable[index].arrivalAt) < new Date(timetable[index-1].departureAt)) return fail(res,400,'Tiderne skal følge stoppestedernes rækkefølge');
      trip.timetable = timetable;
      trip.departureAt = timetable.find(row => row.stopId === trip.originId)?.departureAt || trip.departureAt;
      await saveDb(); return json(res,200,tripView(trip));
    }
    if (data.completedStopId) {
      const stopId = Number(data.completedStopId); if (!db.stops.some(s => s.id === stopId)) return fail(res,400,'Opsamlingsstedet findes ikke');
      if(user.role==='sales_manager'&&!db.passengers.some(passenger=>passenger.tripId===trip.id&&passenger.pickupStopId===stopId))return fail(res,403,'Salgschefen kan kun afslutte stoppesteder med passagerer på turen');
      trip.completedStopIds = trip.completedStopIds || []; if (!trip.completedStopIds.includes(stopId)) trip.completedStopIds.push(stopId); await saveDb(); return json(res,200,tripView(trip));
    }
    if (Object.prototype.hasOwnProperty.call(data,'salesManagerId')) {
      if(user.role!=='admin')return fail(res,403,'Kun administratoren kan tildele en salgschef');
      const checkInStarted=db.passengers.some(passenger=>passenger.tripId===trip.id&&(passenger.checkedIn||passenger.attendanceHistory?.some(event=>event.action==='checked_in')));if(checkInStarted)return fail(res,409,'Salgschefen er låst, fordi check-in er begyndt på turen');
      const salesManagerId=data.salesManagerId?Number(data.salesManagerId):null;if(salesManagerId&&!db.users.some(candidate=>candidate.id===salesManagerId&&candidate.role==='sales_manager'))return fail(res,400,'Vælg en gyldig salgschef');
      trip.salesManagerId=salesManagerId;await saveDb();return json(res,200,tripView(trip));
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
      trip.primaryDriverId = primaryDriverId; trip.secondaryDriverId = secondaryDriverId; await saveDb(); return json(res,200,tripView(trip));
    }
    if (data.busId) {
      if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan skifte bus');
      const bus = db.buses.find(b=>b.id===Number(data.busId)); if(!bus)return fail(res,404,'Bussen findes ikke');
      const highestBookedSeat = Math.max(0,...db.passengers.filter(p=>p.tripId===trip.id).map(p=>p.seatNumber)); if(bus.seatCount<highestBookedSeat)return fail(res,409,`Sæde ${highestBookedSeat} er allerede reserveret og findes ikke i den valgte bus`);
      trip.busId=bus.id;trip.seatCount=bus.seatCount;await saveDb();return json(res,200,tripView(trip));
    }
    if (user.role !== 'admin') return fail(res, 403, 'Kun administratoren kan ændre antal sæder');
    const seatCount = Number(data.seatCount);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 84) return fail(res, 400, 'Antal sæder skal være mellem 1 og 84');
    const highestBookedSeat = Math.max(0, ...db.passengers.filter(p => p.tripId === trip.id).map(p => p.seatNumber));
    if (seatCount < highestBookedSeat) return fail(res, 409, `Der er allerede booket sæde ${highestBookedSeat}. Kapaciteten kan ikke sættes lavere.`);
    trip.seatCount = seatCount; await saveDb(); return json(res, 200, tripView(trip));
  }
  if (!part && req.method === 'GET') {
    const startOnly=record=>user.role!=='sales_manager'||record.pickupStopId===trip.originId;
    const settlements=db.cashSettlements.filter(settlement=>settlement.tripId===trip.id&&(user.role!=='sales_manager'||settlement.driverId===user.id)).map(settlement=>({...settlement,driverName:db.users.find(candidate=>candidate.id===settlement.driverId)?.name||'Ukendt',submittedByName:db.users.find(candidate=>candidate.id===settlement.submittedBy)?.name||'Ukendt',reviewedByName:settlement.reviewedBy?db.users.find(candidate=>candidate.id===settlement.reviewedBy)?.name||'Ukendt':null}));
    const expenses=user.role==='sales_manager'?[]:db.expenses.filter(expense=>expense.tripId===trip.id).map(expenseRecordView);
    const transfers=db.cashTransfers.filter(transfer=>transfer.tripId===trip.id&&(user.role==='admin'||[transfer.fromDriverId,transfer.toDriverId].includes(user.id))).map(cashTransferView);
    return json(res,200,{trip:tripView(trip),passengers:db.passengers.filter(passenger=>passenger.tripId===trip.id).map(passengerRecordView),baggage:db.baggage.filter(item=>item.tripId===trip.id&&startOnly(item)).map(baggageRecordView),expenses,settlements,transfers,seats:seatMap(trip.id)});
  }
  if (part === 'seats' && req.method === 'GET') return json(res, 200, seatMap(trip.id));
  if (trip.status === 'cancelled' && ['passengers','baggage'].includes(part)) return fail(res,409,'Turen er annulleret og kan ikke længere bruges til salg eller check-in');
  if (part === 'passengers' && req.method === 'POST') {
    if (!['admin','sales_manager','driver'].includes(user.role)) return fail(res, 403, 'Du har ikke adgang til at oprette passagerer');
    const data = await body(req); const seat = seatMap(trip.id).find(s => s.number === Number(data.seatNumber));
    if (!data.name?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !seat) return fail(res, 400, 'Udfyld passagerens obligatoriske felter');
    if(user.role==='driver'&&data.paymentStatus!=='cash')return fail(res,403,'Chaufføren kan kun oprette billetter, der betales i bussen');
    if (seat.passengerId) return fail(res, 409, 'Sædet er allerede reserveret');
    if (!['unpaid','cash','free','pay_dk','pay_mk'].includes(data.paymentStatus)) return fail(res, 400, 'Ugyldig betalingsstatus');
    if(data.paymentStatus==='cash'&&!(Number(data.cashAmount)>0))return fail(res,400,'Angiv det modtagne kontantbeløb');
    const ticketNumber=String(data.ticketNumber||'').trim();
    if(ticketNumber&&db.passengers.some(passenger=>passenger.tripId===trip.id&&String(passenger.ticketNumber||'').toLocaleLowerCase('da-DK')===ticketNumber.toLocaleLowerCase('da-DK')))return fail(res,409,'Billetnummeret bruges allerede på denne tur');
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    if(user.role==='sales_manager'&&data.paymentStatus==='free')return fail(res,403,'Kun administratoren kan udstede gratis billetter');
    const paymentLocation=data.paymentStatus==='cash'?(user.role==='sales_manager'?'departure':user.role==='driver'?'bus':'shop'):null,cashHolderUserId=data.paymentStatus==='cash'&&['sales_manager','driver'].includes(user.role)?user.id:null;
    const passenger = { id: id(), tripId: trip.id, name: data.name.trim(), ticketNumber, phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), paymentStatus: data.paymentStatus, paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation, paymentRecordedAt: ['cash','free'].includes(data.paymentStatus) ? new Date().toISOString() : null, paymentRecordedBy: ['cash','free'].includes(data.paymentStatus) ? user.id : null, cashHolderUserId, createdBy:user.id, freeTicketReason: data.paymentStatus === 'free' ? String(data.freeTicketReason || '').trim() : '', seatNumber: seat.number, seatType: seat.type, seatSurcharge: seat.surcharge, totalPrice: data.paymentStatus === 'free' ? 0 : trip.basePrice + seat.surcharge, checkedIn: false, attendanceStatus: 'pending', checkedInAt: null, checkedInBy: null };
    db.passengers.push(passenger); await saveDb(); return json(res, 201, passengerRecordView(passenger));
  }
  if (part === 'passengers' && req.method === 'DELETE') {
    if (!['admin','sales_manager','driver'].includes(user.role)) return fail(res,403,'Du har ikke adgang til at slette passagerer');
    const data=await body(req),passenger=db.passengers.find(candidate=>candidate.id===Number(data.id)&&candidate.tripId===trip.id);if(!passenger)return fail(res,404,'Passageren findes ikke');
    const reason=String(data.deletionReason||'').trim();if(reason.length<3)return fail(res,400,'Skriv kort, hvorfor passageren slettes');
    const reference=`passenger:${passenger.id}`;if(passenger.cashHandedOverAt||hasCashAuditReference(reference))return fail(res,409,'Passagerens betaling indgår i en kontantoverførsel eller afstemning og kan derfor ikke slettes');
    recordDeletion(trip,'passenger',passenger,user,reason);db.passengers=db.passengers.filter(candidate=>candidate.id!==passenger.id);await saveDb();return json(res,200,{ok:true,freedSeatNumber:passenger.seatNumber});
  }
  if (part === 'passengers' && req.method === 'PATCH') {
    const data = await body(req); const passenger = db.passengers.find(p => p.id === Number(data.id) && p.tripId === trip.id); if (!passenger) return fail(res, 404, 'Passageren findes ikke');
    if (data.edit === true) {
      const reason=correctionReason(data);if(!reason)return fail(res,400,'Skriv kort, hvorfor passageren rettes');
      const name=String(data.name||'').trim(),ticketNumber=String(data.ticketNumber||'').trim(),phone=String(data.phone||'').trim(),pickupStopId=Number(data.pickupStopId),destinationStopId=Number(data.destinationStopId),seatNumber=Number(data.seatNumber);
      if(!name||!phone||!db.stops.some(stop=>stop.id===pickupStopId)||!db.stops.some(stop=>stop.id===destinationStopId))return fail(res,400,'Udfyld navn, telefon og gyldig rute');
      const seat=seatMap(trip.id).find(candidate=>candidate.number===seatNumber);if(!seat)return fail(res,400,'Vælg et gyldigt sæde');if(seat.passengerId&&seat.passengerId!==passenger.id)return fail(res,409,'Sædet er allerede reserveret');
      if(ticketNumber&&db.passengers.some(candidate=>candidate.tripId===trip.id&&candidate.id!==passenger.id&&String(candidate.ticketNumber||'').toLocaleLowerCase('da-DK')===ticketNumber.toLocaleLowerCase('da-DK')))return fail(res,409,'Billetnummeret bruges allerede på denne tur');
      const updates={name,ticketNumber,phone,pickupStopId,destinationStopId,seatNumber,seatType:seat.type,seatSurcharge:seat.surcharge,totalPrice:passenger.paymentStatus==='free'?0:trip.basePrice+seat.surcharge};
      if(passenger.paymentStatus==='free')updates.freeTicketReason=String(data.freeTicketReason||'').trim();
      if(passenger.paymentStatus==='cash'&&(Object.prototype.hasOwnProperty.call(data,'cashAmount')||Object.prototype.hasOwnProperty.call(data,'paymentCurrency'))){
        if(passenger.cashHandedOverAt||hasPendingSettlementReference(`passenger:${passenger.id}`)||hasPendingTransferReference(`passenger:${passenger.id}`))return fail(res,409,'Betalingen er låst af en igangværende eller afsluttet kontantafstemning');
        const amount=Number(data.cashAmount),currency=['DKK','EUR'].includes(data.paymentCurrency)?data.paymentCurrency:null;if(!(amount>0)||!currency)return fail(res,400,'Angiv korrekt beløb og valuta');updates.cashAmount=amount;updates.paymentCurrency=currency;
      }
      const changes=changedFields(passenger,updates);if(!Object.keys(changes).length)return fail(res,400,'Der er ingen ændringer at gemme');
      Object.assign(passenger,updates);passenger.editHistory=passenger.editHistory||[];passenger.editHistory.push({editedAt:new Date().toISOString(),editedBy:user.id,reason,changes});
      await saveDb();return json(res,200,passengerRecordView(passenger));
    }
    if(user.role==='sales_manager'&&passenger.pickupStopId!==trip.originId&&data.paymentStatus==='cash')return fail(res,403,'Salgschefen kan kun modtage billetbetaling ved turens startsted');
    if (data.paymentStatus === 'cash') {
      if (!isPendingPayment(passenger)) return fail(res, 409, 'Billetten er allerede afsluttet som betalt eller gratis');
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
      if (data.checkedIn === passenger.checkedIn) return json(res,200,passengerRecordView(passenger));
      passenger.checkedIn = data.checkedIn; passenger.attendanceStatus = passenger.checkedIn ? 'checked_in' : 'pending'; passenger.checkedInAt = passenger.checkedIn ? new Date().toISOString() : null; passenger.checkedInBy = passenger.checkedIn ? user.id : null;
      if (passenger.checkedIn && passenger.paymentLocation === 'bus' && user.role === 'driver') passenger.cashHolderUserId = user.id;
      passenger.attendanceHistory = passenger.attendanceHistory || []; const attendanceEvent={ action:passenger.checkedIn?'checked_in':'check_in_undone',at:new Date().toISOString(),userId:user.id,stopId:passenger.pickupStopId }; if(passenger.checkedIn)Object.assign(attendanceEvent,{receivedAmount:passenger.paymentStatus==='cash'?Number(passenger.cashAmount||0):0,receivedCurrency:passenger.paymentCurrency||'DKK',receivedBy:passenger.paymentStatus==='cash'?(passenger.cashHolderUserId||passenger.paymentRecordedBy):null}); passenger.attendanceHistory.push(attendanceEvent);
    }
    if (data.attendanceStatus === 'no_show') { passenger.checkedIn = false; passenger.attendanceStatus = 'no_show'; passenger.checkedInAt = null; passenger.checkedInBy = null; passenger.attendanceHistory = passenger.attendanceHistory || []; passenger.attendanceHistory.push({action:'no_show',at:new Date().toISOString(),userId:user.id,stopId:passenger.pickupStopId}); }
    await saveDb(); return json(res, 200, passengerRecordView(passenger));
  }
  if (part === 'baggage' && req.method === 'POST') {
    if (!['admin','sales_manager','driver'].includes(user.role)) return fail(res, 403, 'Du har ikke adgang til at registrere bagage');
    const data = await body(req); if (!data.senderName?.trim() || !data.recipientName?.trim() || !data.phone?.trim() || !data.pickupStopId || !data.destinationStopId || !data.pieces) return fail(res, 400, 'Udfyld afsender, modtager og bagagens øvrige obligatoriske felter');
    if(user.role==='sales_manager'&&Number(data.pickupStopId)!==trip.originId)return fail(res,403,'Salgschefen kan kun modtage bagage ved turens startsted');
    if(user.role==='driver'&&data.paymentStatus!=='cash')return fail(res,403,'Chaufføren kan kun modtage bagage, der betales i bussen');
    if(!['unpaid','cash','pay_dk','pay_mk'].includes(data.paymentStatus))return fail(res,400,'Ugyldig betalingsstatus');
    if(data.paymentStatus==='cash'&&!(Number(data.cashAmount)>0))return fail(res,400,'Angiv det modtagne kontantbeløb');
    const photoType=String(data.photoType||''),photoName=path.basename(String(data.photoName||'bagagefoto'));if(!data.photoData)return fail(res,400,'Tag eller vælg et billede af bagagen');
    if(!['image/jpeg','image/png','image/webp'].includes(photoType))return fail(res,400,'Bagagebilledet skal være JPG, PNG eller WebP');
    const encodedPhoto=String(data.photoData).replace(/^data:[^;]+;base64,/,'');const photoData=Buffer.from(encodedPhoto,'base64');if(!photoData.length)return fail(res,400,'Bagagebilledet er tomt');
    const photoExtensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'},photoFile=`baggage-${crypto.randomBytes(18).toString('hex')}${photoExtensions[photoType]}`;fs.mkdirSync(UPLOAD_DIR,{recursive:true});fs.writeFileSync(path.join(UPLOAD_DIR,photoFile),photoData);
    const paymentCurrency = ['DKK','EUR'].includes(data.paymentCurrency) ? data.paymentCurrency : 'DKK';
    const createdAt=new Date().toISOString();
    const item = { id: id(), tripId: trip.id, senderName: data.senderName.trim(), recipientName: data.recipientName.trim(), phone: data.phone.trim(), pickupStopId: Number(data.pickupStopId), destinationStopId: Number(data.destinationStopId), pieces: Number(data.pieces), description: String(data.description || '').trim(), photoName, photoType, photoFile, paymentStatus: data.paymentStatus, paymentCurrency, cashAmount: data.paymentStatus === 'cash' ? Number(data.cashAmount || 0) : 0, paymentLocation: data.paymentStatus === 'cash' ? (user.role==='sales_manager'?'departure':user.role==='driver'?'bus':'shop') : null, paymentRecordedAt: data.paymentStatus === 'cash' ? createdAt : null, paymentRecordedBy: data.paymentStatus === 'cash' ? user.id : null, cashHolderUserId: data.paymentStatus === 'cash'&&['sales_manager','driver'].includes(user.role)?user.id:null, notes: String(data.notes || '').trim(), status: 'registered', createdAt, createdBy:user.id, statusUpdatedAt:createdAt, statusUpdatedBy:user.id, baggageHistory:[{action:'registered',at:createdAt,userId:user.id}] };
    db.baggage.push(item); await saveDb(); return json(res, 201, baggageRecordView(item));
  }
  if (part === 'baggage' && req.method === 'DELETE') {
    if (!['admin','sales_manager','driver'].includes(user.role)) return fail(res,403,'Du har ikke adgang til at slette bagage');
    const data=await body(req),item=db.baggage.find(candidate=>candidate.id===Number(data.id)&&candidate.tripId===trip.id);if(!item)return fail(res,404,'Bagagen findes ikke');
    if(user.role==='sales_manager'&&item.pickupStopId!==trip.originId)return fail(res,403,'Salgschefen kan kun slette bagage ved turens startsted');
    const reason=String(data.deletionReason||'').trim();if(reason.length<3)return fail(res,400,'Skriv kort, hvorfor bagagen slettes');
    const reference=`baggage:${item.id}`;if(item.cashHandedOverAt||hasCashAuditReference(reference))return fail(res,409,'Bagagens betaling indgår i en kontantoverførsel eller afstemning og kan derfor ikke slettes');
    recordDeletion(trip,'baggage',item,user,reason);db.baggage=db.baggage.filter(candidate=>candidate.id!==item.id);await saveDb();
    if(item.photoFile){const photoPath=path.join(UPLOAD_DIR,path.basename(item.photoFile));try{if(fs.existsSync(photoPath))fs.unlinkSync(photoPath)}catch(error){console.error('Kunne ikke fjerne slettet bagagefoto:',error.message)}}
    return json(res,200,{ok:true});
  }
  if (part === 'baggage' && req.method === 'PATCH') {
    const data = await body(req); const item = db.baggage.find(b => b.id === Number(data.id) && b.tripId === trip.id); if (!item) return fail(res, 404, 'Bagagen findes ikke');
    if (data.edit === true) {
      const reason=correctionReason(data);if(!reason)return fail(res,400,'Skriv kort, hvorfor bagagen rettes');
      const senderName=String(data.senderName||'').trim(),recipientName=String(data.recipientName||'').trim(),phone=String(data.phone||'').trim(),pickupStopId=Number(data.pickupStopId),destinationStopId=Number(data.destinationStopId),pieces=Number(data.pieces);
      if(!senderName||!recipientName||!phone||!Number.isInteger(pieces)||pieces<1||!db.stops.some(stop=>stop.id===pickupStopId)||!db.stops.some(stop=>stop.id===destinationStopId))return fail(res,400,'Udfyld afsender, modtager, telefon, rute og antal kolli');
      const updates={senderName,recipientName,phone,pickupStopId,destinationStopId,pieces,description:String(data.description||'').trim(),notes:String(data.notes||'').trim()};
      if(item.paymentStatus==='cash'&&(Object.prototype.hasOwnProperty.call(data,'cashAmount')||Object.prototype.hasOwnProperty.call(data,'paymentCurrency'))){
        if(item.cashHandedOverAt||hasPendingSettlementReference(`baggage:${item.id}`)||hasPendingTransferReference(`baggage:${item.id}`))return fail(res,409,'Betalingen er låst af en igangværende eller afsluttet kontantafstemning');
        const amount=Number(data.cashAmount),currency=['DKK','EUR'].includes(data.paymentCurrency)?data.paymentCurrency:null;if(!(amount>0)||!currency)return fail(res,400,'Angiv korrekt beløb og valuta');updates.cashAmount=amount;updates.paymentCurrency=currency;
      }
      const changes=changedFields(item,updates);if(!Object.keys(changes).length)return fail(res,400,'Der er ingen ændringer at gemme');
      Object.assign(item,updates);item.editHistory=item.editHistory||[];item.editHistory.push({editedAt:new Date().toISOString(),editedBy:user.id,reason,changes});
      await saveDb();return json(res,200,baggageRecordView(item));
    }
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
    await saveDb(); return json(res, 200, baggageRecordView(item));
  }
  if (part === 'expenses' && req.method === 'POST') {
    if(user.role==='sales_manager')return fail(res,403,'Salgschefen kan ikke registrere turudgifter');
    const data = await body(req); const amount = Number(data.amount); const currency = ['DKK','EUR'].includes(data.currency) ? data.currency : null; const category = String(data.category || '').trim();
    if (!(amount > 0) || !currency || !category) return fail(res, 400, 'Angiv kategori, beløb og valuta');
    const paymentMethod=['company_card','cash','private'].includes(data.paymentMethod)?data.paymentMethod:'cash';
    const allowedPayers=[user.id,trip.primaryDriverId,trip.secondaryDriverId].filter(Boolean),paidByUserId=user.role==='admin'&&allowedPayers.includes(Number(data.paidByUserId))?Number(data.paidByUserId):user.id;
    let receiptType=null,receiptName=null,receiptFile=null;
    if(data.receiptData){receiptType=String(data.receiptType||'');receiptName=path.basename(String(data.receiptName||'kvittering'));if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(receiptType))return fail(res,400,'Kvitteringen skal være PDF, JPG, PNG eller WebP');const encoded=String(data.receiptData).replace(/^data:[^;]+;base64,/,'');const fileData=Buffer.from(encoded,'base64');if(!fileData.length||fileData.length>5*1024*1024)return fail(res,400,'Kvitteringen skal være mellem 1 byte og 5 MB');const extensions={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf'};receiptFile=`${crypto.randomBytes(18).toString('hex')}${extensions[receiptType]}`;const uploadDir=UPLOAD_DIR;fs.mkdirSync(uploadDir,{recursive:true});fs.writeFileSync(path.join(uploadDir,receiptFile),fileData);}
    const expense = { id:id(),tripId:trip.id,expenseDate:trip.departureAt,category,description:String(data.description||'').trim(),amount,currency,paymentMethod,paidByUserId,receiptName,receiptType,receiptFile,createdAt:new Date().toISOString(),createdBy:user.id,status:'pending',reviewedAt:null,reviewedBy:null,reviewNote:'',reimbursementStatus:paymentMethod==='private'?'pending':'not_applicable',reimbursedAt:null,reimbursedBy:null };
    db.expenses.push(expense); await saveDb(); return json(res,201,{...expense,createdByName:user.name,paidByName:userName(paidByUserId)});
  }
  if (part === 'transfers' && req.method === 'POST') {
    if(!['driver','admin'].includes(user.role))return fail(res,403,'Kun tildelte chauffører kan overføre kontanter');
    const data=await body(req),assignedDriverIds=[trip.primaryDriverId,trip.secondaryDriverId].filter(Boolean),fromDriverId=user.role==='driver'?user.id:Number(data.fromDriverId),toDriverId=Number(data.toDriverId);
    if(!assignedDriverIds.includes(fromDriverId)||!assignedDriverIds.includes(toDriverId)||fromDriverId===toDriverId)return fail(res,400,'Vælg to forskellige chauffører, som er tildelt turen');
    const references=[...new Set((Array.isArray(data.paymentRefs)?data.paymentRefs:[]).map(String))];if(!references.length)return fail(res,400,'Vælg mindst én billet- eller bagagebetaling');
    const items=references.map(reference=>cashRecordByReference(reference,trip.id));if(items.some(item=>!item))return fail(res,400,'En valgt betaling findes ikke på turen');
    if(items.some(item=>item.record.paymentStatus!=='cash'||item.record.paymentLocation!=='bus'||item.record.cashHolderUserId!==fromDriverId||item.record.cashHandedOverAt))return fail(res,409,'En valgt betaling står ikke længere hos den afsendende chauffør');
    if(items.some(item=>hasPendingSettlementReference(item.reference)||hasPendingTransferReference(item.reference)))return fail(res,409,'En valgt betaling indgår allerede i en igangværende afstemning eller overførsel');
    const totals=cashAmounts(items),transfer={id:id(),tripId:trip.id,fromDriverId,toDriverId,paymentRefs:items.map(item=>item.reference),totals,note:String(data.note||'').trim(),status:'pending',initiatedAt:new Date().toISOString(),initiatedBy:user.id,respondedAt:null,respondedBy:null,responseNote:''};
    db.cashTransfers.push(transfer);await saveDb();return json(res,201,cashTransferView(transfer));
  }
  if (part === 'transfers' && req.method === 'PATCH') {
    const data=await body(req),transfer=db.cashTransfers.find(candidate=>candidate.id===Number(data.id)&&candidate.tripId===trip.id);if(!transfer)return fail(res,404,'Kontantoverførslen findes ikke');
    if(transfer.status!=='pending')return fail(res,409,'Kontantoverførslen er allerede behandlet');
    if(!['accepted','rejected'].includes(data.status))return fail(res,400,'Vælg modtaget eller afvist');
    if(user.role!=='admin'&&!(user.role==='driver'&&user.id===transfer.toDriverId))return fail(res,403,'Kun den modtagende chauffør kan bekræfte overførslen');
    if(data.status==='accepted'){
      const items=transfer.paymentRefs.map(reference=>cashRecordByReference(reference,trip.id));if(items.some(item=>!item||item.record.cashHolderUserId!==transfer.fromDriverId||item.record.cashHandedOverAt||hasPendingSettlementReference(item.reference)))return fail(res,409,'En betaling har ændret status. Overførslen kan ikke gennemføres');
      const acceptedAt=new Date().toISOString();for(const item of items){item.record.cashHolderUserId=transfer.toDriverId;item.record.cashTransferHistory=item.record.cashTransferHistory||[];item.record.cashTransferHistory.push({transferId:transfer.id,fromDriverId:transfer.fromDriverId,toDriverId:transfer.toDriverId,at:acceptedAt,acceptedBy:user.id});}
    }
    transfer.status=data.status;transfer.respondedAt=new Date().toISOString();transfer.respondedBy=user.id;transfer.responseNote=String(data.responseNote||'').trim();await saveDb();return json(res,200,cashTransferView(transfer));
  }
  if (part === 'settlements' && req.method === 'POST') {
    const data = await body(req); const driverId = ['driver','sales_manager'].includes(user.role) ? user.id : Number(data.driverId);
    const cashHolderIds=[...new Set([...db.passengers,...db.baggage].filter(record=>record.tripId===trip.id&&record.cashHolderUserId).map(record=>record.cashHolderUserId))];
    if (user.role!=='sales_manager'&&![trip.primaryDriverId,trip.secondaryDriverId,trip.salesManagerId,...cashHolderIds].includes(driverId)) return fail(res,400,'Vælg en medarbejder med ansvar på turen');
    if (db.cashSettlements.some(s=>s.tripId===trip.id&&s.driverId===driverId&&s.status==='pending')) return fail(res,409,'Medarbejderen har allerede en afstemning, der afventer godkendelse');
    const items = unsettledCashRecords(trip.id,driverId); if (!items.length) return fail(res,400,'Der er ingen uafstemte kontanter hos medarbejderen');
    if(items.some(item=>hasPendingTransferReference(`${item.kind}:${item.record.id}`)))return fail(res,409,'En eller flere betalinger afventer overførsel til en anden chauffør');
    const expected = cashAmounts(items); const delivered = { DKK:Number(data.deliveredDKK||0),EUR:Number(data.deliveredEUR||0) };
    if (delivered.DKK < 0 || delivered.EUR < 0) return fail(res,400,'Det afleverede beløb kan ikke være negativt');
    const settlement = { id:id(),tripId:trip.id,driverId,expected,delivered,difference:{DKK:delivered.DKK-expected.DKK,EUR:delivered.EUR-expected.EUR},note:String(data.note||'').trim(),paymentRefs:items.map(item=>`${item.kind}:${item.record.id}`),status:'pending',submittedAt:new Date().toISOString(),submittedBy:user.id,reviewedAt:null,reviewedBy:null,reviewNote:'' };
    db.cashSettlements.push(settlement); await saveDb(); return json(res,201,{...settlement,driverName:db.users.find(u=>u.id===driverId)?.name||'Ukendt',submittedByName:user.name});
  }
  if (part === 'settlements' && req.method === 'PATCH') {
    if (user.role !== 'admin') return fail(res,403,'Kun administratoren kan godkende kontantafstemninger');
    const data = await body(req); const settlement = db.cashSettlements.find(s=>s.id===Number(data.id)&&s.tripId===trip.id); if (!settlement) return fail(res,404,'Afstemningen findes ikke');
    if (settlement.status !== 'pending') return fail(res,409,'Afstemningen er allerede behandlet');
    if (!['approved','rejected'].includes(data.status)) return fail(res,400,'Vælg godkendt eller afvist');
    settlement.status=data.status;settlement.reviewedAt=new Date().toISOString();settlement.reviewedBy=user.id;settlement.reviewNote=String(data.reviewNote||'').trim();
    if (data.status === 'approved') for (const ref of settlement.paymentRefs) { const [kind,recordId]=ref.split(':'); const collection=kind==='passenger'?db.passengers:db.baggage; const record=collection.find(item=>item.id===Number(recordId)); if(record&&!record.cashHandedOverAt){record.cashHandedOverAt=settlement.reviewedAt;record.cashSettlementId=settlement.id;} }
    await saveDb(); return json(res,200,{...settlement,driverName:db.users.find(u=>u.id===settlement.driverId)?.name||'Ukendt',submittedByName:db.users.find(u=>u.id===settlement.submittedBy)?.name||'Ukendt',reviewedByName:user.name});
  }
  return fail(res, 405, 'Handlingen er ikke tilladt');
}
function staticFile(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(file).pipe(res); return true;
}
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  try {
    await storageReady;
    if (pathname.startsWith('/api/') && !validRequestOrigin(req)) return fail(res, 403, 'Anmodningen kommer fra en ukendt adresse');
    if (pathname.startsWith('/api/')) await api(req, res, pathname);
    else if (!staticFile(res, pathname)) fail(res, 404, 'Ikke fundet');
  }
  catch (error) {
    console.error(error);
    if (!res.headersSent) fail(res, error.statusCode|| (pathname === '/api/health' ? 503 : 500), pathname === '/api/health' ? 'Databasen er ikke klar' : error.statusCode?error.message:'Intern fejl');
    else res.destroy();
  }
});
async function shutdown(signal) {
  console.log(`${signal}: BusOps lukker sikkert ned`);
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve());
  await storageWriteQueue.catch(() => {});
  if (pool) await pool.end();
}
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`BusOps kører på http://${HOST}:${PORT} med ${DATABASE_URL ? 'PostgreSQL' : 'JSON-lagring'}`));
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => shutdown(signal).finally(() => process.exit(0)));
}
module.exports = { server, seed, hashPassword, verifyPassword, seatMap, storageReady };
