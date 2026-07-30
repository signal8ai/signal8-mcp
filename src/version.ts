/**
 * Package version constants.
 *
 * Single source of truth for the package version across the codebase
 * (server factory, HTTP/stdio transports, User-Agent header). Keep this
 * value in sync with package.json + server.json when bumping releases.
 */
export const VERSION = '0.14.0';
export const PACKAGE_NAME = '@signal8ai/mcp';
export const USER_AGENT = `${PACKAGE_NAME}/${VERSION}`;
