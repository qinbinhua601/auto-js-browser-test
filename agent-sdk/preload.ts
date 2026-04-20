import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

import type {
  KmBridgeApi,
  KmEventChannel,
  KmEventMap,
  KmInvokeChannel,
  KmInvokeRequestMap,
  KmInvokeResponseMap,
  Unsubscribe,
} from "./types";

const allowedInvokeChannels: KmInvokeChannel[] = [
  "device:get-info",
  "user:get-token",
  "window:set-title",
];

const allowedEventChannels: KmEventChannel[] = ["theme:changed"];

const kmBridge: KmBridgeApi = {
  invoke(channel, payload) {
    if (!allowedInvokeChannels.includes(channel)) {
      return Promise.reject(new Error(`Unsupported bridge channel: ${channel}`));
    }

    return ipcRenderer.invoke(
      channel,
      payload
    ) as Promise<KmInvokeResponseMap[typeof channel]>;
  },

  on(channel, listener) {
    if (!allowedEventChannels.includes(channel)) {
      throw new Error(`Unsupported bridge event: ${channel}`);
    }

    const wrappedListener = (
      _event: IpcRendererEvent,
      payload: KmEventMap[typeof channel]
    ) => {
      listener(payload);
    };

    ipcRenderer.on(channel, wrappedListener);

    const unsubscribe: Unsubscribe = () => {
      ipcRenderer.removeListener(channel, wrappedListener);
    };

    return unsubscribe;
  },
};

contextBridge.exposeInMainWorld("kmBridge", kmBridge);
