import { OAuthAuthorizationRequiredError } from './ara';
import type { AkeylessClient } from './client';
import { buildToolDefinitions, formatOAuthRequiredMessage, handleToolCall } from './server';

/** Minimal stub matching only the AkeylessClient surface handleToolCall uses. */
function stubClient(overrides: Partial<AkeylessClient> = {}): AkeylessClient {
  const base: Partial<AkeylessClient> = {
    getConfig: () => ({
      gatewayUrl: 'https://gw:8000/api/v2',
      araGatewayUrl: 'https://gw:8000',
      agentId: 'claude-desktop',
      mcpId: 'mcp-1',
      accessType: 'access_key',
      tokenExpiryMarginMs: 1000,
    }),
    listAraSecrets: async () => [],
    listAraSecretsDetailed: async () => ({ secrets: [] }),
    executeTargetQuery: async () => ({ target_type: 'mysql', results: [] }),
    listSubTools: async () => ({ target_type: 'aws', tools: [] }),
    ...overrides,
  };
  return base as AkeylessClient;
}

describe('handleToolCall: service-execute defaultSecretName', () => {
  it('falls back to the configured default secret name, like query-db', async () => {
    const executeTargetQuery = jest.fn().mockResolvedValue({ target_type: 'aws', results: [] });
    const client = stubClient({
      getConfig: () => ({
        gatewayUrl: 'https://gw:8000/api/v2',
        araGatewayUrl: 'https://gw:8000',
        defaultSecretName: '/aws/devops',
        agentId: 'claude-desktop',
        mcpId: 'mcp-1',
        accessType: 'access_key',
        tokenExpiryMarginMs: 1000,
      }),
      executeTargetQuery,
    });

    await handleToolCall(client, 'service-execute', { payload: 'list buckets' });

    expect(executeTargetQuery).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: '/aws/devops', payload: 'list buckets' }),
    );
  });

  it('requires secret-name when no default is configured', async () => {
    const client = stubClient();
    await expect(handleToolCall(client, 'service-execute', { payload: 'list buckets' })).rejects.toThrow(
      'secret-name is required',
    );
  });
});

describe('handleToolCall: audit fields', () => {
  it('forwards original-user/original-prompt on query-db', async () => {
    const executeTargetQuery = jest.fn().mockResolvedValue({ target_type: 'mysql', results: [] });
    const client = stubClient({ executeTargetQuery });

    await handleToolCall(client, 'query-db', {
      'secret-name': '/db/mysql-ds',
      payload: 'SELECT 1',
      'original-user': 'alice',
      'original-prompt': 'how many rows are there?',
    });

    expect(executeTargetQuery).toHaveBeenCalledWith(
      expect.objectContaining({ originalUser: 'alice', originalPrompt: 'how many rows are there?' }),
    );
  });
});

describe('handleToolCall: list-sub-tools', () => {
  it('calls client.listSubTools with the resolved secret name', async () => {
    const listSubTools = jest.fn().mockResolvedValue({ target_type: 'aws', tools: [{ name: 's3-list' }] });
    const client = stubClient({ listSubTools });

    const result = (await handleToolCall(client, 'list-sub-tools', {
      'secret-name': '/aws/devops',
      'agent-id': 'agent-1',
    })) as { tools: unknown[] };

    expect(listSubTools).toHaveBeenCalledWith({ secretName: '/aws/devops', agentId: 'agent-1' });
    expect(result.tools).toEqual([{ name: 's3-list' }]);
  });
});

/**
 * Pins the tool/parameter descriptions to the exact strings returned by the
 * Go CLI's `ara_mcp_tools.go` (`NewQueryDBTool`, `NewServiceExecuteTool`,
 * `NewListSecretsTool`, `NewListSubToolsTool`). If these fail, either this
 * file or `ara_mcp_tools.go` drifted — update whichever is stale.
 */
describe('buildToolDefinitions: parity with ara_mcp_tools.go (no default secret)', () => {
  const tools = buildToolDefinitions(undefined);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  it('registers query-db, service-execute, list-sub-tools, and list-secrets', () => {
    expect(tools.map((t) => t.name)).toEqual([
      'query-db',
      'service-execute',
      'list-sub-tools',
      'list-secrets',
    ]);
  });

  it('query-db description and required fields match NewQueryDBTool', () => {
    const tool = byName['query-db'];
    expect(tool.description).toBe(
      'Execute a query against a database using Akeyless secret credentials (dynamic or rotated). ' +
        'Supports MySQL, PostgreSQL, MSSQL, Oracle, Snowflake, HanaDB, Redshift, MongoDB, Redis, and Cassandra. ' +
        'Returns the query results as a JSON array of objects. ' +
        'IMPORTANT: Always ask the user for the secret name if it was not provided in the conversation, you can use the list-secrets tool to get the list of available secrets.',
    );
    expect(tool.inputSchema.properties['secret-name']?.description).toBe(
      'Full path of the Akeyless secret — dynamic or rotated (e.g. /MyFolder/my-mysql-ds).',
    );
    expect(tool.inputSchema.properties['payload']?.description).toBe(
      'The query or command to execute (e.g. SELECT * FROM users LIMIT 10).',
    );
    expect(tool.inputSchema.properties['agent-id']?.description).toBe('Agent identifier for auditing purposes.');
    expect(tool.inputSchema.properties['original-user']?.description).toBe(
      'The human end-user behind the agent (for auditing).',
    );
    expect(tool.inputSchema.properties['original-prompt']?.description).toBe(
      "The user's original natural-language request before the agent translated it into a query.",
    );
    expect(tool.inputSchema.required).toEqual(['secret-name', 'payload']);
  });

  it('service-execute description and required fields match NewServiceExecuteTool', () => {
    const tool = byName['service-execute'];
    expect(tool.description).toBe(
      'Execute an action against a service (AWS, GCP, Azure, Kubernetes, or GitHub) using Akeyless secret credentials (dynamic or rotated). ' +
        "Accepts natural language or CLI-style payloads (e.g. 'list all S3 buckets', 'kubectl get pods -n default', 'list open PRs'). " +
        'Returns the results as JSON. Credentials are never exposed. ' +
        'IMPORTANT: Always ask the user for the secret name if it was not provided. Use the list-secrets tool to discover available secrets.',
    );
    expect(tool.inputSchema.properties['secret-name']?.description).toBe(
      'Full path of the Akeyless secret — dynamic or rotated (e.g. /MyFolder/my-aws-ds).',
    );
    expect(tool.inputSchema.properties['payload']?.description).toBe(
      "The action to execute. Can be natural language (e.g. 'list all S3 buckets') or CLI-style (e.g. 'aws s3 ls').",
    );
    expect(tool.inputSchema.properties['auth-code']?.description).toBe(
      'OAuth authorization code returned after the user authorizes in the browser. Only required when the previous call returned an authorization URL.',
    );
    expect(tool.inputSchema.properties['state']?.description).toBe(
      'OAuth state parameter returned with the authorization URL. Must be passed back together with auth-code.',
    );
    expect(tool.inputSchema.required).toEqual(['secret-name', 'payload']);
  });

  it('list-sub-tools description and required fields match NewListSubToolsTool', () => {
    const tool = byName['list-sub-tools'];
    expect(tool.description).toBe(
      'OPTIONAL helper for service secrets only (NOT for database secrets — query-db does not need this). ' +
        'Lists the sub-tools (and their parameters) that the service behind the given secret exposes. ' +
        'This call is never required: service-execute already accepts natural language or CLI-style payloads. ' +
        'Use it only when you want to discover the exact sub-tool name and parameters before calling service-execute, ' +
        'e.g. 1) list-secrets, 2) (optional) list-sub-tools with the chosen service secret, ' +
        '3) service-execute with a payload that invokes the chosen sub-tool with its required parameters.',
    );
    expect(tool.inputSchema.properties['agent-id']?.description).toBe(
      'Agent identifier for auditing and session-scoped credential caching.',
    );
    expect(tool.inputSchema.properties['secret-name']?.description).toBe(
      'Full path of the Akeyless secret. Must be a service secret (e.g. AWS, GCP, Azure, Kubernetes, GitHub, custom MCP) — not a database secret.',
    );
    expect(tool.inputSchema.required).toEqual(['secret-name']);
  });

  it('list-secrets description matches NewListSecretsTool', () => {
    const tool = byName['list-secrets'];
    expect(tool.description).toBe(
      'List all supported secrets in the account — both dynamic and rotated (databases and services like AWS, GCP, Azure, Kubernetes, GitHub).',
    );
  });
});

describe('buildToolDefinitions: default secret name configured', () => {
  const tools = buildToolDefinitions('/prod/db/postgres-ro');
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  it('omits list-secrets and the secret-name parameter, and drops the IMPORTANT suffix', () => {
    expect(tools.map((t) => t.name)).toEqual(['query-db', 'service-execute', 'list-sub-tools']);

    for (const name of ['query-db', 'service-execute', 'list-sub-tools'] as const) {
      expect(byName[name].inputSchema.properties['secret-name']).toBeUndefined();
      expect(byName[name].inputSchema.required).not.toContain('secret-name');
      expect(byName[name].description).not.toContain('IMPORTANT');
    }
  });
});

describe('formatOAuthRequiredMessage', () => {
  it('produces an actionable, non-JSON message with the URL and state', () => {
    const message = formatOAuthRequiredMessage(
      new OAuthAuthorizationRequiredError('https://auth.example.com/authorize', 'state-123'),
    );
    expect(message).toContain('Authorization URL: https://auth.example.com/authorize');
    expect(message).toContain('State: state-123');
    expect(message).toContain('auth-code and state parameters');
  });
});
