import { SCRIPT_NAME, cloudflareRequest, resolveZoneID } from "./cloudflare-api.mjs";
import { routeName, validateCatchAllOnlyConfig } from "./routing-config.mjs";

export async function reconcileRouting(config, api = defaultAPI()) {
  const targets = validateCatchAllOnlyConfig(config);
  const zones = [];

  for (const target of targets) {
    const zoneID = await api.resolveZoneID(target.zoneName);
    const name = routeName(target.route, `${target.zoneName}:catch-all`);
    const catchAll = await api.cloudflareRequest(`/zones/${zoneID}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: catchAllBody(name)
    });

    const rules = requireArray(
      await api.cloudflareRequest(`/zones/${zoneID}/email/routing/rules`),
      `${target.zoneName} regular routing rules`
    );
    const deletedRules = [];
    for (const rule of nonCatchAllRules(rules)) {
      await api.cloudflareRequest(`/zones/${zoneID}/email/routing/rules/${rule.id}`, {
        method: "DELETE"
      });
      deletedRules.push(ruleSummary(rule));
    }

    zones.push({
      zone_name: target.zoneName,
      zone_id: zoneID,
      catch_all: catchAll,
      deleted_rules: deletedRules
    });
  }

  return {
    config: config.path,
    script: SCRIPT_NAME,
    zones
  };
}

export async function collectRoutingStatus(config, api = defaultAPI()) {
  const targets = validateCatchAllOnlyConfig(config);
  const zones = [];

  for (const target of targets) {
    const zoneID = await api.resolveZoneID(target.zoneName);
    const [catchAll, rulesResult] = await Promise.all([
      api.cloudflareRequest(`/zones/${zoneID}/email/routing/rules/catch_all`),
      api.cloudflareRequest(`/zones/${zoneID}/email/routing/rules`)
    ]);
    const rules = requireArray(rulesResult, `${target.zoneName} regular routing rules`);
    zones.push({
      zone_name: target.zoneName,
      zone_id: zoneID,
      catch_all: catchAll,
      rules: nonCatchAllRules(rules)
    });
  }

  const evaluation = evaluateRoutingStatus(zones);
  return {
    config: config.path,
    script: SCRIPT_NAME,
    ok: evaluation.ok,
    failures: evaluation.failures,
    zones
  };
}

export function evaluateRoutingStatus(zones) {
  const failures = [];

  for (const zone of zones) {
    if (!isCatchAllWorkerRule(zone.catch_all)) {
      failures.push({
        zone_name: zone.zone_name,
        reason: "catch-all rule is not enabled for agent-mail-ingress"
      });
    }

    const remainingRules = Array.isArray(zone.rules) ? nonCatchAllRules(zone.rules) : [];
    if (remainingRules.length > 0) {
      failures.push({
        zone_name: zone.zone_name,
        reason: "non-catch-all routing rules remain",
        rules: remainingRules.map(ruleSummary)
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

export function catchAllBody(name) {
  return {
    actions: [{ type: "worker", value: [SCRIPT_NAME] }],
    enabled: true,
    matchers: [{ type: "all" }],
    name
  };
}

function isCatchAllWorkerRule(rule) {
  if (!rule || rule.enabled !== true) {
    return false;
  }

  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  const hasWorkerAction = actions.some((action) => {
    if (!action || action.type !== "worker" || !Array.isArray(action.value)) {
      return false;
    }
    return action.value.includes(SCRIPT_NAME);
  });
  if (!hasWorkerAction) {
    return false;
  }

  const matchers = Array.isArray(rule.matchers) ? rule.matchers : [];
  return matchers.some((matcher) => matcher && matcher.type === "all");
}

function nonCatchAllRules(rules) {
  return rules.filter((rule) => !isCatchAllWorkerRule(rule));
}

function ruleSummary(rule) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    matchers: rule.matchers,
    actions: rule.actions
  };
}

function defaultAPI() {
  return {
    cloudflareRequest,
    resolveZoneID
  };
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}
