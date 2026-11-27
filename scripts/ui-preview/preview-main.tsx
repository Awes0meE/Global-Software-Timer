// Preview entry (swapped in for /src/main.tsx by vite.config.ts): ?poster= opens the poster route,
// anything else starts the app as usual.
const params = new URLSearchParams(window.location.search);

if (params.has("poster")) {
  void import("./poster-route").then(({ mountPosterRoute }) => mountPosterRoute(params));
} else {
  void import("../../src/main");
  void import("./motion-switch").then(({ mountMotionSwitch }) => mountMotionSwitch(params));
}
