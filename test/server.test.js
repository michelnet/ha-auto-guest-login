import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/server.js';
import { Utils } from '../src/utils.js';

test('serves health, admin and redirect endpoints in standalone mode', async (t) => {
  const config = {
    trustProxy: false,
    welcomeScreenDelay: 0,
    welcomeScreenMainText: 'Welcome',
    welcomeScreenSecondaryText: 'Redirecting',
    haInternalUrl: 'http://home-assistant:8123',
    haPublicUrl: 'https://ha.example.test',
    guestDashboardPath: 'lovelace/guest',
  };
  const authCalls = [];
  const app = createApp({
    config,
    authClient: {
      getRedirectUri: async (...args) => {
        authCalls.push(args);
        return 'https://ha.example.test/lovelace/guest?code=test';
      },
    },
    haClient: { postLoginEvent: async () => false },
    utils: new Utils({ appPublicUrl: 'http://guest-login.example.test:8675' }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const port = server.address().port;

  const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok' });

  const adminRedirect = await fetch(`http://127.0.0.1:${port}/admin`, { redirect: 'manual' });
  assert.equal(adminRedirect.status, 308);
  assert.equal(adminRedirect.headers.get('location'), 'admin/');

  const adminResponse = await fetch(`http://127.0.0.1:${port}/admin/`);
  assert.equal(adminResponse.status, 200);
  const adminHtml = await adminResponse.text();
  assert.match(adminHtml, /http:\/\/guest-login\.example\.test:8675/);
  assert.match(adminHtml, /src="assets\/logo\.png"/);
  assert.match(adminHtml, /href="qr\.svg"/);
  assert.doesNotMatch(adminHtml, /href="\/admin\/qr\.svg"/);

  const logoResponse = await fetch(`http://127.0.0.1:${port}/admin/assets/logo.png`);
  assert.equal(logoResponse.status, 200);
  assert.match(logoResponse.headers.get('content-type'), /^image\/png/);

  const qrResponse = await fetch(`http://127.0.0.1:${port}/admin/qr.svg`);
  assert.equal(qrResponse.status, 200);
  assert.match(qrResponse.headers.get('content-type'), /^image\/svg\+xml/);

  const redirectResponse = await fetch(`http://127.0.0.1:${port}/api/redirect-uri`, {
    method: 'POST',
  });
  assert.equal(redirectResponse.status, 200);
  assert.equal(redirectResponse.headers.get('cache-control'), 'no-store');
  assert.equal(await redirectResponse.text(), 'https://ha.example.test/lovelace/guest?code=test');
  assert.deepEqual(authCalls, [[
    'http://home-assistant:8123',
    'https://ha.example.test',
    'lovelace/guest',
  ]]);
});

test('uses the internal HA URL as browser URL when no public URL is set', async (t) => {
  const authCalls = [];
  const app = createApp({
    config: {
      trustProxy: false,
      haInternalUrl: 'http://home-assistant:8123',
      haPublicUrl: undefined,
      guestDashboardPath: 'lovelace/guest',
    },
    authClient: {
      getRedirectUri: async (...args) => {
        authCalls.push(args);
        return 'http://home-assistant:8123/lovelace/guest?code=test';
      },
    },
    haClient: { postLoginEvent: async () => true },
    utils: new Utils(),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/redirect-uri`, {
    method: 'POST',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(authCalls, [[
    'http://home-assistant:8123',
    'http://home-assistant:8123',
    'lovelace/guest',
  ]]);
});

test('returns a cache-safe 502 when Home Assistant authentication fails', async (t) => {
  const app = createApp({
    config: {
      trustProxy: false,
      haInternalUrl: 'http://home-assistant:8123',
      guestDashboardPath: 'lovelace/guest',
    },
    authClient: { getRedirectUri: async () => { throw new Error('connection refused'); } },
    haClient: { postLoginEvent: async () => false },
    utils: new Utils(),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/redirect-uri`, {
    method: 'POST',
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
