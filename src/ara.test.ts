import {
  buildAraListItemsBody,
  buildDiagnosticListItemsBody,
  isAraDbProducerType,
  isAraServiceProducerType,
  isAraSupportedProducerType,
  mapAraSecrets,
  buildGatewayAuthHeader,
} from './ara';

describe('ara producer types', () => {
  it('identifies database producers', () => {
    expect(isAraDbProducerType('postgres')).toBe(true);
    expect(isAraDbProducerType('aws')).toBe(false);
  });

  it('identifies service producers', () => {
    expect(isAraServiceProducerType('aws')).toBe(true);
    expect(isAraServiceProducerType('mysql')).toBe(false);
  });

  it('combines supported producers', () => {
    expect(isAraSupportedProducerType('github')).toBe(true);
    expect(isAraSupportedProducerType('vault')).toBe(false);
  });
});

describe('buildAraListItemsBody', () => {
  it('sets ara-only like mcp-runtime-authority', () => {
    expect(buildAraListItemsBody('t-test')).toEqual({
      token: 't-test',
      filter: '',
      type: ['dynamic-secret', 'rotated-secret'],
      'ara-only': true,
      'advanced-filter': '',
    });
  });

  it('omits path by default to match CLI global ARA listing', () => {
    expect(buildAraListItemsBody('t-test')).not.toHaveProperty('path');
  });

  it('includes path only when explicitly requested', () => {
    expect(buildAraListItemsBody('t-test', { path: '/prod/db' }).path).toBe('/prod/db');
  });

  it('builds diagnostic body without ARA filter', () => {
    expect(buildDiagnosticListItemsBody('t-test')['ara-only']).toBe(false);
  });
});

describe('mapAraSecrets', () => {
  it('filters to ARA-enabled supported secrets', () => {
    const secrets = mapAraSecrets([
      {
        item_name: '/db/postgres-ds',
        item_type: 'dynamic-secret',
        item_metadata: 'prod db',
        client_permissions: ['ara_allow_access'],
        item_general_info: {
          dynamic_secret_producer_details: { producer_type: 'postgres' },
        },
      },
      {
        item_name: '/db/no-ara',
        item_type: 'dynamic-secret',
        client_permissions: ['read'],
        item_general_info: {
          dynamic_secret_producer_details: { producer_type: 'postgres' },
        },
      },
      {
        item_name: '/cloud/aws-ds',
        item_type: 'dynamic-secret',
        client_permissions: ['ara_allow_access'],
        item_general_info: {
          dynamic_secret_producer_details: { producer_type: 'aws' },
        },
      },
    ]);

    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.name)).toEqual(['/cloud/aws-ds', '/db/postgres-ds']);
    expect(secrets[1]?.target_type).toBe('postgres');
  });

  it('accepts uppercase API item types such as DYNAMIC_SECRET', () => {
    const secrets = mapAraSecrets([
      {
        item_name: '/db/mysql-ds',
        item_type: 'DYNAMIC_SECRET',
        client_permissions: ['ara_allow_access'],
        item_general_info: {
          dynamic_secret_producer_details: { producer_type: 'mysql' },
        },
      },
    ]);

    expect(secrets).toHaveLength(1);
    expect(secrets[0]?.name).toBe('/db/mysql-ds');
    expect(secrets[0]?.target_type).toBe('mysql');
  });
});

describe('buildGatewayAuthHeader', () => {
  it('prefers base64-encoded creds like the CLI', () => {
    const header = buildGatewayAuthHeader({
      token: 't-abc123',
      creds: { token: 'legacy', expiry: 123 },
    });
    expect(header.Authorization?.startsWith('Bearer ')).toBe(true);
    const encoded = header.Authorization!.slice('Bearer '.length);
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    expect(decoded.token).toBe('legacy');
  });

  it('falls back to bearer token when creds are unavailable', () => {
    expect(buildGatewayAuthHeader({ token: 't-abc123' })).toEqual({
      Authorization: 'Bearer t-abc123',
    });
  });
});
