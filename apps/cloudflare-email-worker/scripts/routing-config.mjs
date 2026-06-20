import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import parseAddress from "email-addresses";

import { SCRIPT_NAME } from "./cloudflare-api.mjs";

const DEFAULT_CONFIG_URL = new URL("../config/email-routing.json", import.meta.url);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function optionalString(value, label) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string when set`);
  }
  return value.trim();
}

function requireString(value, label) {
  const result = optionalString(value, label);
  if (result === "") {
    throw new Error(`missing ${label}`);
  }
  return result;
}

function normalizeAddress(value, label) {
  const rawValue = requireString(value, label);
  const parsed = parseAddress({ input: rawValue, rfc6532: true });
  if (!parsed || !Array.isArray(parsed.addresses) || parsed.addresses.length !== 1) {
    throw new Error(`${label} must be one mailbox address`);
  }
  const mailbox = parsed.addresses[0];
  if (mailbox.type !== "mailbox" || !mailbox.local || !mailbox.domain) {
    throw new Error(`${label} must be one mailbox address`);
  }
  return `${mailbox.local.toLowerCase()}@${mailbox.domain.toLowerCase()}`;
}

export async function loadRoutingConfig() {
  const configuredPath = process.env.AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG?.trim();
  const configPath = configuredPath ? resolve(configuredPath) : fileURLToPath(DEFAULT_CONFIG_URL);
  const raw = await readFile(configPath, "utf8");
  const parsed = requireObject(JSON.parse(raw), "routing config");

  const zones = parsed.zones === undefined ? [] : parsed.zones;
  if (!Array.isArray(zones)) {
    throw new Error("routing config zones must be an array");
  }

  const routes = parsed.routes === undefined ? [] : parsed.routes;
  if (!Array.isArray(routes)) {
    throw new Error("routing config routes must be an array");
  }

  return {
    path: configPath,
    zones: zones.map((zone, index) => normalizeZone(zone, `zones[${index}]`)),
    routes: routes.map((route, index) => normalizeRoute(route, `routes[${index}]`))
  };
}

export function zoneNamesForStatus(config) {
  const names = new Set();
  for (const zone of config.zones) {
    names.add(zone.zoneName);
  }
  for (const route of config.routes) {
    names.add(route.zoneName);
  }
  return [...names].sort();
}

export function validateCatchAllOnlyConfig(config) {
  requireObject(config, "routing config");
  if (!Array.isArray(config.zones)) {
    throw new Error("routing config zones must be an array");
  }
  if (!Array.isArray(config.routes)) {
    throw new Error("routing config routes must be an array");
  }

  const zones = new Map();
  for (const zone of config.zones) {
    if (zones.has(zone.zoneName)) {
      throw new Error(`routing config contains duplicate zone ${zone.zoneName}`);
    }
    zones.set(zone.zoneName, zone);
  }

  const enabledCatchAllByZone = new Map();
  for (const route of config.routes) {
    if (route.mode !== "catch-all") {
      throw new Error(`${route.label} uses ${route.mode} mode; Agent Mail zones must use catch-all routes only`);
    }
    if (!zones.has(route.zoneName)) {
      throw new Error(`${route.label} references undeclared zone ${route.zoneName}`);
    }
    if (!route.enabled) {
      continue;
    }
    const existing = enabledCatchAllByZone.get(route.zoneName);
    if (existing) {
      throw new Error(
        `${route.label} creates a second enabled catch-all route for zone ${route.zoneName}; first route is ${existing.label}`
      );
    }
    enabledCatchAllByZone.set(route.zoneName, route);
  }

  const targets = [];
  for (const zoneName of [...zones.keys()].sort()) {
    const route = enabledCatchAllByZone.get(zoneName);
    if (!route) {
      throw new Error(`zone ${zoneName} must have exactly one enabled catch-all route`);
    }
    targets.push({ zoneName, route });
  }
  return targets;
}

export function routeName(route, address) {
  if (route.name !== "") {
    return `${SCRIPT_NAME}:${route.name}`;
  }
  return `${SCRIPT_NAME}:${address}`;
}

function normalizeZone(zone, label) {
  const object = requireObject(zone, label);
  return {
    zoneName: requireString(object.zone_name, `${label}.zone_name`)
  };
}

function normalizeRoute(route, label) {
  const object = requireObject(route, label);
  const mode = requireString(object.mode, `${label}.mode`);
  if (mode !== "catch-all" && mode !== "literal") {
    throw new Error(`${label}.mode must be "catch-all" or "literal"`);
  }

  const normalized = {
    label,
    enabled: object.enabled !== false,
    mode,
    name: optionalString(object.name, `${label}.name`),
    zoneName: requireString(object.zone_name, `${label}.zone_name`),
    address: "",
    domain: "",
    localPart: ""
  };

  if (mode === "literal") {
    normalized.address =
      object.address === undefined ? "" : normalizeAddress(object.address, `${label}.address`);
    normalized.domain =
      object.domain === undefined ? "" : requireString(object.domain, `${label}.domain`).toLowerCase();
    normalized.localPart =
      object.local_part === undefined
        ? ""
        : requireString(object.local_part, `${label}.local_part`).toLowerCase();
  }

  return normalized;
}
