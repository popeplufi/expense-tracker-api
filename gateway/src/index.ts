import { buildApp } from "./app.js";
import { config } from "./config.js";

async function start() {
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Gateway running on ${config.host}:${config.port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
