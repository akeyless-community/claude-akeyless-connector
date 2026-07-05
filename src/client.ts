import * as akeyless from 'akeyless';
import { authenticate, type AuthSession } from './auth';
import {
  buildGatewayAuthHeader,
  buildAraListItemsBody,
  buildDiagnosticListItemsBody,
  diagnoseAraList,
  mapAraSecrets,
  postListSubTools,
  postTargetQuery,
  type AraListDiagnostics,
  type AraSecretSummary,
  type ListSubToolsResult,
  type TargetQueryResult,
} from './ara';
import { configFromEnv, validateConfig } from './config';
import type { AkeylessConfig, AkeylessConfigInput } from './types';

export class AkeylessClient {
  private readonly config: AkeylessConfig;
  private readonly api: akeyless.V2Api;
  private session: AuthSession | null = null;

  constructor(config: AkeylessConfigInput = {}) {
    this.config = configFromEnv(config);
    validateConfig(this.config);

    const client = new akeyless.ApiClient();
    client.basePath = this.config.gatewayUrl.replace(/\/$/, '');
    this.api = new akeyless.V2Api(client);
  }

  getConfig(): Readonly<AkeylessConfig> {
    return this.config;
  }

  private async getSession(): Promise<AuthSession> {
    const now = Date.now();
    if (this.session && now < this.session.expiresAtMs) {
      return this.session;
    }
    this.session = await authenticate(this.api, this.config);
    return this.session;
  }

  private async getToken(): Promise<string> {
    return (await this.getSession()).token;
  }

  private async getGatewayAuthHeader(): Promise<Record<string, string>> {
    return buildGatewayAuthHeader(await this.getSession());
  }

  async listAraSecrets(path?: string): Promise<AraSecretSummary[]> {
    const result = await this.listAraSecretsDetailed(path);
    return result.secrets;
  }

  private buildListItemsRequest(
    body: Record<string, unknown>,
  ): ReturnType<typeof akeyless.ListItems.constructFromObject> {
    return akeyless.ListItems.constructFromObject(body);
  }

  async listAraSecretsDetailed(path?: string): Promise<{
    secrets: AraSecretSummary[];
    diagnostics?: AraListDiagnostics & {
      path: string;
      gateway_api_url: string;
      ara_gateway_url: string;
      access_id?: string;
      list_items_request: Record<string, unknown>;
      troubleshooting: string[];
    };
  }> {
    const token = await this.getToken();
    const listPath = path?.trim();
    const pathOptions = listPath ? { path: listPath } : undefined;

    const araRequestBody = buildAraListItemsBody(token, pathOptions);
    const araBody = this.buildListItemsRequest(araRequestBody);

    const araRaw = (await this.api.listItems(araBody)) as {
      items?: Array<Record<string, unknown>>;
    };
    const araItems = (araRaw?.items ?? []) as Parameters<typeof mapAraSecrets>[0];
    const secrets = mapAraSecrets(araItems);

    if (secrets.length > 0) {
      return { secrets };
    }

    const allBody = this.buildListItemsRequest(
      buildDiagnosticListItemsBody(token, pathOptions),
    );
    const allRaw = (await this.api.listItems(allBody)) as {
      items?: Array<Record<string, unknown>>;
    };
    const allItems = (allRaw?.items ?? []) as Parameters<typeof mapAraSecrets>[0];

    const diagnosticsBase = diagnoseAraList(araItems);
    const troubleshooting: string[] = [];
    const pathLabel = listPath ?? '(all ARA paths)';

    if (allItems.length === 0) {
      troubleshooting.push(
        `No dynamic or rotated secrets are visible under path "${pathLabel}" for this auth method. Try a different folder path, or grant the role List/Read access to the secret paths.`,
      );
    } else if (araItems.length === 0) {
      troubleshooting.push(
        `Found ${allItems.length} dynamic/rotated secret(s) under "${pathLabel}", but none are ARA-eligible for this role. Add an Agentic Runtime Authority role rule with Allow Access on the secret path, and enable ARA on each dynamic secret in the Console.`,
      );
    } else if (diagnosticsBase.skipped_missing_ara_permission > 0) {
      troubleshooting.push(
        `${araItems.length} ARA-enabled secret(s) were returned by the API, but ${diagnosticsBase.skipped_missing_ara_permission} lack the ara_allow_access permission on your role.`,
      );
    } else if (diagnosticsBase.skipped_unrecognized_item_type > 0) {
      troubleshooting.push(
        `${diagnosticsBase.skipped_unrecognized_item_type} item(s) from the API used an unrecognized item_type (samples: ${diagnosticsBase.sample_item_types.join(', ') || 'n/a'}).`,
      );
    } else if (diagnosticsBase.skipped_unsupported_producer_type > 0) {
      troubleshooting.push(
        `${diagnosticsBase.skipped_unsupported_producer_type} secret(s) use a producer type that ARA MCP does not expose yet.`,
      );
    }

    troubleshooting.push(
      'Verify in Akeyless Console: Dynamic Secret → Agentic Runtime Authority enabled, role has ARA rule (Allow Access) on the path, and AI Insights is configured on the Gateway.',
    );

    return {
      secrets,
      diagnostics: {
        ...diagnosticsBase,
        dynamic_rotated_items_without_ara_filter: allItems.length,
        path: pathLabel,
        gateway_api_url: this.config.gatewayUrl,
        ara_gateway_url: this.config.araGatewayUrl,
        access_id: this.config.accessId,
        list_items_request: araRequestBody,
        troubleshooting,
      },
    };
  }

  async executeTargetQuery(input: {
    secretName: string;
    payload: string;
    agentId?: string;
    authCode?: string;
    state?: string;
    originalUser?: string;
    originalPrompt?: string;
  }): Promise<TargetQueryResult> {
    const authHeader = await this.getGatewayAuthHeader();
    return postTargetQuery(this.config.araGatewayUrl, authHeader, {
      secret_name: input.secretName,
      payload: input.payload,
      agent_id: input.agentId ?? this.config.agentId,
      mcp_id: this.config.mcpId,
      auth_code: input.authCode,
      state: input.state,
      original_user: input.originalUser,
      original_prompt: input.originalPrompt,
    });
  }

  async listSubTools(input: { secretName: string; agentId?: string }): Promise<ListSubToolsResult> {
    const authHeader = await this.getGatewayAuthHeader();
    return postListSubTools(this.config.araGatewayUrl, authHeader, {
      secret_name: input.secretName,
      agent_id: input.agentId ?? this.config.agentId,
      mcp_id: this.config.mcpId,
    });
  }
}
