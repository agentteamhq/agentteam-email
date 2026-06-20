import { loadRoutingConfig } from "./routing-config.mjs";
import { reconcileRouting } from "./routing-reconcile.mjs";

const config = await loadRoutingConfig();
const result = await reconcileRouting(config);

console.log(JSON.stringify(result, null, 2));
