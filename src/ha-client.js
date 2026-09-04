const DEFAULT_TIMEOUT_MS = 10_000;
const LOGIN_EVENT = 'ha_auto_login_guest_logged_in';

export class HaClient {
  constructor(baseUrl, accessToken, {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async postLoginEvent(ip) {
    if (!this.accessToken) {
      return false;
    }

    const eventUrl = `${this.baseUrl}/api/events/${LOGIN_EVENT}`;
    let response;
    try {
      response = await this.fetch(eventUrl, {
        body: JSON.stringify({ ip }),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`Unable to post the Home Assistant login event: ${error.message}`, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`Home Assistant returned HTTP ${response.status} for the login event`);
    }

    return true;
  }
}
