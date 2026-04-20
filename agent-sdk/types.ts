export type KmInvokeRequestMap = {
  "device:get-info": undefined;
  "user:get-token": {
    forceRefresh?: boolean;
  } | undefined;
  "window:set-title": {
    title: string;
  };
};

export type KmInvokeResponseMap = {
  "device:get-info": {
    appVersion: string;
    os: string;
    platform: string;
  };
  "user:get-token": {
    token: string;
    expiresAt?: string;
  };
  "window:set-title": {
    success: true;
  };
};

export type KmEventMap = {
  "theme:changed": {
    theme: "light" | "dark";
  };
};

export type KmInvokeChannel = keyof KmInvokeRequestMap;
export type KmEventChannel = keyof KmEventMap;

export type Unsubscribe = () => void;

export type KmBridgeApi = {
  invoke<C extends KmInvokeChannel>(
    channel: C,
    payload: KmInvokeRequestMap[C]
  ): Promise<KmInvokeResponseMap[C]>;
  on<C extends KmEventChannel>(
    channel: C,
    listener: (payload: KmEventMap[C]) => void
  ): Unsubscribe;
};

declare global {
  interface Window {
    kmBridge?: KmBridgeApi;
  }
}
