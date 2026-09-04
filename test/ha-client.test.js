import assert from 'node:assert/strict';
import test from 'node:test';
import { HaClient } from '../src/ha-client.js';
import { Utils } from '../src/utils.js';

test('posts login events directly to Home Assistant when a token is configured', async () => {
  let request;
  const client = new HaClient('http://home-assistant:8123/', 'ha-token', {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response('{}', { status: 200 });
    },
  });

  assert.equal(await client.postLoginEvent('192.0.2.10'), true);
  assert.equal(request.url, 'http://home-assistant:8123/api/events/ha_auto_login_guest_logged_in');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer ha-token');
  assert.deepEqual(JSON.parse(request.options.body), { ip: '192.0.2.10' });
});

test('does not contact Home Assistant when event authorization is absent', async () => {
  const client = new HaClient('http://home-assistant:8123', undefined, {
    fetchImpl: async () => { throw new Error('fetch must not run'); },
  });

  assert.equal(await client.postLoginEvent('192.0.2.10'), false);
});

test('reports Home Assistant event API failures', async () => {
  const client = new HaClient('http://home-assistant:8123', 'ha-token', {
    fetchImpl: async () => new Response('unauthorized', { status: 401 }),
  });

  await assert.rejects(
    client.postLoginEvent('192.0.2.10'),
    /401/,
  );
});

test('builds request URLs from proxy-aware host and protocol values', () => {
  const utils = new Utils();
  const request = { protocol: 'https', host: 'guest-login.example.test:9443' };

  assert.equal(utils.getGuestLoginUrl(request), 'https://guest-login.example.test:9443');
});

test('prefers the configured public application URL over request headers', () => {
  const utils = new Utils({ appPublicUrl: 'https://guest-login.example.test/base/' });
  const request = { protocol: 'http', host: 'untrusted.example.test' };

  assert.equal(utils.getGuestLoginUrl(request), 'https://guest-login.example.test/base');
});
