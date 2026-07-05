import {
  buildAraListItemsBody,
  buildDiagnosticListItemsBody,
  CUSTOM_MCP_TARGET_TYPE,
  isAraDbProducerType,
  isAraServiceProducerType,
  isAraSupportedProducerType,
  mapAraSecrets,
  buildGatewayAuthHeader,
  OAuthAuthorizationRequiredError,
  postListSubTools,
  postTargetQuery,
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

  it('treats custom-MCP secrets as service producers', () => {
    expect(isAraServiceProducerType(CUSTOM_MCP_TARGET_TYPE)).toBe(true);
  });

  it('combines supported producers', () => {
    expect(isAraSupportedProducerType('github')).toBe(true);
    expect(isAraSupportedProducerType('vault')).toBe(false);
  });
});

describe('buildAraListItemsBody', () => {
  it('sets ara-only like mcp-runtime-authority, including static (custom-MCP) secrets', () => {
    expect(buildAraListItemsBody('t-test')).toEqual({
      token: 't-test',
      filter: '',
      type: ['dynamic-secret', 'rotated-secret', 'static-secret'],
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

  it('includes static (custom-MCP) secrets unconditionally, unlike producer-typed secrets', () => {
    const secrets = mapAraSecrets([
      {
        item_name: '/mcp/custom-tool',
        item_type: 'static-secret',
        item_metadata: 'custom MCP server',
        client_permissions: ['ara_allow_access'],
      },
      {
        item_name: '/mcp/no-ara',
        item_type: 'static-secret',
        client_permissions: ['read'],
      },
    ]);

    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toEqual({
      name: '/mcp/custom-tool',
      secret_type: 'static-secret',
      target_type: CUSTOM_MCP_TARGET_TYPE,
      description: 'custom MCP server',
    });
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

function mockFetchResponse(status: number, body: unknown): void {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('postTargetQuery OAuth handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws OAuthAuthorizationRequiredError on a 401 with authorization_url + state', async () => {
    mockFetchResponse(401, {
      target_type: '',
      results: null,
      authorization_url: 'https://auth.example.com/authorize?state=abc',
      state: 'abc',
    });

    const call = postTargetQuery('https://gw:8000', { Authorization: 'Bearer t-x' }, {
      secret_name: '/aws/oauth-ds',
      payload: 'list buckets',
      agent_id: 'claude-desktop',
      mcp_id: 'mcp-1',
    });

    await expect(call).rejects.toBeInstanceOf(OAuthAuthorizationRequiredError);
    await expect(call).rejects.toMatchObject({
      authorizationUrl: 'https://auth.example.com/authorize?state=abc',
      state: 'abc',
    });
  });

  it('throws a plain Error for a 401 without an OAuth challenge body', async () => {
    mockFetchResponse(401, { error: 'invalid credentials' });

    const call = postTargetQuery('https://gw:8000', { Authorization: 'Bearer t-x' }, {
      secret_name: '/aws/ds',
      payload: 'list buckets',
      agent_id: 'claude-desktop',
      mcp_id: 'mcp-1',
    });

    await expect(call).rejects.not.toBeInstanceOf(OAuthAuthorizationRequiredError);
    await expect(call).rejects.toThrow('invalid credentials');
  });

  it('sends original_user/original_prompt when provided', async () => {
    mockFetchResponse(200, { target_type: 'mysql', results: [] });

    await postTargetQuery('https://gw:8000', { Authorization: 'Bearer t-x' }, {
      secret_name: '/db/mysql-ds',
      payload: 'SELECT 1',
      agent_id: 'claude-desktop',
      mcp_id: 'mcp-1',
      original_user: 'alice',
      original_prompt: 'how many users are there?',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.original_user).toBe('alice');
    expect(sentBody.original_prompt).toBe('how many users are there?');
  });
});

describe('postListSubTools', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to /config/list_sub_tools and returns tools', async () => {
    mockFetchResponse(200, {
      target_type: 'aws',
      tools: [{ name: 's3-list-buckets', description: 'List S3 buckets' }],
    });

    const result = await postListSubTools('https://gw:8000', { Authorization: 'Bearer t-x' }, {
      secret_name: '/aws/devops',
      agent_id: 'claude-desktop',
      mcp_id: 'mcp-1',
    });

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://gw:8000/config/list_sub_tools');
    expect(result.target_type).toBe('aws');
    expect(result.tools).toEqual([{ name: 's3-list-buckets', description: 'List S3 buckets' }]);
  });

  it('throws OAuthAuthorizationRequiredError on a 401 OAuth challenge', async () => {
    mockFetchResponse(401, {
      authorization_url: 'https://auth.example.com/authorize',
      state: 'xyz',
    });

    const call = postListSubTools('https://gw:8000', { Authorization: 'Bearer t-x' }, {
      secret_name: '/aws/devops',
      agent_id: 'claude-desktop',
      mcp_id: 'mcp-1',
    });

    await expect(call).rejects.toBeInstanceOf(OAuthAuthorizationRequiredError);
  });
});
