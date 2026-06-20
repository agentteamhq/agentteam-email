import test from "node:test";
import assert from "node:assert/strict";

import { loadRoutingConfig, validateCatchAllOnlyConfig } from "../scripts/routing-config.mjs";
import { evaluateRoutingStatus, reconcileRouting } from "../scripts/routing-reconcile.mjs";

test("checked-in routing config is an empty bootstrap input", async () => {
  const previousConfigPath = process.env.AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG;
  delete process.env.AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG;
  let config;
  let targets;
  try {
    config = await loadRoutingConfig();
    targets = validateCatchAllOnlyConfig(config);
  } finally {
    if (previousConfigPath === undefined) {
      delete process.env.AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG;
    } else {
      process.env.AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG = previousConfigPath;
    }
  }

  assert.deepEqual(config.zones, []);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(targets, []);
});

test("catch-all-only validation rejects literal routing config", () => {
  assert.throws(
    () =>
      validateCatchAllOnlyConfig({
        zones: [{ zoneName: "example.com" }],
        routes: [
          {
            label: "routes[0]",
            enabled: true,
            mode: "literal",
            name: "bounces",
            zoneName: "example.com",
            address: "bounces@example.com",
            domain: "",
            localPart: ""
          }
        ]
      }),
    /catch-all routes only/
  );
});

test("reconcileRouting sets catch-all before deleting every regular rule", async () => {
  const calls = [];
  const api = {
    async resolveZoneID(zoneName) {
      assert.equal(zoneName, "example.com");
      return "zone-123";
    },
    async cloudflareRequest(path, options = {}) {
      calls.push({ path, options });
      if (path === "/zones/zone-123/email/routing/rules/catch_all" && options.method === "PUT") {
        return {
          id: "catch-all",
          enabled: true,
          actions: [{ type: "worker", value: ["agent-mail-ingress"] }],
          matchers: [{ type: "all" }]
        };
      }
      if (path === "/zones/zone-123/email/routing/rules" && options.method === undefined) {
        return [
          literalRule("rule-info", "info@example.com"),
          literalRule("rule-support", "support@example.com"),
          literalRule("rule-bounces", "bounces@example.com")
        ];
      }
      if (path.startsWith("/zones/zone-123/email/routing/rules/") && options.method === "DELETE") {
        return { id: path.split("/").at(-1) };
      }
      throw new Error(`unexpected fake Cloudflare call ${options.method ?? "GET"} ${path}`);
    }
  };

  const result = await reconcileRouting(
    {
      path: "test-config.json",
      zones: [{ zoneName: "example.com" }],
      routes: [
        {
          label: "routes[0]",
          enabled: true,
          mode: "catch-all",
          name: "catch-all",
          zoneName: "example.com",
          address: "",
          domain: "",
          localPart: ""
        }
      ]
    },
    api
  );

  assert.deepEqual(
    calls.map((call) => `${call.options.method ?? "GET"} ${call.path}`),
    [
      "PUT /zones/zone-123/email/routing/rules/catch_all",
      "GET /zones/zone-123/email/routing/rules",
      "DELETE /zones/zone-123/email/routing/rules/rule-info",
      "DELETE /zones/zone-123/email/routing/rules/rule-support",
      "DELETE /zones/zone-123/email/routing/rules/rule-bounces"
    ]
  );
  assert.equal(result.zones[0].deleted_rules.length, 3);
});

test("routing status fails when regular rules remain", () => {
  const evaluation = evaluateRoutingStatus([
    {
      zone_name: "example.com",
      catch_all: {
        enabled: true,
        actions: [{ type: "worker", value: ["agent-mail-ingress"] }],
        matchers: [{ type: "all" }]
      },
      rules: [literalRule("rule-bounces", "bounces@example.com")]
    }
  ]);

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.failures[0].reason, /non-catch-all/);
});

test("routing status tolerates catch-all in regular rules listing", () => {
  const catchAll = {
    id: "catch-all",
    enabled: true,
    actions: [{ type: "worker", value: ["agent-mail-ingress"] }],
    matchers: [{ type: "all" }]
  };
  const evaluation = evaluateRoutingStatus([
    {
      zone_name: "example.com",
      catch_all: catchAll,
      rules: [catchAll]
    }
  ]);

  assert.equal(evaluation.ok, true);
});

function literalRule(id, address) {
  return {
    id,
    name: `legacy:${address}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: address }],
    actions: [{ type: "worker", value: ["agent-mail-ingress"] }]
  };
}
