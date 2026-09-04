import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { AuthClient } from './auth-client.js';
import { loadConfig } from './config.js';
import { HaClient } from './ha-client.js';
import { Utils } from './utils.js';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

export function createApp({ config, authClient, haClient, utils }) {
  const app = express();
  app.disable('x-powered-by');
  app.enable('strict routing');
  app.set('view engine', 'ejs');
  app.set('views', join(sourceDirectory, 'views'));
  app.set('trust proxy', config.trustProxy);

  app.get('/healthz', (_request, response) => {
    response.set('cache-control', 'no-store').json({ status: 'ok' });
  });

  app.get('/', async (request, response) => {
    try {
      await haClient.postLoginEvent(request.ip);
    } catch (error) {
      console.error(`Unable to emit the optional Home Assistant login event: ${error.message}`);
    }

    response
      .set('cache-control', 'no-store')
      .render('pages/guest-welcome', {
        delay: config.welcomeScreenDelay,
        mainText: config.welcomeScreenMainText,
        secondaryText: config.welcomeScreenSecondaryText,
      });
  });

  app.get('/admin', (_request, response) => response.redirect(308, 'admin/'));
  app.use('/admin/assets', express.static(join(sourceDirectory, 'assets'), {
    fallthrough: false,
    index: false,
  }));

  app.get('/admin/', (request, response) => {
    response
      .set('cache-control', 'no-store')
      .render('pages/admin', { guestLoginUrl: utils.getGuestLoginUrl(request) });
  });

  app.get('/admin/qr.svg', async (request, response) => {
    const qrCode = await QRCode.toString(utils.getGuestLoginUrl(request), { type: 'svg' });
    response.set('cache-control', 'no-store').type('image/svg+xml').send(qrCode);
  });

  app.post('/api/redirect-uri', async (_request, response) => {
    response.set('cache-control', 'no-store');
    try {
      const redirectUri = await authClient.getRedirectUri(
        config.haInternalUrl,
        config.haPublicUrl ?? config.haInternalUrl,
        config.guestDashboardPath,
      );
      response.type('text/plain').send(redirectUri);
    } catch (error) {
      console.error(`Unable to create a Home Assistant login: ${error.message}`);
      response.status(502).type('text/plain').send('Unable to create Home Assistant login');
    }
  });

  return app;
}

export async function startServer({ config = loadConfig(), fetchImpl = globalThis.fetch } = {}) {
  const authClient = new AuthClient(config.guestUsername, config.guestPassword, { fetchImpl });
  const haClient = new HaClient(config.haInternalUrl, config.haToken, { fetchImpl });
  const utils = new Utils({ appPublicUrl: config.appPublicUrl });
  const app = createApp({ config, authClient, haClient, utils });

  const server = await new Promise((resolveServer, reject) => {
    const instance = app.listen(config.port, config.host, () => {
      instance.off('error', reject);
      resolveServer(instance);
    });
    instance.once('error', reject);
  });

  console.log(`HA Auto Guest Login is listening on http://${config.host}:${config.port}`);
  console.log(`Home Assistant API endpoint: ${config.haInternalUrl}`);
  if (!config.haToken) {
    console.log('Login events are disabled because HA_TOKEN is not configured');
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close((error) => {
        if (error) {
          console.error(`Unable to stop the HTTP server cleanly: ${error.message}`);
          process.exitCode = 1;
        }
      });
    });
  }

  return server;
}

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
