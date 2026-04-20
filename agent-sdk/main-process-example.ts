import { BrowserWindow, ipcMain } from "electron";

export function registerKmBridgeHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle("device:get-info", async () => {
    return {
      appVersion: "1.0.0",
      os: process.platform,
      platform: process.arch,
    };
  });

  ipcMain.handle(
    "user:get-token",
    async (_event, payload?: { forceRefresh?: boolean }) => {
      return {
        token: payload?.forceRefresh ? "fresh-token" : "cached-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    }
  );

  ipcMain.handle("window:set-title", async (_event, payload: { title: string }) => {
    mainWindow.setTitle(payload.title);
    return { success: true as const };
  });
}

export function emitThemeChanged(
  mainWindow: BrowserWindow,
  theme: "light" | "dark"
) {
  mainWindow.webContents.send("theme:changed", { theme });
}
