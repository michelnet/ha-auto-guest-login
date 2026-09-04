const DEFAULT_TIMEOUT_MS = 10_000;

export class AuthClient {
  constructor(username, password, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.username = username;
    this.password = password;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async getRedirectUri(internalUrl, publicUrl, dashboard) {
    const clientId = `${publicUrl}/`;
    const code = await this.#getCode(internalUrl, publicUrl, clientId);
    return this.#createRedirectUri(publicUrl, code, clientId, dashboard);
  }

  async #getCode(internalUrl, publicUrl, clientId) {
    const flowId = await this.#getFlowId(internalUrl, publicUrl, clientId);
    const body = await this.#postJson(`${internalUrl}/auth/login_flow/${encodeURIComponent(flowId)}`, {
      username: this.username,
      password: this.password,
      client_id: clientId,
    });

    if (body.errors || !body.result) {
      throw new Error('Home Assistant rejected the guest credentials');
    }
    return body.result;
  }

  async #getFlowId(internalUrl, publicUrl, clientId) {
    const body = await this.#postJson(`${internalUrl}/auth/login_flow`, {
      client_id: clientId,
      handler: ['homeassistant', null],
      redirect_uri: `${publicUrl}?auth_callback=1`,
    });

    if (!body.flow_id) {
      throw new Error('Home Assistant did not return a login flow ID');
    }
    return body.flow_id;
  }

  async #postJson(url, body) {
    let response;
    try {
      response = await this.fetch(url, {
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`Unable to reach Home Assistant: ${error.message}`, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Home Assistant returned HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error('Home Assistant returned an invalid JSON response', { cause: error });
    }
  }

  #createRedirectUri(publicUrl, code, clientId, dashboard) {
    const uri = new URL(`${publicUrl}/${dashboard}`);
    uri.searchParams.set('auth_callback', '1');
    uri.searchParams.set('code', code);
    uri.searchParams.set('state', this.#getState(publicUrl, clientId));
    uri.searchParams.set('storeToken', 'true');
    return uri.toString();
  }

  #getState(haUrl, clientId) {
    return Buffer.from(JSON.stringify({ hassUrl: haUrl, clientId })).toString('base64');
  }
}
