import { randomUUID } from 'node:crypto';
import { DEFAULT_UID_TOKEN_FILE } from './uid-token';
import type {
  AccessType,
  AkeylessConfig,
  AkeylessConfigInput,
  CloudProvider,
} from './types';

const API_V2_SUFFIX = '/api/v2';
const DEFAULT_AGENT_ID = 'claude-desktop';
const DEFAULT_TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseAccessType(raw: string | undefined): AccessType {
  const value = (raw ?? 'access_key').toLowerCase();
  if (value === 'api_key') {
    return 'access_key';
  }
  switch (value) {
    case 'access_key':
    case 'aws_iam':
    case 'azure_ad':
    case 'gcp':
    case 'universal_identity':
    case 'jwt':
    case 'saml':
    case 'oidc':
      return value;
    default:
      throw new Error(
        `Unsupported AKEYLESS_ACCESS_TYPE "${raw}". Expected access_key, aws_iam, azure_ad, gcp, universal_identity, jwt, saml, or oidc.`,
      );
  }
}

function cloudProviderForAccessType(
  accessType: AccessType,
): CloudProvider | undefined {
  if (
    accessType === 'aws_iam' ||
    accessType === 'azure_ad' ||
    accessType === 'gcp'
  ) {
    return accessType;
  }
  return undefined;
}

function normalizeGatewayInput(input: string): string {
  const base = input.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Gateway URL is required');
  }
  return base;
}

/**
 * Gateway config port for ARA execution (`PostTargetQuery` / `/config/target_query`)
 * and SAML/OIDC browser login — same as CLI `--gateway-url`.
 *
 * Accepts either `https://gw:8000` or `https://gw:8000/api/v2` and always returns
 * the config-port base URL without `/api/v2`.
 */
export function parseAraGatewayUrl(input: string): string {
  const base = normalizeGatewayInput(input);
  if (base.toLowerCase().endsWith(API_V2_SUFFIX)) {
    return base.slice(0, -API_V2_SUFFIX.length);
  }
  return base;
}

/**
 * SDK API base for auth and list-secrets.
 * Accepts either `https://gw:8000` or `https://gw:8000/api/v2` and always returns
 * the URL with an `/api/v2` suffix.
 */
export function parseSdkGatewayUrl(input: string): string {
  const base = normalizeGatewayInput(input);
  if (base.toLowerCase().endsWith(API_V2_SUFFIX)) {
    return base;
  }
  return `${base}${API_V2_SUFFIX}`;
}

/**
 * Derive SDK and ARA URLs from a single Gateway address.
 * - SDK auth + list-secrets → `https://gw:8000/api/v2`
 * - query-db / service-execute → `https://gw:8000`
 */
function resolveGatewayUrls(
  overrides: AkeylessConfigInput,
): Pick<AkeylessConfig, 'gatewayUrl' | 'araGatewayUrl'> {
  const araOverride =
    overrides.araGatewayUrl ?? readEnv('AKEYLESS_ARA_GATEWAY_URL');
  const sdkOverride = overrides.gatewayUrl ?? readEnv('AKEYLESS_API_URL');
  const rawGatewayInput =
    overrides.gatewayInputUrl ?? readEnv('AKEYLESS_GATEWAY_URL');

  if (!rawGatewayInput?.trim() && !sdkOverride?.trim()) {
    return {
      gatewayUrl: '',
      araGatewayUrl: araOverride ?? '',
    };
  }

  const raw = rawGatewayInput?.trim() ?? sdkOverride?.trim() ?? '';
  const araGatewayUrl = araOverride ?? parseAraGatewayUrl(raw);
  const gatewayUrl = sdkOverride ?? parseSdkGatewayUrl(raw);

  return {
    gatewayUrl,
    araGatewayUrl,
  };
}

export function configFromEnv(
  overrides: AkeylessConfigInput = {},
): AkeylessConfig {
  const accessType =
    overrides.accessType ?? parseAccessType(readEnv('AKEYLESS_ACCESS_TYPE'));
  const { gatewayUrl, araGatewayUrl } = resolveGatewayUrls(overrides);

  return {
    gatewayUrl,
    araGatewayUrl,
    defaultSecretName:
      overrides.defaultSecretName ?? readEnv('AKEYLESS_DEFAULT_SECRET_NAME'),
    agentId:
      overrides.agentId ??
      readEnv('AKEYLESS_AGENT_ID') ??
      DEFAULT_AGENT_ID,
    mcpId: overrides.mcpId ?? readEnv('AKEYLESS_MCP_ID') ?? randomUUID(),
    accessType,
    accessId: overrides.accessId ?? readEnv('AKEYLESS_ACCESS_ID'),
    accessKey:
      overrides.accessKey ??
      readEnv('AKEYLESS_ACCESS_KEY') ??
      readEnv('AKEYLESS_API_KEY'),
    uidToken:
      overrides.uidToken ??
      readEnv('AKEYLESS_UID_TOKEN') ??
      readEnv('AKEYLESS_UNIVERSAL_IDENTITY_TOKEN'),
    uidTokenFile:
      overrides.uidTokenFile ??
      readEnv('AKEYLESS_UID_TOKEN_FILE') ??
      DEFAULT_UID_TOKEN_FILE,
    jwt: overrides.jwt ?? readEnv('AKEYLESS_JWT'),
    token: overrides.token ?? readEnv('AKEYLESS_TOKEN'),
    cloudId: overrides.cloudId ?? readEnv('AKEYLESS_CLOUD_ID'),
    cloudProvider:
      overrides.cloudProvider ?? cloudProviderForAccessType(accessType),
    tokenExpiryMarginMs:
      overrides.tokenExpiryMarginMs ?? DEFAULT_TOKEN_EXPIRY_MARGIN_MS,
  };
}

export function validateConfig(config: AkeylessConfig): void {
  if (!config.gatewayUrl.trim() || !config.araGatewayUrl.trim()) {
    throw new Error(
      'Gateway URL is required (set AKEYLESS_GATEWAY_URL to your Gateway address, e.g. https://gw.example.com:8000/api/v2)',
    );
  }

  if (config.token?.trim()) {
    return;
  }

  switch (config.accessType) {
    case 'access_key':
      if (!config.accessId?.trim() || !config.accessKey?.trim()) {
        throw new Error(
          'accessId and accessKey are required for access_key authentication (or set AKEYLESS_TOKEN)',
        );
      }
      break;
    case 'universal_identity':
      if (!config.uidToken?.trim() && !config.uidTokenFile?.trim()) {
        throw new Error(
          'Universal Identity requires AKEYLESS_UID_TOKEN_FILE or AKEYLESS_UID_TOKEN (or set AKEYLESS_TOKEN)',
        );
      }
      break;
    case 'saml':
    case 'oidc':
      if (!config.accessId?.trim()) {
        throw new Error(
          `${config.accessType} authentication requires accessId`,
        );
      }
      break;
    case 'jwt':
      if (!config.accessId?.trim() || !config.jwt?.trim()) {
        throw new Error(
          'accessId and jwt are required for jwt authentication (or set AKEYLESS_TOKEN)',
        );
      }
      break;
    case 'aws_iam':
    case 'azure_ad':
    case 'gcp':
      if (!config.accessId?.trim()) {
        throw new Error(
          `${config.accessType} authentication requires accessId (or set AKEYLESS_TOKEN)`,
        );
      }
      break;
    default:
      throw new Error(`Unsupported access type: ${config.accessType as string}`);
  }
}

/** @deprecated Use parseSdkGatewayUrl and parseAraGatewayUrl */
export function parseGatewayUrls(input: string): {
  apiUrl: string;
  araGatewayUrl: string;
} {
  return {
    apiUrl: parseSdkGatewayUrl(input),
    araGatewayUrl: parseAraGatewayUrl(input),
  };
}
