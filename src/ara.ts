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

export function isAraDbProducerType(producerType: string): boolean {
  return ARA_DB_PRODUCER_TYPES.has(producerType.toLowerCase());
}

export function isAraServiceProducerType(producerType: string): boolean {
  return ARA_SERVICE_PRODUCER_TYPES.has(producerType.toLowerCase());
}

export function isAraSupportedProducerType(producerType: string): boolean {
  const normalized = producerType.toLowerCase();
  return ARA_DB_PRODUCER_TYPES.has(normalized) || ARA_SERVICE_PRODUCER_TYPES.has(normalized);
}

export interface AraSecretSummary {
  name: string;
  secret_type: 'dynamic-secret' | 'rotated-secret';
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
 * Build the POST /list-items body for ARA list-secrets.
 * Matches `akeyless mcp-runtime-authority`: dynamic + rotated types with `ara-only: true`.
 * Omit path unless the caller wants to scope to a folder (CLI uses no path by default).
 */
export function buildAraListItemsBody(
  token: string,
  options?: { path?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    token,
    filter: '',
    type: ['dynamic-secret', 'rotated-secret'],
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
    type: ['dynamic-secret', 'rotated-secret'],
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
  },
): Promise<TargetQueryResult> {
  const base = gatewayUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/config/target_query`, {
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
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : text || `Gateway target query failed (${response.status})`;
    throw new Error(message);
  }

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
