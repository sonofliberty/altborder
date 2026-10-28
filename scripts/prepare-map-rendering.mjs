import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Load the application algorithms for offline use without opening a listener. */
export async function buildMapRenderPreparation(data) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const server = await createServer({
    root,
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  try {
    const module = await server.ssrLoadModule("/scripts/map-render-preparation.ts");
    return module.buildMapRenderPreparation(data);
  } finally {
    await server.close();
  }
}
