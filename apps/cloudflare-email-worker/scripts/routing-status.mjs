import { loadRoutingConfig } from "./routing-config.mjs";
import { collectRoutingStatus } from "./routing-reconcile.mjs";

const config = await loadRoutingConfig();
const report = await collectRoutingStatus(config);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
