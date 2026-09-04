import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const missingFileSystem = {
  existsSync: () => false,
  readFileSync: () => {
    throw new Error('unexpected read');
  },
};

const minimumEnvironment = {
  GUEST_USERNAME: 'guest',
  GUEST_PASSWORD: 'secret',
  HA_INTERNAL_URL: 'http://home-assistant:8123/',
};

test('loads standalone configuration from environment variables', () => {
  const config = loadConfig({
    env: {
      ...minimumEnvironment,
      HA_PUBLIC_URL: 'https://ha.example.test/',
      APP_PUBLIC_URL: 'https://guest-login.example.test/',
      HA_TOKEN: 'ha-token',
      PORT: '9080',
      GUEST_DASHBOARD_PATH: 'lovelace/guest',
      WELCOME_SCREEN_DELAY_MS: '1500',
      TRUST_PROXY: 'true',
    },
    fileSystem: missingFileSystem,
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9080);
  assert.equal(config.haInternalUrl, 'http://home-assistant:8123');
  assert.equal(config.haPublicUrl, 'https://ha.example.test');
  assert.equal(config.appPublicUrl, 'https://guest-login.example.test');
  assert.equal(config.haToken, 'ha-token');
  assert.equal(config.guestDashboardPath, 'lovelace/guest');
  assert.equal(config.welcomeScreenDelay, 1500);
  assert.equal(config.trustProxy, true);
});

test('supports Docker secret files while preserving meaningful spaces', () => {
  const fileSystem = {
    readFileSync: (filePath) => {
      const secrets = {
        '/run/secrets/guest-password': ' password with spaces \n',
        '/run/secrets/ha-token': 'ha-token\r\n',
      };
      assert.ok(filePath in secrets);
      return secrets[filePath];
    },
  };
  const config = loadConfig({
    env: {
      GUEST_USERNAME: 'guest',
      GUEST_PASSWORD_FILE: '/run/secrets/guest-password',
      HA_INTERNAL_URL: 'http://home-assistant:8123',
      HA_TOKEN_FILE: '/run/secrets/ha-token',
    },
    fileSystem,
  });

  assert.equal(config.guestPassword, ' password with spaces ');
  assert.equal(config.haToken, 'ha-token');
});

test('reports missing and invalid standalone values together', () => {
  assert.throws(
    () => loadConfig({
      env: {
        PORT: 'not-a-port',
        GUEST_DASHBOARD_PATH: '../admin?bad=true',
      },
      fileSystem: missingFileSystem,
    }),
    (error) => {
      assert.match(error.message, /GUEST_USERNAME is required/);
      assert.match(error.message, /GUEST_PASSWORD is required/);
      assert.match(error.message, /HA_INTERNAL_URL is required/);
      assert.match(error.message, /PORT must be an integer/);
      assert.match(error.message, /GUEST_DASHBOARD_PATH must be a relative path/);
      return true;
    },
  );
});

test('rejects ambiguous direct and file-based secrets', () => {
  assert.throws(
    () => loadConfig({
      env: {
        ...minimumEnvironment,
        GUEST_PASSWORD_FILE: '/run/secrets/guest-password',
      },
      fileSystem: missingFileSystem,
    }),
    /GUEST_PASSWORD and GUEST_PASSWORD_FILE cannot both be set/,
  );
});

test('accepts generic standalone aliases', () => {
  const config = loadConfig({
    env: {
      GUEST_USERNAME: 'guest',
      GUEST_PASSWORD: 'secret',
      HOME_ASSISTANT_URL: 'http://ha.local:8123/',
      HOME_ASSISTANT_REDIRECT_URL: 'https://ha.example.test/',
      HOME_ASSISTANT_TOKEN: 'ha-token',
      PUBLIC_URL: 'https://login.example.test/',
    },
    fileSystem: missingFileSystem,
  });

  assert.equal(config.haInternalUrl, 'http://ha.local:8123');
  assert.equal(config.haPublicUrl, 'https://ha.example.test');
  assert.equal(config.haToken, 'ha-token');
  assert.equal(config.appPublicUrl, 'https://login.example.test');
});
