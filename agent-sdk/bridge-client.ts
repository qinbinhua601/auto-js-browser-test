import type { KmBridgeApi, Unsubscribe } from "./types";

export class BridgeUnavailableError extends Error {
  constructor() {
    super("kmBridge is unavailable in the current runtime.");
    this.name = "BridgeUnavailableError";
  }
}

export type CreateKmSdkOptions = {
  bridge?: KmBridgeApi;
  timeoutMs?: number;
};

function getBridge(override?: KmBridgeApi): KmBridgeApi {
  const bridge = override ?? window.kmBridge;
  if (!bridge) {
    throw new BridgeUnavailableError();
  }
  return bridge;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Bridge call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function createKmSdk(options: CreateKmSdkOptions = {}) {
  const bridge = getBridge(options.bridge);
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    device: {
      getInfo() {
        return withTimeout(bridge.invoke("device:get-info", undefined), timeoutMs);
      },
    },

    user: {
      getToken(payload?: { forceRefresh?: boolean }) {
        return withTimeout(bridge.invoke("user:get-token", payload), timeoutMs);
      },
    },

    window: {
      setTitle(title: string) {
        return withTimeout(
          bridge.invoke("window:set-title", { title }),
          timeoutMs
        );
      },
    },

    events: {
      onThemeChanged(listener: (payload: { theme: "light" | "dark" }) => void): Unsubscribe {
        return bridge.on("theme:changed", listener);
      },
    },
  };
}
