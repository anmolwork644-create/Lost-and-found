import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

let httpServer;

async function start() {
  if (env.MONGODB_URI) {
    await connectDatabase(env.MONGODB_URI, env.MONGODB_DB);
  } else {
    console.warn("MONGODB_URI is not set; API starts in health-check-only mode.");
  }

  httpServer = app.listen(env.PORT, () =>
    console.info(`CampusFind API listening on port ${env.PORT}`),
  );
}

async function shutdown(signal) {
  console.info(`${signal} received; shutting down`);
  httpServer?.close(async () => {
    const { default: mongoose } = await import("mongoose");
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exit(1);
});
