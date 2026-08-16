const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Produktionsserveren stoppede med kode ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return response;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Produktionsserveren blev ikke klar');
}

test('production mode enforces secure startup, origin checks and persistent sessions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'busops-production-'));
  const dbFile = path.join(root, 'db.json');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_FILE: dbFile,
      UPLOAD_DIR: path.join(root, 'uploads'),
      INITIAL_ADMIN_EMAIL: 'production@example.com',
      INITIAL_ADMIN_PASSWORD: 'meget-lang-test-adgangskode'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const health = await waitForHealth(baseUrl, child);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.storage, 'json');
    assert.match(health.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    assert.match(health.headers.get('strict-transport-security') || '', /max-age=31536000/);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

    const blocked = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'production@example.com', password: 'meget-lang-test-adgangskode' })
    });
    assert.equal(blocked.status, 403);

    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'production@example.com', password: 'meget-lang-test-adgangskode' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie') || '';
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    assert.doesNotMatch(cookie, /Max-Age=/);

    const stored = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    assert.equal(stored.users.length, 1);
    assert.equal(stored.users[0].role, 'admin');
    assert.equal(stored.sessions.length, 1);
    assert.ok(stored.sessions[0].expiresAt > Date.now());
    assert.match(stored.sessions[0].ip, /\.x$|::$|ukendt/);
    assert.ok(stored.sessions[0].userAgent);

    const operations = await fetch(`${baseUrl}/api/admin/operations`, { headers:{ Cookie:cookie.split(';')[0] } });
    assert.equal(operations.status, 200);
    const operationsBody = await operations.json();
    assert.equal(operationsBody.health.database, 'json');
    assert.equal(operationsBody.security.activeSessions.length, 1);
    assert.equal(operationsBody.security.activeSessions[0].current, true);
    assert.equal(operationsBody.security.activeSessions[0].key.length, 16);
    assert.equal('id' in operationsBody.security.activeSessions[0], false);

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Origin: baseUrl, Cookie: cookie.split(';')[0] }
    });
    assert.equal(logout.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(dbFile, 'utf8')).sessions.length, 0);

    const rememberedLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'production@example.com', password: 'meget-lang-test-adgangskode', rememberMe: true })
    });
    assert.equal(rememberedLogin.status, 200);
    assert.match(rememberedLogin.headers.get('set-cookie') || '', /Max-Age=2592000/);
    const rememberedCookie=(rememberedLogin.headers.get('set-cookie')||'').split(';')[0];
    await fetch(`${baseUrl}/api/logout`, { method:'POST',headers:{Origin:baseUrl,Cookie:rememberedCookie} });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wrong = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: 'production@example.com', password: `forkert-${attempt}` })
      });
      assert.equal(wrong.status, 401);
    }
    const limited = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'production@example.com', password: 'stadig-forkert' })
    });
    assert.equal(limited.status, 429);
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the client clears protected trip data when a session expires', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /function showExpiredSession\(/);
  assert.match(app, /\$\('#view'\)\.replaceChildren\(\)/);
  assert.match(app, /Object\.assign\(state,\{user:null,trips:\[\],stops:\[\],drivers:\[\],salesManagers:\[\],buses:\[\],trip:null/);
  assert.match(app, /r\.status===401&&url!==['"]\/api\/login['"]/);
  assert.match(app, /if\(element\.textContent===msg\)element\.textContent=''/);
});

test('Render deploys every commit pushed to the production branch', () => {
  const blueprint = fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8');
  assert.match(blueprint, /autoDeployTrigger:\s*commit/);
  assert.doesNotMatch(blueprint, /autoDeployTrigger:\s*checksPass/);
});
