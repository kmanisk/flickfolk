import { createApp } from "./server.js";
import { log } from "./log.js";
const { http, shutdown } = createApp();
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
http.on("error", (error: NodeJS.ErrnoException) => {
  log("server_error", { code: error.code || "UNKNOWN" });
  process.exitCode = 1;
});
http.listen(port, process.env.HOST || "0.0.0.0", () =>
  log("listening", {
    port,
    environment: process.env.NODE_ENV || "development",
  }),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log("shutdown_start", { signal });
    const deadline = setTimeout(() => {
      log("shutdown_timeout");
      http.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();
    void shutdown().then(() => {
      clearTimeout(deadline);
      log("shutdown_complete");
    });
  });
