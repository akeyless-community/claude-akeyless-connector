export const ARA_DB_PRODUCER_TYPES = new Set([
  'mysql',
  'postgres',
  'mssql',
  'oracle',
  'snowflake',
  'hana',
  'redshift',
  'mongodb',
  'redis',
  'cassandra',
]);

export const ARA_SERVICE_PRODUCER_TYPES = new Set([
  'aws',
  'gcp',
  'azure',
  'k8s',
  'eks',
  'gke',
  'github',
]);

/**
 * Synthetic target-type label for static-secret MCP configs, matching the Go
 * gateway's `types.CustomMCPTargetType`. Not a registered Akeyless target
 * type — it only labels custom-MCP secrets in list-secrets output.
 */
export const CUSTOM_MCP_TARGET_TYPE = 'custom-mcp';

export function isAraDbProducerType(producerType: string): boolean {
  return ARA_DB_PRODUCER_TYPES.has(producerType.toLowerCase());
}

/** Custom-MCP secrets are dispatched like service secrets (service-execute / list-sub-tools). */
export function isAraServiceProducerType(producerType: string): boolean {
  const normalized = producerType.toLowerCase();
  return ARA_SERVICE_PRODUCER_TYPES.has(normalized) || normalized === CUSTOM_MCP_TARGET_TYPE;
}

export function isAraSupportedProducerType(producerType: string): boolean {
  const normalized = producerType.toLowerCase();
  return ARA_DB_PRODUCER_TYPES.has(normalized) || ARA_SERVICE_PRODUCER_TYPES.has(normalized);
}

export interface AraSecretSummary {
  name: string;
  secret_type: 'dynamic-secret' | 'rotated-secret' | 'static-secret';
  target_type?: string;
  description?: string;
}

export interface TargetQueryResult {
  target_type?: string;
  results?: Array<Record<string, unknown>>;
  raw?: unknown;
}

interface ItemTargetAssociation {
  target_type?: string;
}

interface DynamicSecretProducerInfo {
  producer_type?: string;
}

interface AraListItem {
  item_name?: string;
  item_type?: string;
  item_metadata?: string;
  client_permissions?: string[];
  item_general_info?: {
    dynamic_secret_producer_details?: DynamicSecretProducerInfo;
  };
  item_targets_assoc?: ItemTargetAssociation[];
  dynamic_secret_producer_details?: DynamicSecretProducerInfo;
}

/** Normalize API item types (e.g. DYNAMIC_SECRET → dynamic-secret). */
export function normalizeItemType(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Item types requested from list-items for ARA list-secrets. Matches
 * `akeyless mcp-runtime-authority`: dynamic + rotated + static (custom-MCP)
 * secrets — see `mcp_runtime_authority.go`'s `client.ListItems` call.
 */
const ARA_LIST_ITEM_TYPES = ['dynamic-secret', 'rotated-secret', 'static-secret'];

/**
 * Build the POST /list-items body for ARA list-secrets.
 * Matches `akeyless mcp-runtime-authority` with `ara-only: true`.
 * Omit path unless the caller wants to scope to a folder (CLI uses no path by default).
 */
export function buildAraListItemsBody(
  token: string,
  options?: { path?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    token,
    filter: '',
    type: ARA_LIST_ITEM_TYPES,
    'ara-only': true,
    'advanced-filter': '',
  };
  const path = options?.path?.trim();
  if (path) {
    body.path = path;
  }
  return body;
}

/** Diagnostic fallback: same types without the ARA server-side filter. */
export function buildDiagnosticListItemsBody(
  token: string,
  options?: { path?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    token,
    filter: '',
    type: ARA_LIST_ITEM_TYPES,
    'ara-only': false,
    'advanced-filter': '',
  };
  const path = options?.path?.trim();
  if (path) {
    body.path = path;
  }
  return body;
}

function isDynamicSecretItem(itemType: string): boolean {
  return normalizeItemType(itemType) === 'dynamic-secret';
}

function isRotatedSecretItem(itemType: string): boolean {
  return normalizeItemType(itemType) === 'rotated-secret';
}

function isStaticSecretItem(itemType: string): boolean {
  return normalizeItemType(itemType) === 'static-secret';
}

function extractDynamicProducerType(item: AraListItem): string | undefined {
  const producer =
    item.item_general_info?.dynamic_secret_producer_details?.producer_type ??
    item.dynamic_secret_producer_details?.producer_type;
  return producer?.trim().toLowerCase() || undefined;
}

export function mapAraSecrets(items: AraListItem[]): AraSecretSummary[] {
  const results: AraSecretSummary[] = [];

  for (const item of items) {
    if (!item.item_name?.trim()) {
      continue;
    }
    if (!item.client_permissions?.includes('ara_allow_access')) {
      continue;
    }

    const itemType = item.item_type ?? '';
    if (isDynamicSecretItem(itemType)) {
      const targetType = extractDynamicProducerType(item);
      if (!targetType || !isAraSupportedProducerType(targetType)) {
        continue;
      }
      results.push({
        name: item.item_name,
        secret_type: 'dynamic-secret',
        target_type: targetType,
        description: item.item_metadata?.trim() || undefined,
      });
      continue;
    }

    if (isRotatedSecretItem(itemType)) {
      const targetType = item.item_targets_assoc?.[0]?.target_type?.toLowerCase();
      if (targetType && !isAraSupportedProducerType(targetType)) {
        continue;
      }
      results.push({
        name: item.item_name,
        secret_type: 'rotated-secret',
        target_type: targetType,
        description: item.item_metadata?.trim() || undefined,
      });
      continue;
    }

    if (isStaticSecretItem(itemType)) {
      // Custom-MCP secrets have no producer type to filter on — always
      // included, matching the Go gateway's `ListARASecrets` StaticSecret case.
      results.push({
        name: item.item_name,
        secret_type: 'static-secret',
        target_type: CUSTOM_MCP_TARGET_TYPE,
        description: item.item_metadata?.trim() || undefined,
      });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export interface AraListDiagnostics {
  ara_only_items_from_api: number;
  dynamic_rotated_items_without_ara_filter: number;
  skipped_missing_ara_permission: number;
  skipped_unsupported_producer_type: number;
  skipped_unrecognized_item_type: number;
  sample_ara_only_item_names: string[];
  sample_item_types: string[];
}

export function diagnoseAraList(items: AraListItem[]): AraListDiagnostics {
  let skippedMissingAraPermission = 0;
  let skippedUnsupportedProducerType = 0;
  let skippedUnrecognizedItemType = 0;
  const sampleNames: string[] = [];
  const sampleItemTypes: string[] = [];

  for (const item of items) {
    if (!item.item_name?.trim()) {
      continue;
    }
    if (sampleNames.length < 5) {
      sampleNames.push(item.item_name);
    }
    if (sampleItemTypes.length < 5 && item.item_type) {
      sampleItemTypes.push(item.item_type);
    }
    if (!item.client_permissions?.includes('ara_allow_access')) {
      skippedMissingAraPermission += 1;
      continue;
    }

    const itemType = item.item_type ?? '';
    if (isDynamicSecretItem(itemType)) {
      const targetType = extractDynamicProducerType(item);
      if (!targetType || !isAraSupportedProducerType(targetType)) {
        skippedUnsupportedProducerType += 1;
      }
      continue;
    }

    if (isRotatedSecretItem(itemType)) {
      const targetType = item.item_targets_assoc?.[0]?.target_type?.toLowerCase();
      if (targetType && !isAraSupportedProducerType(targetType)) {
        skippedUnsupportedProducerType += 1;
      }
      continue;
    }

    if (isStaticSecretItem(itemType)) {
      continue;
    }

    skippedUnrecognizedItemType += 1;
  }

  return {
    ara_only_items_from_api: items.length,
    dynamic_rotated_items_without_ara_filter: 0,
    skipped_missing_ara_permission: skippedMissingAraPermission,
    skipped_unsupported_producer_type: skippedUnsupportedProducerType,
    skipped_unrecognized_item_type: skippedUnrecognizedItemType,
    sample_ara_only_item_names: sampleNames,
    sample_item_types: sampleItemTypes,
  };
}

export function buildGatewayAuthHeader(session: {
  token: string;
  creds?: Record<string, unknown>;
}): Record<string, string> {
  if (session.creds) {
    return {
      Authorization: `Bearer ${Buffer.from(JSON.stringify(session.creds)).toString('base64')}`,
    };
  }
  if (session.token?.trim()) {
    return { Authorization: `Bearer ${session.token.trim()}` };
  }
  throw new Error('Unable to build gateway authorization header');
}

/**
 * Thrown when the gateway responds 401 with an `authorization_url` + `state`
 * body, signaling an OAuth authorization-code flow is required before the
 * secret can be used. Mirrors the CLI's `OAuthAuthorizationRequiredErr`
 * (`runtime_authority.go`). Callers should surface `authorizationUrl` and
 * `state` to the user/agent as an actionable next step, not a hard failure.
 */
export class OAuthAuthorizationRequiredError extends Error {
  constructor(
    public readonly authorizationUrl: string,
    public readonly state: string,
  ) {
    super(`OAuth authorization required: ${authorizationUrl}`);
    this.name = 'OAuthAuthorizationRequiredError';
  }
}

function isOAuthRequiredBody(parsed: unknown): parsed is { authorization_url: string; state: string } {
  if (typeof parsed !== 'object' || parsed === null) {
    return false;
  }
  const body = parsed as { authorization_url?: unknown; state?: unknown };
  return (
    typeof body.authorization_url === 'string' &&
    body.authorization_url.length > 0 &&
    typeof body.state === 'string' &&
    body.state.length > 0
  );
}

/**
 * POSTs a JSON body to an ARA gateway endpoint and returns the parsed
 * response. Throws `OAuthAuthorizationRequiredError` on a 401 carrying an
 * OAuth challenge, otherwise a plain `Error` for any other non-2xx response.
 */
async function postAraJson(
  gatewayUrl: string,
  path: string,
  authHeader: Record<string, string>,
  body: Record<string, unknown>,
  failureLabel: string,
): Promise<unknown> {
  const base = gatewayUrl.replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    if (response.status === 401 && isOAuthRequiredBody(parsed)) {
      throw new OAuthAuthorizationRequiredError(parsed.authorization_url, parsed.state);
    }
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : text || `Gateway ${failureLabel} failed (${response.status})`;
    throw new Error(message);
  }

  return parsed;
}

export async function postTargetQuery(
  gatewayUrl: string,
  authHeader: Record<string, string>,
  body: {
    secret_name: string;
    payload: string;
    agent_id: string;
    mcp_id: string;
    auth_code?: string;
    state?: string;
    original_user?: string;
    original_prompt?: string;
  },
): Promise<TargetQueryResult> {
  const parsed = await postAraJson(gatewayUrl, '/config/target_query', authHeader, body, 'target query');

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as TargetQueryResult;
    return {
      target_type: obj.target_type,
      results: obj.results,
      raw: parsed,
    };
  }

  return { raw: parsed };
}

export interface ListSubToolsTool {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface ListSubToolsResult {
  target_type?: string;
  tools?: ListSubToolsTool[];
  raw?: unknown;
}

/** POSTs to the gateway's /config/list_sub_tools endpoint (list-sub-tools MCP tool). */
export async function postListSubTools(
  gatewayUrl: string,
  authHeader: Record<string, string>,
  body: {
    secret_name: string;
    agent_id: string;
    mcp_id: string;
  },
): Promise<ListSubToolsResult> {
  const parsed = await postAraJson(gatewayUrl, '/config/list_sub_tools', authHeader, body, 'list sub-tools');

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as ListSubToolsResult;
    return {
      target_type: obj.target_type,
      tools: obj.tools,
      raw: parsed,
    };
  }

  return { raw: parsed };
}
