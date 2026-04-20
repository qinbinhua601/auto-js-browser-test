import { createKmSdk } from "./bridge-client";

const sdk = createKmSdk();

async function bootstrap() {
  const deviceInfo = await sdk.device.getInfo();
  console.log("device info", deviceInfo);

  const tokenInfo = await sdk.user.getToken();
  console.log("token info", tokenInfo);

  await sdk.window.setTitle("KM Web App");

  const disposeThemeListener = sdk.events.onThemeChanged((payload) => {
    document.documentElement.dataset.theme = payload.theme;
  });

  window.addEventListener("beforeunload", () => {
    disposeThemeListener();
  });
}

bootstrap().catch((error) => {
  console.error("bridge bootstrap failed", error);
});
