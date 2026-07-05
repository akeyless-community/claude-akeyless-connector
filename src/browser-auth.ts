import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const AUTH_TIMEOUT_MS = 2 * 60 * 1000;

export interface BrowserAuthResult {
  token: string;
  creds?: Record<string, unknown>;
  expiration?: string;
}

interface BrowserAuthOptions {
  accessType: 'saml' | 'oidc';
  authBaseUrl: string;
  accessId: string;
  port?: number;
}

function buildLoginPath(accessType: 'saml' | 'oidc'): string {
  return accessType === 'saml' ? '/api/saml-login' : '/api/oidc-login';
}

export function buildAuthUrl(
  authBaseUrl: string,
  accessType: 'saml' | 'oidc',
  accessId: string,
  redirectUri: string,
): string {
  const base = authBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${buildLoginPath(accessType)}`);
  url.searchParams.set('access_id', accessId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('is_use_short_token', 'true');
  return url.toString();
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === 'darwin') {
    await execFileAsync('open', [url]);
    return;
  }
  if (platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url]);
    return;
  }
  await execFileAsync('xdg-open', [url]);
}

function writeSuccessPage(res: import('node:http').ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    '<html><body><p><strong>Authentication succeeded.</strong> You may close this tab and return to Claude Desktop.</p></body></html>',
  );
}

function writeErrorPage(res: import('node:http').ServerResponse, message: string): void {
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<html><body><p><strong>Authentication failed.</strong> ${message}</p></body></html>`);
}

function parseCredsParam(creds: string): BrowserAuthResult {
  const parsed = JSON.parse(creds) as {
    token?: string;
    creds?: Record<string, unknown>;
    expiration?: string;
  };
  const token = parsed.token?.trim();
  if (!token) {
    throw new Error('Authentication response did not include a token');
  }
  return {
    token,
    creds: parsed.creds,
    expiration: parsed.expiration,
  };
}

function startCallbackServer(port: number): {
  redirectUri: string;
  waitForAuth: Promise<BrowserAuthResult>;
  close: () => void;
} {
  let server: Server | undefined;

  const waitForAuth = new Promise<BrowserAuthResult>((resolve, reject) => {
    server = createServer((req, res) => {
      if (!req.url || req.url.split('?')[0] !== '/') {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://127.0.0.1');
      const error = url.searchParams.get('error');
      if (error) {
        writeErrorPage(res, error);
        reject(new Error(`Authentication failed: ${error}`));
        return;
      }

      const creds = url.searchParams.get('creds');
      if (!creds) {
        writeErrorPage(res, 'Missing credentials in callback');
        reject(new Error('Authentication callback did not include credentials'));
        return;
      }

      try {
        const result = parseCredsParam(creds);
        writeSuccessPage(res);
        resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeErrorPage(res, message);
        reject(new Error(message));
      }
    });

    server.listen(port, '127.0.0.1');
  });

  const redirectUri = `http://127.0.0.1:${port}`;
  return {
    redirectUri,
    waitForAuth,
    close: () => server?.close(),
  };
}

export async function authenticateWithBrowser(
  options: BrowserAuthOptions,
): Promise<BrowserAuthResult> {
  if (!options.accessId.trim()) {
    throw new Error('Access ID is required for SAML/OIDC authentication');
  }

  const port = options.port ?? (options.accessType === 'saml' ? 11136 : 11137);
  const callback = startCallbackServer(port);
  const authUrl = buildAuthUrl(
    options.authBaseUrl,
    options.accessType,
    options.accessId.trim(),
    callback.redirectUri,
  );

  process.stderr.write(
    `[akeyless-claude-mcp] Opening browser for ${options.accessType.toUpperCase()} login...\n`,
  );
  process.stderr.write(`[akeyless-claude-mcp] ${authUrl}\n`);

  try {
    await openBrowser(authUrl);
  } catch {
    process.stderr.write(
      '[akeyless-claude-mcp] Could not open a browser automatically. Open the URL above manually.\n',
    );
  }

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`${options.accessType} authentication timed out after 2 minutes`)),
      AUTH_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([callback.waitForAuth, timeout]);
  } finally {
    callback.close();
  }
}
