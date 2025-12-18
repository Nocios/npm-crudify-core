import type { CrudifyLogLevel } from "./types";
import { logger } from "./logger";

// Detect if we're in a browser environment
export const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

export const _fetch = async (url: globalThis.RequestInfo, options?: globalThis.RequestInit): Promise<globalThis.Response> => {
  const { dispatcher, ...browserOptions } = options || ({} as any);

  // Use window.fetch in browser, globalThis.fetch in Node.js (v18+)
  if (IS_BROWSER) {
    return window.fetch(url, browserOptions);
  } else {
    return globalThis.fetch(url, browserOptions);
  }
};

export const shutdownNodeSpecifics = async (_logLevel?: CrudifyLogLevel): Promise<void> => {
  const env = IS_BROWSER ? "Browser" : "Node.js";
  logger.debug(`(${env}): shutdownNodeSpecifics called - no action needed.`);
};

export const getInternalNodeSpecificsSetupPromise = (): Promise<void> => {
  return Promise.resolve();
};
