import {
  AKEYLESS_SDK_VERSION,
  CONNECTOR_VERSION,
  formatServerVersion,
} from './version';

describe('version', () => {
  it('reads connector version from package.json', () => {
    expect(CONNECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reads akeyless SDK version from the installed package', () => {
    expect(AKEYLESS_SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('formats a combined server version string', () => {
    expect(formatServerVersion()).toBe(
      `${CONNECTOR_VERSION} (akeyless SDK ${AKEYLESS_SDK_VERSION})`,
    );
  });
});
