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

    const stored = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    assert.equal(stored.users.length, 1);
    assert.equal(stored.users[0].role, 'admin');
    assert.equal(stored.sessions.length, 1);
    assert.ok(stored.sessions[0].expiresAt > Date.now());

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Origin: baseUrl, Cookie: cookie.split(';')[0] }
    });
    assert.equal(logout.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(dbFile, 'utf8')).sessions.length, 0);

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
