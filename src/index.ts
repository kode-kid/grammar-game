import { buildServer } from "./app.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  const server = await buildServer();
  await server.listen({ host, port });
  server.log.info(`Portuguese verb game backend running on ${host}:${port}`);
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
