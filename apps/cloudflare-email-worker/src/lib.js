import parseAddress from "email-addresses";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { v7 as uuidv7 } from "uuid";

export const WORKER_NAME = "agent-mail-ingress";
export const R2_BUCKET_NAME = "agent-mail-archive";
export const INBOUND_EDGE_SCHEMA = "agent-mail.inbound.edge.v1";
export const CLOUDFLARE_EDGE_EVIDENCE_SCHEMA = "agent-mail.cloudflare-edge-evidence.v1";
export const INBOUND_FAST_PATH_SCHEMA = "agent-mail.inbound.fastpath.v1";
export const INBOUND_FAST_PATH_PATH = "/agent-mail/ingest/v1";

const OBSERVED_AUTH_PROVENANCE_HEADERS = new Set([
  "authentication-results",
  "arc-authentication-results",
  "received-spf",
  "dkim-signature",
  "arc-seal",
  "arc-message-signature",
  "return-path",
  "received"
]);

export function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing ${label}`);
  }
  return value.trim();
}

export function requireFiniteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`missing ${label}`);
  }
  return number;
}

export function normalizeAddress(value) {
  const parsed = parseSingleMailbox(value);
  return `${parsed.local.toLowerCase()}@${parsed.domain.toLowerCase()}`;
}

export function canonicalDomainFromAddress(value) {
  return parseSingleMailbox(value).domain.toLowerCase();
}

function parseSingleMailbox(value) {
  const rawValue = requireString(value, "email address");
  const parsed = parseAddress({ input: rawValue, rfc6532: true });
  if (!parsed || !Array.isArray(parsed.addresses) || parsed.addresses.length !== 1) {
    throw new Error(`invalid email address for ${value}`);
  }
  const mailbox = parsed.addresses[0];
  if (mailbox.type !== "mailbox" || !mailbox.local || !mailbox.domain) {
    throw new Error(`invalid email address for ${value}`);
  }
  return mailbox;
}

export function getHeader(headers, name) {
  const value = headers.get(name);
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function readRawMessage(message) {
  const buffer = await new Response(message.raw).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    throw new Error("incoming email raw message is empty");
  }
  return bytes;
}

export async function sha256Hex(value) {
  const buffer = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret, value) {
  const encodedSecret = new TextEncoder().encode(requireString(secret, "HMAC secret"));
  const key = await crypto.subtle.importKey(
    "raw",
    encodedSecret,
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateUUIDv7(now = new Date()) {
  return uuidv7({ msecs: now.getTime() });
}

export function archiveDatePath(date) {
  return format(new TZDate(date, "UTC"), "yyyy/MM/dd");
}

export function inboundBundleKeys(recipientDomain, date, ingestId) {
  const domain = requireString(recipientDomain, "recipient domain").toLowerCase();
  const bundlePrefix = `mail/inbound/${domain}/${archiveDatePath(date)}/${requireString(ingestId, "ingest id")}`;
  return {
    bundlePrefix,
    rawKey: `${bundlePrefix}/raw.eml`,
    edgeKey: `${bundlePrefix}/edge.json`,
    resultKey: `${bundlePrefix}/result.json`
  };
}

export function normalizeFastPathURL(value) {
  const rawValue = requireString(value, "fast-path external URL");
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    url = new URL(`https://${rawValue}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("fast-path external URL must use https");
  }
  if (url.pathname === "/") {
    url.pathname = INBOUND_FAST_PATH_PATH;
  } else if (url.pathname !== INBOUND_FAST_PATH_PATH) {
    throw new Error(`fast-path external URL path must be ${INBOUND_FAST_PATH_PATH}`);
  }
  url.search = "";
  url.hash = "";
  return url;
}

export function buildFastPathNotification(archived) {
  const manifest = archived?.manifest;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("missing archived inbound manifest");
  }
  return {
    schema: INBOUND_FAST_PATH_SCHEMA,
    ingest_id: requireString(archived.ingestId, "ingest id"),
    recipient_domain: requireString(manifest.recipient_domain, "recipient domain"),
    raw_key: requireString(archived.rawKey, "raw key"),
    edge_key: requireString(archived.edgeKey, "edge key"),
    result_key: requireString(archived.resultKey, "result key"),
    received_at: requireString(manifest.received_at, "received_at"),
    raw_sha256: requireString(manifest.raw_sha256, "raw_sha256")
  };
}

export async function buildFastPathRequest(archived, env, now = new Date()) {
  if (!env || typeof env !== "object") {
    throw new Error("missing worker environment");
  }
  const url = normalizeFastPathURL(env.AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL);
  const timestamp = now.toISOString();
  const body = JSON.stringify(buildFastPathNotification(archived));
  const signature = await hmacSha256Hex(
    env.AGENT_MAIL_CF_TUNNEL_HMAC_SECRET,
    `${timestamp}\n${body}`
  );
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-mail-timestamp": timestamp,
        "x-agent-mail-signature": signature
      },
      body
    }
  };
}

export async function sendFastPathNotification(archived, env, fetchImpl = fetch) {
  const request = await buildFastPathRequest(archived, env);
  const response = await fetchImpl(request.url, request.init);
  if (!response.ok) {
    throw new Error(`fast-path notification failed with HTTP ${response.status}`);
  }
}

export function buildATMCFHeaders(message, receivedAt) {
  const envelopeFrom = typeof message.from === "string" && message.from.trim() !== "" ? message.from.trim() : "<>";
  const headers = {
    "X-ATMCF-Edge-Action": "worker",
    "X-ATMCF-Edge-Status": "received",
    "X-ATMCF-Edge-Envelope-From": envelopeFrom,
    "X-ATMCF-Edge-Envelope-To": requireString(message.to ?? "", "message.to"),
    "X-ATMCF-Edge-Raw-Size": String(requireFiniteNumber(message.rawSize, "message.rawSize")),
    "X-ATMCF-Edge-Received-At": receivedAt.toISOString()
  };

  const messageId = getHeader(message.headers, "message-id");
  if (messageId !== "") {
    headers["X-ATMCF-Edge-Message-ID"] = messageId;
  }

  return headers;
}

export function snapshotMessageHeaders(headers) {
  if (!headers || typeof headers.entries !== "function") {
    throw new Error("missing message.headers");
  }

  const entries = [];
  let index = 0;
  for (const [name, value] of headers.entries()) {
    const headerName = requireString(name, "header name");
    entries.push({
      index,
      name: headerName,
      name_lower: headerName.toLowerCase(),
      value: typeof value === "string" ? value : String(value ?? "")
    });
    index += 1;
  }
  return entries;
}

function observedAuthProvenanceHeaders(headerEntries) {
  return headerEntries.filter(
    (entry) => OBSERVED_AUTH_PROVENANCE_HEADERS.has(entry.name_lower) || entry.name_lower.startsWith("x-cf-")
  );
}

export function buildCloudflareEdgeEvidence({
  message,
  receivedAt,
  cloudflareZoneName,
  headerEntries = snapshotMessageHeaders(message.headers)
}) {
  return {
    schema: CLOUDFLARE_EDGE_EVIDENCE_SCHEMA,
    source: "cloudflare-worker-forwardable-email-message",
    captured_at: receivedAt.toISOString(),
    worker_message_fields: {
      envelope_from: typeof message.from === "string" ? message.from.trim() : "",
      envelope_to: requireString(message.to ?? "", "message.to"),
      raw_size: requireFiniteNumber(message.rawSize, "message.rawSize"),
      received_at: receivedAt.toISOString(),
      worker_name: WORKER_NAME,
      cloudflare_zone_name: requireString(cloudflareZoneName, "cloudflare zone name")
    },
    headers: {
      api: "ForwardableEmailMessage.headers.entries",
      entries: headerEntries
    },
    observed_auth_provenance_headers: observedAuthProvenanceHeaders(headerEntries)
  };
}

export function buildManifest({
  ingestId,
  rawKey,
  edgeKey,
  mailbox,
  envelopeFrom,
  envelopeTo,
  recipientDomain,
  cloudflareZoneName,
  receivedAt,
  rawSha256,
  messageId,
  atmcfHeaders,
  cloudflareEdgeEvidence
}) {
  const manifest = {
    schema: INBOUND_EDGE_SCHEMA,
    ingest_id: requireString(ingestId, "ingest id"),
    raw_key: requireString(rawKey, "raw key"),
    edge_key: requireString(edgeKey, "edge key"),
    mailbox: normalizeAddress(mailbox),
    envelope_from: typeof envelopeFrom === "string" ? envelopeFrom.trim() : "",
    envelope_to: requireString(envelopeTo, "envelope recipient"),
    recipient_domain: requireString(recipientDomain, "recipient domain"),
    cloudflare_zone_name: requireString(cloudflareZoneName, "cloudflare zone name"),
    worker_name: WORKER_NAME,
    received_at: receivedAt.toISOString(),
    raw_sha256: requireString(rawSha256, "raw sha256"),
    atmcf_headers: atmcfHeaders,
    cloudflare_edge_evidence: cloudflareEdgeEvidence
  };

  if (typeof messageId === "string" && messageId.trim() !== "") {
    manifest.message_id = messageId.trim();
  }

  return manifest;
}

export async function archiveInboundMessage(message, env, now = new Date()) {
  if (!env || typeof env !== "object") {
    throw new Error("missing worker environment");
  }
  if (!env.ARCHIVE_BUCKET || typeof env.ARCHIVE_BUCKET.put !== "function") {
    throw new Error("missing ARCHIVE_BUCKET R2 binding");
  }

  const mailbox = normalizeAddress(message.to);
  const receivedAt = new Date(now.toISOString());
  const rawBytes = await readRawMessage(message);
  const rawSha256 = await sha256Hex(rawBytes);
  const recipientDomain = canonicalDomainFromAddress(mailbox);
  const cloudflareZoneName = recipientDomain;
  const ingestId = generateUUIDv7(receivedAt);
  const { rawKey, edgeKey, resultKey } = inboundBundleKeys(recipientDomain, receivedAt, ingestId);
  const messageId = getHeader(message.headers, "message-id");
  const atmcfHeaders = buildATMCFHeaders(message, receivedAt);
  const cloudflareEdgeEvidence = buildCloudflareEdgeEvidence({
    message,
    receivedAt,
    cloudflareZoneName
  });

  await env.ARCHIVE_BUCKET.put(rawKey, rawBytes, {
    httpMetadata: { contentType: "message/rfc822" }
  });

  const manifest = buildManifest({
    ingestId,
    rawKey,
    edgeKey,
    mailbox,
    envelopeFrom: message.from,
    envelopeTo: message.to,
    recipientDomain,
    cloudflareZoneName,
    receivedAt,
    rawSha256,
    messageId,
    atmcfHeaders,
    cloudflareEdgeEvidence
  });

  await env.ARCHIVE_BUCKET.put(edgeKey, `${JSON.stringify(manifest, null, 2)}\n`, {
    httpMetadata: { contentType: "application/json" }
  });

  return {
    ingestId,
    rawKey,
    edgeKey,
    resultKey,
    manifest
  };
}
