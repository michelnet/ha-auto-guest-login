import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthClient } from '../src/auth-client.js';

test('creates an HA redirect and safely serializes credentials', async () => {
  const requests = [];
  const responses = [
    { flow_id: 'flow/id' },
    { result: 'one-time code' },
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new AuthClient('guest"name', 'pass"word', { fetchImpl });

  const result = await client.getRedirectUri(
    'http://home-assistant:8123',
    'https://ha.example.test',
    'lovelace/guest',
  );

  assert.equal(requests[0].url, 'http://home-assistant:8123/auth/login_flow');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    client_id: 'https://ha.example.test/',
    handler: ['homeassistant', null],
    redirect_uri: 'https://ha.example.test?auth_callback=1',
  });
  assert.equal(requests[1].url, 'http://home-assistant:8123/auth/login_flow/flow%2Fid');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    username: 'guest"name',
    password: 'pass"word',
    client_id: 'https://ha.example.test/',
  });

  const redirect = new URL(result);
  assert.equal(redirect.origin, 'https://ha.example.test');
  assert.equal(redirect.pathname, '/lovelace/guest');
  assert.equal(redirect.searchParams.get('code'), 'one-time code');
  assert.equal(redirect.searchParams.get('storeToken'), 'true');
  const state = JSON.parse(Buffer.from(redirect.searchParams.get('state'), 'base64').toString());
  assert.deepEqual(state, {
    hassUrl: 'https://ha.example.test',
    clientId: 'https://ha.example.test/',
  });
});

test('throws a clear error for rejected credentials', async () => {
  const responses = [{ flow_id: 'flow' }, { errors: [{ message: 'invalid_auth' }] }];
  const fetchImpl = async () => new Response(JSON.stringify(responses.shift()), { status: 200 });
  const client = new AuthClient('guest', 'wrong', { fetchImpl });

  await assert.rejects(
    client.getRedirectUri('http://ha:8123', 'http://ha:8123', 'lovelace/guest'),
    /rejected the guest credentials/,
  );
});
