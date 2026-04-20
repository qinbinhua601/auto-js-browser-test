# km-sdk

Electron JS Bridge template for a new web page loaded inside an Electron window.

## Recommendation

Do not let the page call Electron primitives directly.

Use this split instead:

1. `preload.ts`
   Expose a minimal whitelist through `contextBridge`.
2. `bridge-client.ts`
   Wrap preload APIs into a page-friendly SDK.
3. `types.ts`
   Keep the contract stable and typed.

This gives you:

- smaller attack surface
- stable renderer-side API
- easier mocking in a normal browser
- centralized timeout and error handling
- cleaner future versioning

## Suggested usage

### 1. Preload side

Register `preload.ts` as your BrowserWindow preload script and keep `contextIsolation: true`.

### 2. Renderer side

Import `createKmSdk()` in the page app and use:

```ts
const sdk = createKmSdk();

await sdk.device.getInfo();
await sdk.user.getToken();
sdk.events.onThemeChanged((payload) => {
  console.log(payload.theme);
});
```

## Security notes

- Do not expose `ipcRenderer` directly to the page.
- Only expose explicit methods and explicit event channels.
- Validate request payloads in Electron main/preload.
- Keep channel names internal to Electron code when possible.

## Files

- `types.ts`: shared bridge contract
- `preload.ts`: safe Electron bridge exposure
- `bridge-client.ts`: page-facing SDK wrapper
- `usage-example.ts`: page usage example
