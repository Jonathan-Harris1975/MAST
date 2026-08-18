export function isProductionEnvironment(value) {
  return ["production", "prod"].includes(String(value || "").trim().toLowerCase());
}

export function assertProductionSecurityConfig({ appEnv, allowPublicManualRuns, stateStatus }) {
  if (!isProductionEnvironment(appEnv)) return;
  if (allowPublicManualRuns) {
    throw new Error("ALLOW_PUBLIC_MANUAL_RUNS cannot be enabled in production.");
  }
  if (!stateStatus?.ready || !stateStatus?.durable || stateStatus?.backend !== "r2") {
    throw new Error("Production MAST requires a configured, ready R2 state backend before the scheduler can start.");
  }
}
