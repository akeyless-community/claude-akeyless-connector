import { buildAuthUrl, exchangeAuthCode, startCallbackServer } from './browser-auth';

describe('buildAuthUrl', () => {
  it('builds a gateway SAML login URL with localhost callback', () => {
    const url = buildAuthUrl(
      'https://gw.example.com:8000',
      'saml',
      'p-abc123',
      'http://127.0.0.1:11136',
    );

    expect(url).toBe(
      'https://gw.example.com:8000/api/saml-login?access_id=p-abc123&redirect_uri=http%3A%2F%2F127.0.0.1%3A11136&is_use_short_token=true&response_mode=auth_code&product=ara',
    );
  });

  it('builds a gateway OIDC login URL', () => {
    const url = buildAuthUrl(
      'https://gw.example.com:8000/',
      'oidc',
      'p-abc123',
      'http://127.0.0.1:11137',
    );

    expect(url).toContain('/api/oidc-login');
    expect(url).toContain('access_id=p-abc123');
    expect(url).toContain('response_mode=auth_code');
    expect(url).toContain('product=ara');
  });
});

describe('exchangeAuthCode', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('posts the code to the gateway and converts expires_at seconds to ms', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 't-short', expires_at: 1_900_000_000 }), { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeAuthCode('https://gw.example.com:8000/', 'code-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gw.example.com:8000/api/exchange-auth-code',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ auth_code: 'code-1' }) }),
    );
    expect(result).toEqual({ token: 't-short', expiration: '1900000000000' });
  });

  it('fails on a rejected code', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 401 })) as unknown as typeof fetch;

    await expect(exchangeAuthCode('https://gw.example.com:8000', 'bad')).rejects.toThrow(
      'Auth code exchange failed (401)',
    );
  });
});

describe('startCallbackServer', () => {
  const port = 31_137;

  it('accepts a legacy creds callback larger than the Node 16 KB header default', async () => {
    const callback = startCallbackServer(port, 'https://gw.example.com:8000');
    try {
      const creds = JSON.stringify({ token: 't-big', creds: { blob: 'x'.repeat(40 * 1024) } });
      const response = await fetch(`${callback.redirectUri}/?creds=${encodeURIComponent(creds)}`);

      expect(response.status).toBe(200);
      await expect(callback.waitForAuth).resolves.toMatchObject({ token: 't-big' });
    } finally {
      callback.close();
    }
  });

  it('exchanges an auth_code callback through the gateway', async () => {
    const realFetch = global.fetch;
    const exchange = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 't-code', expires_at: 1_900_000_000 }), { status: 200 }),
    );
    global.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('/api/exchange-auth-code') ? exchange(input, init) : realFetch(input, init)) as typeof fetch;

    const callback = startCallbackServer(port + 1, 'https://gw.example.com:8000');
    try {
      const response = await realFetch(`${callback.redirectUri}/?auth_code=code-1`);

      expect(response.status).toBe(200);
      await expect(callback.waitForAuth).resolves.toEqual({ token: 't-code', expiration: '1900000000000' });
      expect(exchange).toHaveBeenCalledTimes(1);
    } finally {
      callback.close();
      global.fetch = realFetch;
    }
  });
});
