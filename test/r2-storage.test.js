const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'busops-r2-'));
process.env.DB_FILE = path.join(root, 'db.json');
process.env.UPLOAD_DIR = path.join(root, 'uploads');
process.env.FILE_STORAGE_BACKEND = 'mirror';
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET = 'busops-files';
process.env.R2_PREFIX = 'busops';
process.env.R2_JURISDICTION = 'eu';
process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const requests = [];
let r2Status = 200;
global.fetch = async (url, options = {}) => {
  requests.push({ url:String(url), method:options.method, headers:options.headers, body:options.body });
  return new Response(null, { status: options.method === 'PUT' || options.method === 'DELETE' ? r2Status : 404 });
};

const { storageReady, fileStorage, maintenance } = require('../server');

test('mirror storage writes and deletes locally and in private Cloudflare R2', async () => {
  await storageReady;
  const bytes = Buffer.from('receipt-content');
  await fileStorage.storeFile('receipt.pdf', bytes, 'application/pdf');

  assert.equal(fileStorage.backend, 'mirror');
  assert.equal(fileStorage.r2Configured, true);
  assert.deepEqual(fs.readFileSync(path.join(process.env.UPLOAD_DIR, 'receipt.pdf')), bytes);
  assert.equal(requests[0].method, 'PUT');
  assert.equal(requests[0].url, 'https://test-account.eu.r2.cloudflarestorage.com/busops-files/busops/receipt.pdf');
  assert.match(requests[0].headers.Authorization, /^AWS4-HMAC-SHA256 Credential=test-access-key\//);
  assert.equal(requests[0].headers['Content-Type'], 'application/pdf');

  await fileStorage.removeStoredFile('receipt.pdf');
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR, 'receipt.pdf')), false);
  assert.equal(requests[1].method, 'DELETE');
});

test('mirror storage preserves the Render copy if R2 is temporarily unavailable', async () => {
  r2Status = 503;
  const bytes = Buffer.from('offline-safe-copy');
  await fileStorage.storeFile('fallback.jpg', bytes, 'image/jpeg');
  assert.deepEqual(fs.readFileSync(path.join(process.env.UPLOAD_DIR, 'fallback.jpg')), bytes);
});

test('database backups are compressed, encrypted and uploaded to private R2', async () => {
  r2Status = 200;
  const run = await maintenance.createDatabaseBackup({ reason:'test' });
  const request = requests.at(-1);
  assert.equal(run.status, 'success');
  assert.equal(run.type, 'database_backup');
  assert.match(run.summary.file, /^database-backup-.*\.busops$/);
  assert.equal(request.method, 'PUT');
  assert.match(request.url, /\/busops\/database-backup-/);
  const bytes = Buffer.from(request.body);
  assert.equal(bytes.subarray(0, 7).toString(), 'BUSOPS1');
  assert.ok(!bytes.includes(Buffer.from('admin@albaturist.dk')));
  const restored = maintenance.decryptDatabaseSnapshot(bytes);
  assert.equal(restored.users[0].role, 'admin');
});

test.after(() => fs.rmSync(root, { recursive:true, force:true }));
