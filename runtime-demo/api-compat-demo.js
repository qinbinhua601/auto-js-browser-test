export function runRuntimeCompatDemo() {
  fetch("/api/demo");
  new ResizeObserver(() => {});
  return URL.canParse("https://example.com");
}
