import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isAraDbProducerType, isAraServiceProducerType, OAuthAuthorizationRequiredError } from './ara';
import { AkeylessClient } from './client';
import { AKEYLESS_SDK_VERSION, CONNECTOR_VERSION } from './version';

const SERVER_INSTRUCTIONS = `Akeyless Agentic Runtime Authority (ARA) connector for Claude.

Built with Akeyless Node.js SDK v${AKEYLESS_SDK_VERSION}.

Use these tools to access protected databases and cloud services through Akeyless without exposing long-lived credentials.

Workflow:
1. Call list-secrets to discover ARA-enabled dynamic, rotated, and custom-MCP secrets your role can access.
2. For database secrets (MySQL, PostgreSQL, etc.), use query-db with secret-name and payload.
3. For service secrets (AWS, GCP, Azure, Kubernetes, GitHub, custom MCP), use service-execute with secret-name and payload.
4. (Optional) Use list-sub-tools on a service secret to discover its exact sub-tool names and parameters before calling service-execute.

Credentials are used server-side via the Akeyless Gateway. Secret values never appear in tool responses.

Always provide agent-id for auditing. Use list-secrets before executing to confirm the secret path and target type.`;

/** Builds a friendly, actionable message for an OAuth authorization-required response. */
export function formatOAuthRequiredMessage(error: OAuthAuthorizationRequiredError): string {
  return (
    'This secret requires OAuth authorization. ' +
    'Please open the following URL in your browser to authorize, ' +
    'then call this tool again with the auth-code and state parameters.\n\n' +
    `Authorization URL: ${error.authorizationUrl}\nState: ${error.state}`
  );
}

interface InputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
}

/**
 * Tool and parameter descriptions below are kept verbatim-identical to the Go
 * CLI's tool definitions (`ara_mcp_tools.go`: `NewQueryDBTool`,
 * `NewServiceExecuteTool`, `NewListSecretsTool`, `NewListSubToolsTool`) so
 * Claude sees the same guidance regardless of which ARA MCP server it talks
 * to. When editing a description here, update the Go source (or vice versa)
 * to keep them in sync — see `server.test.ts` for a pinned-string regression
 * test.
 */

function secretNameProperty(description: string): Record<string, { type: string; description: string }> {
  return { 'secret-name': { type: 'string', description } };
}

/** Matches `NewQueryDBTool` in `ara_mcp_tools.go`. */
function buildQueryDbTool(defaultSecretName: string | undefined) {
  let description =
    'Execute a query against a database using Akeyless secret credentials (dynamic or rotated). ' +
    'Supports MySQL, PostgreSQL, MSSQL, Oracle, Snowflake, HanaDB, Redshift, MongoDB, Redis, and Cassandra. ' +
    'Returns the query results as a JSON array of objects.';
  if (!defaultSecretName) {
    description +=
      ' IMPORTANT: Always ask the user for the secret name if it was not provided in the conversation, you can use the list-secrets tool to get the list of available secrets.';
  }

  const properties: InputSchema['properties'] = {
    payload: {
      type: 'string',
      description: 'The query or command to execute (e.g. SELECT * FROM users LIMIT 10).',
    },
    'agent-id': {
      type: 'string',
      description: 'Agent identifier for auditing purposes.',
    },
    'original-user': {
      type: 'string',
      description: 'The human end-user behind the agent (for auditing).',
    },
    'original-prompt': {
      type: 'string',
      description: "The user's original natural-language request before the agent translated it into a query.",
    },
  };
  const required = ['payload'];
  if (!defaultSecretName) {
    Object.assign(
      properties,
      secretNameProperty('Full path of the Akeyless secret — dynamic or rotated (e.g. /MyFolder/my-mysql-ds).'),
    );
    required.unshift('secret-name');
  }

  return {
    name: 'query-db',
    title: 'Query Database',
    description,
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: { type: 'object', properties, required } satisfies InputSchema,
  };
}

/** Matches `NewServiceExecuteTool` in `ara_mcp_tools.go`. */
function buildServiceExecuteTool(defaultSecretName: string | undefined) {
  let description =
    'Execute an action against a service (AWS, GCP, Azure, Kubernetes, or GitHub) using Akeyless secret credentials (dynamic or rotated). ' +
    "Accepts natural language or CLI-style payloads (e.g. 'list all S3 buckets', 'kubectl get pods -n default', 'list open PRs'). " +
    'Returns the results as JSON. Credentials are never exposed.';
  if (!defaultSecretName) {
    description +=
      ' IMPORTANT: Always ask the user for the secret name if it was not provided. Use the list-secrets tool to discover available secrets.';
  }

  const properties: InputSchema['properties'] = {
    payload: {
      type: 'string',
      description: "The action to execute. Can be natural language (e.g. 'list all S3 buckets') or CLI-style (e.g. 'aws s3 ls').",
    },
    'agent-id': {
      type: 'string',
      description: 'Agent identifier for auditing purposes.',
    },
    'auth-code': {
      type: 'string',
      description:
        'OAuth authorization code returned after the user authorizes in the browser. Only required when the previous call returned an authorization URL.',
    },
    state: {
      type: 'string',
      description: 'OAuth state parameter returned with the authorization URL. Must be passed back together with auth-code.',
    },
    'original-user': {
      type: 'string',
      description: 'The human end-user behind the agent (for auditing).',
    },
    'original-prompt': {
      type: 'string',
      description: "The user's original natural-language request before the agent translated it into an action.",
    },
  };
  const required = ['payload'];
  if (!defaultSecretName) {
    Object.assign(
      properties,
      secretNameProperty('Full path of the Akeyless secret — dynamic or rotated (e.g. /MyFolder/my-aws-ds).'),
    );
    required.unshift('secret-name');
  }

  return {
    name: 'service-execute',
    title: 'Execute Service Action',
    description,
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: { type: 'object', properties, required } satisfies InputSchema,
  };
}

/** Matches `NewListSecretsTool` in `ara_mcp_tools.go`. */
function buildListSecretsTool() {
  return {
    name: 'list-secrets',
    title: 'List ARA Secrets',
    description:
      'List all supported secrets in the account — both dynamic and rotated (databases and services like AWS, GCP, Azure, Kubernetes, GitHub).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        // Additive, connector-only convenience not present on the Go tool:
        // scopes list-secrets to a folder instead of always listing globally.
        path: {
          type: 'string',
          description: 'Optional Akeyless folder path to filter results (default /)',
        },
      },
      required: [],
    } satisfies InputSchema,
  };
}

/** Matches `NewListSubToolsTool` in `ara_mcp_tools.go`. */
function buildListSubToolsTool(defaultSecretName: string | undefined) {
  const description =
    'OPTIONAL helper for service secrets only (NOT for database secrets — query-db does not need this). ' +
    'Lists the sub-tools (and their parameters) that the service behind the given secret exposes. ' +
    'This call is never required: service-execute already accepts natural language or CLI-style payloads. ' +
    'Use it only when you want to discover the exact sub-tool name and parameters before calling service-execute, ' +
    'e.g. 1) list-secrets, 2) (optional) list-sub-tools with the chosen service secret, ' +
    '3) service-execute with a payload that invokes the chosen sub-tool with its required parameters.';

  const properties: InputSchema['properties'] = {
    'agent-id': {
      type: 'string',
      description: 'Agent identifier for auditing and session-scoped credential caching.',
    },
  };
  const required: string[] = [];
  if (!defaultSecretName) {
    Object.assign(
      properties,
      secretNameProperty(
        'Full path of the Akeyless secret. Must be a service secret (e.g. AWS, GCP, Azure, Kubernetes, GitHub, custom MCP) — not a database secret.',
      ),
    );
    required.push('secret-name');
  }

  return {
    name: 'list-sub-tools',
    title: 'List Service Sub-Tools',
    description,
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties, required } satisfies InputSchema,
  };
}

/**
 * Builds the MCP tool list, mirroring `addTools` in `mcp_runtime_authority.go`
 * (same order; `list-secrets` is only registered when no default secret is
 * configured, since a single-secret runtime has nothing to list).
 */
export function buildToolDefinitions(defaultSecretName: string | undefined) {
  const tools = [
    buildQueryDbTool(defaultSecretName),
    buildServiceExecuteTool(defaultSecretName),
    buildListSubToolsTool(defaultSecretName),
  ];
  if (!defaultSecretName) {
    tools.push(buildListSecretsTool());
  }
  return tools;
}

export function createMcpServer(client?: AkeylessClient): Server {
  let lazyClient = client;

  function getClient(): AkeylessClient {
    if (!lazyClient) {
      lazyClient = new AkeylessClient();
    }
    return lazyClient;
  }

  const defaultSecretName = client?.getConfig().defaultSecretName;

  const server = new Server(
    {
      name: 'akeyless-claude-connector',
      version: CONNECTOR_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolDefinitions(defaultSecretName),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleToolCall(getClient(), request.params.name, request.params.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      if (error instanceof OAuthAuthorizationRequiredError) {
        return { content: [{ type: 'text', text: formatOAuthRequiredMessage(error) }] };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

function resolveSecretName(client: AkeylessClient, explicit: string | undefined): string {
  const secretName = explicit ?? client.getConfig().defaultSecretName;
  if (!secretName) {
    throw new Error('secret-name is required (or configure AKEYLESS_DEFAULT_SECRET_NAME)');
  }
  return secretName;
}

export async function handleToolCall(
  client: AkeylessClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list-secrets': {
      const input = z.object({ path: z.string().optional() }).parse(args);
      const listed = await client.listAraSecretsDetailed(input.path);
      return {
        count: listed.secrets.length,
        secrets: listed.secrets,
        ...(listed.diagnostics ? { diagnostics: listed.diagnostics } : {}),
        note: listed.secrets.length
          ? 'Use query-db for database secrets or service-execute for cloud/K8s/GitHub/custom-MCP secrets.'
          : 'No ARA secrets matched. See diagnostics.troubleshooting for likely RBAC or ARA setup fixes.',
      };
    }

    case 'query-db': {
      const input = z
        .object({
          'secret-name': z.string().min(1).optional(),
          payload: z.string().min(1),
          'agent-id': z.string().optional(),
          'original-user': z.string().optional(),
          'original-prompt': z.string().optional(),
        })
        .parse(args);

      const secretName = resolveSecretName(client, input['secret-name']);

      const secrets = await client.listAraSecrets();
      const secret = secrets.find((s) => s.name === secretName);
      if (secret?.target_type && !isAraDbProducerType(secret.target_type)) {
        throw new Error(
          `Secret "${secretName}" is not a database secret. Use service-execute instead.`,
        );
      }

      const result = await client.executeTargetQuery({
        secretName,
        payload: input.payload,
        agentId: input['agent-id'],
        originalUser: input['original-user'],
        originalPrompt: input['original-prompt'],
      });

      return {
        ...result,
        note: 'Query executed via Akeyless Runtime Authority. Credentials were not exposed.',
      };
    }

    case 'service-execute': {
      const input = z
        .object({
          'secret-name': z.string().min(1).optional(),
          payload: z.string().min(1),
          'agent-id': z.string().optional(),
          'auth-code': z.string().optional(),
          state: z.string().optional(),
          'original-user': z.string().optional(),
          'original-prompt': z.string().optional(),
        })
        .parse(args);

      const secretName = resolveSecretName(client, input['secret-name']);

      const secrets = await client.listAraSecrets();
      const secret = secrets.find((s) => s.name === secretName);
      if (secret?.target_type && !isAraServiceProducerType(secret.target_type)) {
        throw new Error(
          `Secret "${secretName}" is not a service secret. Use query-db instead.`,
        );
      }

      const result = await client.executeTargetQuery({
        secretName,
        payload: input.payload,
        agentId: input['agent-id'],
        authCode: input['auth-code'],
        state: input.state,
        originalUser: input['original-user'],
        originalPrompt: input['original-prompt'],
      });

      return {
        ...result,
        note: 'Action executed via Akeyless Runtime Authority. Credentials were not exposed.',
      };
    }

    case 'list-sub-tools': {
      const input = z
        .object({
          'secret-name': z.string().min(1).optional(),
          'agent-id': z.string().optional(),
        })
        .parse(args);

      const secretName = resolveSecretName(client, input['secret-name']);

      const result = await client.listSubTools({
        secretName,
        agentId: input['agent-id'],
      });

      return {
        ...result,
        note: 'Use service-execute with a payload that invokes the desired sub-tool.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runStdioServer(client?: AkeylessClient): Promise<void> {
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
