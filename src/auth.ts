import * as akeyless from 'akeyless';
import * as akeylessCloudId from 'akeyless-cloud-id';
import { authenticateWithBrowser } from './browser-auth';
import type { AkeylessConfig } from './types';
import { readUidTokenFromFile } from './uid-token';

const ACCESS_KEY_DEFAULT_TTL_MS = 14 * 60 * 1000;
const ENV_TOKEN_TTL_MS = 50 * 60 * 1000;

export interface AuthSession {
  token: string;
  expiresAtMs: number;
  creds?: Record<string, unknown>;
}

function expiryFromAuthOutput(
  authOut: { expiration?: string },
  marginMs: number,
): number {
  const exp = authOut?.expiration?.trim();
  const now = Date.now();
  if (!exp) {
    return now + ACCESS_KEY_DEFAULT_TTL_MS - marginMs;
  }

  const asNum = Number(exp);
  if (Number.isFinite(asNum) && asNum > 1e12) {
    return asNum - marginMs;
  }

  const asDate = Date.parse(exp);
  if (Number.isFinite(asDate)) {
    return asDate - marginMs;
  }

  return now + ACCESS_KEY_DEFAULT_TTL_MS - marginMs;
}

function expiryFromBrowserAuth(
  expiration: string | undefined,
  marginMs: number,
): number {
  if (expiration?.trim()) {
    return expiryFromAuthOutput({ expiration }, marginMs);
  }
  return Date.now() + ENV_TOKEN_TTL_MS;
}

function resolveUidToken(config: AkeylessConfig): string {
  if (config.uidToken?.trim()) {
    return config.uidToken.trim();
  }
  return readUidTokenFromFile(config.uidTokenFile ?? '');
}

function getCloudId(
  provider: NonNullable<AkeylessConfig['cloudProvider']>,
  explicitCloudId?: string,
): Promise<string> {
  if (explicitCloudId?.trim()) {
    return Promise.resolve(explicitCloudId.trim());
  }

  return new Promise((resolve, reject) => {
    akeylessCloudId.getCloudId(provider, '', (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      if (!res?.trim()) {
        reject(
          new Error(
            `akeyless-cloud-id returned an empty cloud ID for provider "${provider}".`,
          ),
        );
        return;
      }
      resolve(res.trim());
    });
  });
}

export async function authenticate(
  api: akeyless.V2Api,
  config: AkeylessConfig,
): Promise<AuthSession> {
  const now = Date.now();

  if (config.token?.trim()) {
    return {
      token: config.token.trim(),
      expiresAtMs: now + ENV_TOKEN_TTL_MS,
    };
  }

  if (config.accessType === 'saml' || config.accessType === 'oidc') {
    const browserAuth = await authenticateWithBrowser({
      accessType: config.accessType,
      authBaseUrl: config.araGatewayUrl,
      accessId: config.accessId ?? '',
    });

    return {
      token: browserAuth.token,
      expiresAtMs: expiryFromBrowserAuth(
        browserAuth.expiration,
        config.tokenExpiryMarginMs,
      ),
      creds: browserAuth.creds,
    };
  }

  let authBody: Record<string, unknown>;

  switch (config.accessType) {
    case 'access_key':
      authBody = {
        'access-id': config.accessId,
        'access-type': 'access_key',
        'access-key': config.accessKey,
      };
      break;
    case 'universal_identity':
      authBody = {
        'access-type': 'universal_identity',
        'uid-token': resolveUidToken(config),
      };
      break;
    case 'jwt':
      authBody = {
        'access-id': config.accessId,
        'access-type': 'jwt',
        jwt: config.jwt,
      };
      break;
    case 'aws_iam':
    case 'azure_ad':
    case 'gcp': {
      const cloudId = await getCloudId(config.accessType, config.cloudId);
      authBody = {
        'access-id': config.accessId,
        'access-type': config.accessType,
        'cloud-id': cloudId,
      };
      break;
    }
    default:
      throw new Error(`Unsupported access type: ${config.accessType as string}`);
  }

  const authOut = await api.auth(akeyless.Auth.constructFromObject(authBody));
  const token = authOut?.token?.trim();
  if (!token) {
    throw new Error('Akeyless authentication did not return a token');
  }

  const creds =
    authOut?.creds && typeof authOut.creds === 'object'
      ? (authOut.creds as Record<string, unknown>)
      : undefined;

  return {
    token,
    expiresAtMs: expiryFromAuthOutput(authOut, config.tokenExpiryMarginMs),
    creds,
  };
}
