export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadServerEnv } = await import("./lib/server-env");
    const { validateServerEnv } = await import("./lib/env-schema");
    loadServerEnv();
    validateServerEnv(process.env);
  }
}
