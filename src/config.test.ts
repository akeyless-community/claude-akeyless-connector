import {
  configFromEnv,
  parseAraGatewayUrl,
  parseGatewayUrls,
  parseSdkGatewayUrl,
  validateConfig,
} from './config';

describe('parseAraGatewayUrl', () => {
  it('returns the config port URL as-is', () => {
    expect(parseAraGatewayUrl('https://gw.example.com:8000')).toBe(
      'https://gw.example.com:8000',
    );
  });

  it('strips a /api/v2 suffix', () => {
    expect(parseAraGatewayUrl('https://gw.example.com:8000/api/v2/')).toBe(
      'https://gw.example.com:8000',
    );
  });

  it('rejects empty input', () => {
    expect(() => parseAraGatewayUrl('   ')).toThrow('Gateway URL is required');
  });
});

describe('parseSdkGatewayUrl', () => {
  it('appends /api/v2 when missing', () => {
    expect(parseSdkGatewayUrl('https://gw.example.com:8000')).toBe(
      'https://gw.example.com:8000/api/v2',
    );
  });

  it('keeps /api/v2 when present', () => {
    expect(parseSdkGatewayUrl('https://gw.example.com:8000/api/v2/')).toBe(
      'https://gw.example.com:8000/api/v2',
    );
  });

  it('rejects empty input', () => {
    expect(() => parseSdkGatewayUrl('   ')).toThrow('Gateway URL is required');
  });
});

describe('configFromEnv gateway parsing', () => {
  it('derives SDK and ARA URLs from a config-port gateway address', () => {
    const config = configFromEnv({
      gatewayInputUrl: 'https://gw.example.com:8000',
      accessId: 'p-test',
      accessKey: 'key',
    });

    expect(config.gatewayUrl).toBe('https://gw.example.com:8000/api/v2');
    expect(config.araGatewayUrl).toBe('https://gw.example.com:8000');
  });

  it('accepts gateway URLs that already include /api/v2', () => {
    const config = configFromEnv({
      gatewayInputUrl: 'https://gw.example.com:8000/api/v2',
      accessId: 'p-test',
      accessKey: 'key',
    });

    expect(config.gatewayUrl).toBe('https://gw.example.com:8000/api/v2');
    expect(config.araGatewayUrl).toBe('https://gw.example.com:8000');
  });

  it('honors an explicit SDK API URL override', () => {
    const config = configFromEnv({
      gatewayInputUrl: 'https://gw.example.com:8000',
      gatewayUrl: 'https://vault.customer.example.com/api/v2',
      accessId: 'p-test',
      accessKey: 'key',
    });

    expect(config.gatewayUrl).toBe('https://vault.customer.example.com/api/v2');
    expect(config.araGatewayUrl).toBe('https://gw.example.com:8000');
  });

  it('normalizes legacy api_key access type to access_key', () => {
    const prev = process.env.AKEYLESS_ACCESS_TYPE;
    process.env.AKEYLESS_ACCESS_TYPE = 'api_key';
    try {
      const config = configFromEnv({
        gatewayInputUrl: 'https://gw.example.com:8000',
        accessId: 'p-test',
        accessKey: 'key',
      });

      expect(config.accessType).toBe('access_key');
    } finally {
      if (prev === undefined) {
        delete process.env.AKEYLESS_ACCESS_TYPE;
      } else {
        process.env.AKEYLESS_ACCESS_TYPE = prev;
      }
    }
  });

  it('allows explicit ARA override for legacy configs', () => {
    const config = configFromEnv({
      gatewayInputUrl: 'https://gw.example.com:8000',
      araGatewayUrl: 'https://legacy-gw.example.com:8000',
      accessId: 'p-test',
      accessKey: 'key',
    });

    expect(config.araGatewayUrl).toBe('https://legacy-gw.example.com:8000');
  });
});

describe('parseGatewayUrls compatibility', () => {
  it('derives both URLs from a single gateway address', () => {
    expect(parseGatewayUrls('https://gw.example.com:8000/api/v2')).toEqual({
      apiUrl: 'https://gw.example.com:8000/api/v2',
      araGatewayUrl: 'https://gw.example.com:8000',
    });
  });
});

describe('validateConfig', () => {
  it('requires a gateway URL', () => {
    expect(() =>
      validateConfig(
        configFromEnv({
          accessId: 'p-test',
          accessKey: 'key',
        }),
      ),
    ).toThrow('Gateway URL is required');
  });
});
