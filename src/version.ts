import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);

interface PackageJson {
  version: string;
}

const connectorPkg = nodeRequire('../package.json') as PackageJson;
const akeylessPkg = nodeRequire('akeyless/package.json') as PackageJson;

export const CONNECTOR_VERSION = connectorPkg.version;
export const AKEYLESS_SDK_VERSION = akeylessPkg.version;

export function formatServerVersion(): string {
  return `${CONNECTOR_VERSION} (akeyless SDK ${AKEYLESS_SDK_VERSION})`;
}
