// src/lib/appInsights.ts
import appInsights from "applicationinsights";

let started = false;

export function initAI() {
  if (started) return appInsights.defaultClient;
  const conn = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!conn) return null;

  appInsights.setup(conn)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setSendLiveMetrics(false)
    .start();

  started = true;
  return appInsights.defaultClient;
}