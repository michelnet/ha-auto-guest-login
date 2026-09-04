import fs from 'node:fs';

const DEFAULT_DASHBOARD_PATH = 'lovelace/default_view';
const DEFAULT_PORT = 8080;
const DEFAULT_WELCOME_DELAY_MS = 3000;
const MAX_WELCOME_DELAY_MS = 300_000;

const ENVIRONMENT_NAMES = Object.freeze({
  appPublicUrl: ['APP_PUBLIC_URL', 'PUBLIC_URL'],
  guestDashboardPath: ['GUEST_DASHBOARD_PATH'],
  guestPassword: ['GUEST_PASSWORD'],
  guestPasswordFile: ['GUEST_PASSWORD_FILE'],
  guestUsername: ['GUEST_USERNAME'],
  haInternalUrl: ['HA_INTERNAL_URL', 'HOME_ASSISTANT_URL'],
  haPublicUrl: ['HA_PUBLIC_URL', 'HOME_ASSISTANT_REDIRECT_URL'],
  haToken: ['HA_TOKEN', 'HOME_ASSISTANT_TOKEN'],
  haTokenFile: ['HA_TOKEN_FILE', 'HOME_ASSISTANT_TOKEN_FILE'],
});

function firstEnvironmentValue(environment, names) {
  for (const name of names) {
    if (Object.hasOwn(environment, name) && environment[name] !== undefined) {
      return environment[name];
    }
  }
  return undefined;
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readSecret({ directName, directValue, fileName, filePath, fileSystem, errors }) {
  const secret = directValue === undefined || directValue === null
    ? undefined
    : String(directValue).replace(/[\r\n]+$/, '');
  const normalizedPath = optionalString(filePath);

  if (secret !== undefined && normalizedPath !== undefined) {
    errors.push(`${directName} and ${fileName} cannot both be set`);
    return undefined;
  }

  if (normalizedPath === undefined) {
    return secret === '' ? undefined : secret;
  }

  try {
    const fileSecret = fileSystem.readFileSync(normalizedPath, 'utf8').replace(/[\r\n]+$/, '');
    return fileSecret === '' ? undefined : fileSecret;
  } catch (error) {
    errors.push(`${fileName} could not be read: ${error.message}`);
    return undefined;
  }
}

function parseInteger(value, name, defaultValue, errors, { minimum, maximum }) {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    return defaultValue;
  }

  if (!/^-?\d+$/.test(normalized)) {
    errors.push(`${name} must be an integer`);
    return defaultValue;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    errors.push(`${name} must be between ${minimum} and ${maximum}`);
    return defaultValue;
  }

  return parsed;
}

function parseBoolean(value, name, defaultValue, errors) {
  const normalized = optionalString(value)?.toLowerCase();
  if (normalized === undefined) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  errors.push(`${name} must be true or false`);
  return defaultValue;
}

function normalizeBaseUrl(value, name, errors, { rootOnly = false } = {}) {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    errors.push(`${name} must be a valid http:// or https:// URL`);
    return undefined;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    errors.push(`${name} must be a valid http:// or https:// URL`);
    return undefined;
  }
  if (url.username || url.password) {
    errors.push(`${name} must not contain credentials`);
  }
  if (url.search || url.hash) {
    errors.push(`${name} must not contain a query string or fragment`);
  }
  if (rootOnly && url.pathname !== '/') {
    errors.push(`${name} must not contain a path`);
  }

  const path = rootOnly ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

function parseDashboardPath(value, errors) {
  const dashboardPath = optionalString(value) ?? DEFAULT_DASHBOARD_PATH;
  const segments = dashboardPath.split('/');
  const hasInvalidSegment = segments.some((segment) => (
    segment.length === 0
    || segment === '.'
    || segment === '..'
    || !/^[A-Za-z0-9._~-]+$/.test(segment)
  ));

  if (dashboardPath.startsWith('/') || hasInvalidSegment) {
    errors.push('GUEST_DASHBOARD_PATH must be a relative path without query strings or fragments');
  }

  return dashboardPath;
}

export function loadConfig({ env = process.env, fileSystem = fs } = {}) {
  const errors = [];
  const value = (key) => firstEnvironmentValue(env, ENVIRONMENT_NAMES[key]);

  const guestUsername = optionalString(value('guestUsername'));
  const guestPassword = readSecret({
    directName: 'GUEST_PASSWORD',
    directValue: value('guestPassword'),
    fileName: 'GUEST_PASSWORD_FILE',
    filePath: value('guestPasswordFile'),
    fileSystem,
    errors,
  });
  const haToken = readSecret({
    directName: 'HA_TOKEN',
    directValue: value('haToken'),
    fileName: 'HA_TOKEN_FILE',
    filePath: value('haTokenFile'),
    fileSystem,
    errors,
  });

  const haInternalUrl = normalizeBaseUrl(value('haInternalUrl'), 'HA_INTERNAL_URL', errors);
  const haPublicUrl = normalizeBaseUrl(value('haPublicUrl'), 'HA_PUBLIC_URL', errors);
  const appPublicUrl = normalizeBaseUrl(value('appPublicUrl'), 'APP_PUBLIC_URL', errors, {
    rootOnly: true,
  });
  const guestDashboardPath = parseDashboardPath(value('guestDashboardPath'), errors);
  const port = parseInteger(env.PORT, 'PORT', DEFAULT_PORT, errors, {
    minimum: 1,
    maximum: 65_535,
  });
  const welcomeScreenDelay = parseInteger(
    env.WELCOME_SCREEN_DELAY_MS,
    'WELCOME_SCREEN_DELAY_MS',
    DEFAULT_WELCOME_DELAY_MS,
    errors,
    { minimum: 0, maximum: MAX_WELCOME_DELAY_MS },
  );
  const trustProxy = parseBoolean(env.TRUST_PROXY, 'TRUST_PROXY', false, errors);

  if (guestUsername === undefined) {
    errors.push('GUEST_USERNAME is required');
  }
  if (guestPassword === undefined) {
    errors.push('GUEST_PASSWORD is required (directly or through GUEST_PASSWORD_FILE)');
  }
  if (haInternalUrl === undefined) {
    errors.push('HA_INTERNAL_URL is required');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return Object.freeze({
    appPublicUrl,
    guestDashboardPath,
    guestPassword,
    guestUsername,
    haInternalUrl,
    haPublicUrl,
    haToken,
    host: '0.0.0.0',
    port,
    trustProxy,
    welcomeScreenDelay,
    welcomeScreenMainText: optionalString(env.WELCOME_SCREEN_MAIN_TEXT) ?? 'Thanks for Visiting',
    welcomeScreenSecondaryText: optionalString(env.WELCOME_SCREEN_SECONDARY_TEXT)
      ?? 'Redirecting to Home Assistant...',
  });
}
