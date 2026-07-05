import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isAraDbProducerType, isAraServiceProducerType } from './ara';
import { AkeylessClient } from './client';
import { AKEYLESS_SDK_VERSION, CONNECTOR_VERSION } from './version';

const SERVER_INSTRUCTIONS = `Akeyless Agentic Runtime Authority (ARA) connector for Claude.

Built with Akeyless Node.js SDK v${AKEYLESS_SDK_VERSION}.

Use these tools to access protected databases and cloud services through Akeyless without exposing long-lived credentials.

Workflow:
1. Call list-secrets to discover ARA-enabled dynamic and rotated secrets your role can access.
2. For database secrets (MySQL, PostgreSQL, etc.), use query-db with secret-name and payload.
3. For service secrets (AWS, GCP, Azure, Kubernetes, GitHub), use service-execute with secret-name and payload.

Credentials are used server-side via the Akeyless Gateway. Secret values never appear in tool responses.

Always provide agent-id for auditing. Use list-secrets before executing to confirm the secret path and target type.`;

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
    tools: [
      {
        name: 'list-secrets',
        title: 'List ARA Secrets',
        description:
          'List Akeyless dynamic and rotated secrets available for Agentic Runtime Authority (ARA). Returns metadata only — credentials are never exposed.',
        annotations: {
          readOnlyHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Optional Akeyless folder path to filter results (default /)',
            },
          },
        },
      },
      {
        name: 'query-db',
        title: 'Query Database',
        description:
          'Execute a database query using Akeyless dynamic or rotated secret credentials. Supports MySQL, PostgreSQL, MSSQL, Oracle, Snowflake, HanaDB, Redshift, MongoDB, Redis, and Cassandra.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            'secret-name': {
              type: 'string',
              description:
                defaultSecretName
                  ? `Full Akeyless path of the database secret (defaults to ${defaultSecretName})`
                  : 'Full Akeyless path of the database dynamic/rotated secret',
            },
            payload: {
              type: 'string',
              description: 'SQL query or command (e.g. SELECT * FROM users LIMIT 10)',
            },
            'agent-id': {
              type: 'string',
              description: 'Agent identifier for auditing (defaults to configured agent ID)',
            },
          },
          required: defaultSecretName ? ['payload'] : ['secret-name', 'payload'],
        },
      },
      {
        name: 'service-execute',
        title: 'Execute Service Action',
        description:
          'Execute an action against AWS, GCP, Azure, Kubernetes, or GitHub using Akeyless dynamic or rotated credentials. For OAuth-backed services, a follow-up call may require auth-code and state.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            'secret-name': {
              type: 'string',
              description: 'Full Akeyless path of the service dynamic/rotated secret',
            },
            payload: {
              type: 'string',
              description: "Action to execute (e.g. 'list all S3 buckets', 'kubectl get pods')",
            },
            'agent-id': {
              type: 'string',
              description: 'Agent identifier for auditing (defaults to configured agent ID)',
            },
            'auth-code': {
              type: 'string',
              description: 'OAuth authorization code from the consent redirect (follow-up calls only)',
            },
            state: {
              type: 'string',
              description: 'OAuth state value from the initial service-execute response',
            },
          },
          required: ['secret-name', 'payload'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleToolCall(getClient(), request.params.name, request.params.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

async function handleToolCall(
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
          ? 'Use query-db for database secrets or service-execute for cloud/K8s/GitHub secrets.'
          : 'No ARA secrets matched. See diagnostics.troubleshooting for likely RBAC or ARA setup fixes.',
      };
    }

    case 'query-db': {
      const input = z
        .object({
          'secret-name': z.string().min(1).optional(),
          payload: z.string().min(1),
          'agent-id': z.string().optional(),
        })
        .parse(args);

      const secretName = input['secret-name'] ?? client.getConfig().defaultSecretName;
      if (!secretName) {
        throw new Error('secret-name is required (or configure AKEYLESS_DEFAULT_SECRET_NAME)');
      }

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
      });

      return {
        ...result,
        note: 'Query executed via Akeyless Runtime Authority. Credentials were not exposed.',
      };
    }

    case 'service-execute': {
      const input = z
        .object({
          'secret-name': z.string().min(1),
          payload: z.string().min(1),
          'agent-id': z.string().optional(),
          'auth-code': z.string().optional(),
          state: z.string().optional(),
        })
        .parse(args);

      const secrets = await client.listAraSecrets();
      const secret = secrets.find((s) => s.name === input['secret-name']);
      if (secret?.target_type && !isAraServiceProducerType(secret.target_type)) {
        throw new Error(
          `Secret "${input['secret-name']}" is not a service secret. Use query-db instead.`,
        );
      }

      const result = await client.executeTargetQuery({
        secretName: input['secret-name'],
        payload: input.payload,
        agentId: input['agent-id'],
        authCode: input['auth-code'],
        state: input.state,
      });

      return {
        ...result,
        note: 'Action executed via Akeyless Runtime Authority. Credentials were not exposed.',
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
