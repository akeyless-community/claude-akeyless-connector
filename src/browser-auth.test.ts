import { buildAuthUrl } from './browser-auth';

describe('buildAuthUrl', () => {
  it('builds a gateway SAML login URL with localhost callback', () => {
    const url = buildAuthUrl(
      'https://gw.example.com:8000',
      'saml',
      'p-abc123',
      'http://127.0.0.1:11136',
    );

    expect(url).toBe(
      'https://gw.example.com:8000/api/saml-login?access_id=p-abc123&redirect_uri=http%3A%2F%2F127.0.0.1%3A11136&is_use_short_token=true',
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
  });
});
