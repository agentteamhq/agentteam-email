import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

import {
  archiveDatePath,
  archiveInboundMessage,
  buildCloudflareEdgeEvidence,
  buildFastPathRequest,
  generateUUIDv7,
  inboundBundleKeys,
  normalizeAddress,
  normalizeFastPathURL,
  sha256Hex
} from "../src/lib.js";

class MockBucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    let bytes;
    if (typeof value === "string") {
      bytes = Buffer.from(value, "utf8");
    } else if (value instanceof Uint8Array) {
      bytes = Buffer.from(value);
    } else if (value instanceof ArrayBuffer) {
      bytes = Buffer.from(new Uint8Array(value));
    } else {
      throw new Error(`unsupported mock bucket value type for key ${key}`);
    }

    this.objects.set(key, {
      bytes,
      options
    });
  }
}

function fixturePath(name) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, "fixtures", name);
}

async function fixtureBytes(name) {
  return new Uint8Array(await fs.readFile(fixturePath(name)));
}

async function rootFixtureJSON(name) {
  return JSON.parse(await fs.readFile(fixturePath(name), "utf8"));
}

async function buildMessage(rawBytes) {
  return {
    from: "sender@example.net",
    to: "Agent@Example.com",
    rawSize: rawBytes.byteLength,
    headers: new Headers({
      "Authentication-Results": "mx.cloudflare.test; spf=pass smtp.mailfrom=example.net",
      "ARC-Authentication-Results": "i=1; mx.google.com; arc=none",
      "DKIM-Signature": "v=1; d=example.net; s=test; b=abc",
      "Message-ID": "<fixture-message-id@example.net>",
      "Received-SPF": "pass client-ip=203.0.113.7",
      "X-CF-Spamh-Score": "2",
      Subject: "Worker Fixture"
    }),
    raw: new Response(rawBytes).body
  };
}

test("normalizeAddress lowercases and trims addresses", () => {
  assert.equal(normalizeAddress("  Agent@Example.com "), "agent@example.com");
});

test("generateUUIDv7 returns canonical UUIDv7 values", () => {
  const ingestID = generateUUIDv7(new Date("2026-04-18T12:34:56.000Z"));
  assert.match(
    ingestID,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test("inboundBundleKeys matches the shared R2 layout fixture", async () => {
  const fixture = await rootFixtureJSON("r2-key-layout.json");
  const inbound = fixture.inbound;
  const timestamp = new Date(inbound.timestamp);

  assert.equal(archiveDatePath(timestamp), "2026/04/18");
  assert.deepEqual(inboundBundleKeys(inbound.recipient_domain, timestamp, inbound.ingest_id), {
    bundlePrefix: inbound.bundle_prefix,
    rawKey: inbound.raw_key,
    edgeKey: inbound.edge_key,
    resultKey: inbound.result_key
  });
});

test("archiveInboundMessage writes raw archive and edge metadata", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  const bucket = new MockBucket();
  const now = new Date("2026-04-18T12:34:56.000Z");
  const env = {
    ARCHIVE_BUCKET: bucket
  };

  const result = await archiveInboundMessage(await buildMessage(rawBytes), env, now);

  assert.match(
    result.ingestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  const keys = inboundBundleKeys("example.com", now, result.ingestId);
  assert.equal(result.rawKey, keys.rawKey);
  assert.equal(result.edgeKey, keys.edgeKey);
  assert.equal(result.resultKey, keys.resultKey);

  const rawObject = bucket.objects.get(result.rawKey);
  assert.ok(rawObject, "raw archive object missing");
  assert.equal(rawObject.options.httpMetadata.contentType, "message/rfc822");
  assert.deepEqual(new Uint8Array(rawObject.bytes), rawBytes);

  const manifestObject = bucket.objects.get(result.edgeKey);
  assert.ok(manifestObject, "edge metadata object missing");
  assert.equal(manifestObject.options.httpMetadata.contentType, "application/json");

  const manifest = JSON.parse(manifestObject.bytes.toString("utf8"));
  assert.equal(manifest.schema, "agent-mail.inbound.edge.v1");
  assert.equal(manifest.ingest_id, result.ingestId);
  assert.equal(manifest.raw_key, result.rawKey);
  assert.equal(manifest.edge_key, result.edgeKey);
  assert.equal(manifest.mailbox, "agent@example.com");
  assert.equal(manifest.envelope_to, "Agent@Example.com");
  assert.equal(manifest.envelope_from, "sender@example.net");
  assert.equal(manifest.recipient_domain, "example.com");
  assert.equal(manifest.cloudflare_zone_name, "example.com");
  assert.equal(manifest.worker_name, "agent-mail-ingress");
  assert.equal(manifest.received_at, "2026-04-18T12:34:56.000Z");
  assert.equal(manifest.message_id, "<fixture-message-id@example.net>");
  assert.equal(
    manifest.atmcf_headers["X-ATMCF-Edge-Message-ID"],
    "<fixture-message-id@example.net>"
  );
  assert.equal(manifest.atmcf_headers["X-ATMCF-Edge-Action"], "worker");
  assert.equal(manifest.atmcf_headers["X-ATMCF-Edge-Status"], "received");
  assert.equal(manifest.atmcf_headers["X-ATMCF-Edge-Envelope-To"], "Agent@Example.com");
  assert.equal(manifest.raw_sha256, await sha256Hex(rawBytes));

  assert.equal(
    manifest.cloudflare_edge_evidence.schema,
    "agent-mail.cloudflare-edge-evidence.v1"
  );
  assert.equal(
    manifest.cloudflare_edge_evidence.worker_message_fields.envelope_from,
    "sender@example.net"
  );
  assert.equal(
    manifest.cloudflare_edge_evidence.worker_message_fields.envelope_to,
    "Agent@Example.com"
  );
  assert.equal(
    manifest.cloudflare_edge_evidence.worker_message_fields.raw_size,
    rawBytes.byteLength
  );
  assert.equal(manifest.cloudflare_edge_evidence.unavailable, undefined);
  assert.equal(manifest.cloudflare_routing_activity, undefined);
  assert.ok(
    manifest.cloudflare_edge_evidence.headers.entries.some(
      (entry) => entry.name === "authentication-results" && entry.value.includes("spf=pass")
    )
  );
  assert.ok(
    manifest.cloudflare_edge_evidence.observed_auth_provenance_headers.some(
      (entry) => entry.name === "x-cf-spamh-score" && entry.value === "2"
    )
  );
});

test("archiveInboundMessage preserves DSN null envelope sender", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  const bucket = new MockBucket();
  const now = new Date("2026-04-18T12:34:56.000Z");
  const env = {
    ARCHIVE_BUCKET: bucket
  };
  const message = await buildMessage(rawBytes);
  message.from = "";

  const result = await archiveInboundMessage(message, env, now);
  const manifestObject = bucket.objects.get(result.edgeKey);
  const manifest = JSON.parse(manifestObject.bytes.toString("utf8"));

  assert.equal(manifest.envelope_from, "");
  assert.equal(manifest.atmcf_headers["X-ATMCF-Edge-Envelope-From"], "<>");
  assert.equal(manifest.cloudflare_edge_evidence.worker_message_fields.envelope_from, "");
});

test("buildCloudflareEdgeEvidence records only Worker-observed edge facts", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  const message = await buildMessage(rawBytes);
  const evidence = buildCloudflareEdgeEvidence({
    message,
    receivedAt: new Date("2026-04-18T12:34:56.000Z"),
    cloudflareZoneName: "example.com"
  });

  assert.equal(evidence.source, "cloudflare-worker-forwardable-email-message");
  assert.deepEqual(
    evidence.observed_auth_provenance_headers.map((entry) => entry.name),
    [
      "arc-authentication-results",
      "authentication-results",
      "dkim-signature",
      "received-spf",
      "x-cf-spamh-score"
    ]
  );
  assert.equal(evidence.unavailable, undefined);
});

test("archiveInboundMessage ignores stale Analytics bindings and does not fetch routing activity", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  const bucket = new MockBucket();
  const now = new Date("2026-04-18T12:34:56.000Z");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("archiveInboundMessage must not call fetch");
  };

  try {
    const result = await archiveInboundMessage(
      await buildMessage(rawBytes),
      {
        ARCHIVE_BUCKET: bucket,
        AGENT_MAIL_CLOUDFLARE_ANALYTICS_TOKEN: "stale-token",
        AGENT_MAIL_CLOUDFLARE_ZONE_ID: "stale-zone",
        AGENT_MAIL_CLOUDFLARE_GRAPHQL_URL: "https://example.invalid/graphql"
      },
      now
    );

    const manifest = JSON.parse(bucket.objects.get(result.edgeKey).bytes.toString("utf8"));
    assert.equal(fetchCalled, false);
    assert.equal(manifest.cloudflare_routing_activity, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildFastPathRequest posts the archived bundle through the fast-path endpoint", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  const bucket = new MockBucket();
  const now = new Date("2026-04-18T12:34:56.000Z");
  const archived = await archiveInboundMessage(
    await buildMessage(rawBytes),
    {
      ARCHIVE_BUCKET: bucket
    },
    now
  );
  const requestTime = new Date("2026-04-18T12:34:58.000Z");

  const request = await buildFastPathRequest(
    archived,
    {
      AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL: "mail-ingress.example.com",
      AGENT_MAIL_CF_TUNNEL_HMAC_SECRET: "test-secret"
    },
    requestTime
  );

  assert.equal(request.url.href, "https://mail-ingress.example.com/agent-mail/ingest/v1");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers["content-type"], "application/json");
  assert.equal(request.init.headers["x-agent-mail-timestamp"], "2026-04-18T12:34:58.000Z");

  const payload = JSON.parse(request.init.body);
  assert.equal(payload.schema, "agent-mail.inbound.fastpath.v1");
  assert.equal(payload.ingest_id, archived.ingestId);
  assert.equal(payload.recipient_domain, "example.com");
  assert.equal(payload.raw_key, archived.rawKey);
  assert.equal(payload.edge_key, archived.edgeKey);
  assert.equal(payload.result_key, archived.resultKey);
  assert.equal(payload.received_at, "2026-04-18T12:34:56.000Z");
  assert.equal(payload.raw_sha256, await sha256Hex(rawBytes));

  const expectedSignature = createHmac("sha256", "test-secret")
    .update(`${request.init.headers["x-agent-mail-timestamp"]}\n${request.init.body}`)
    .digest("hex");
  assert.equal(request.init.headers["x-agent-mail-signature"], expectedSignature);
});

test("normalizeFastPathURL requires the fixed ingest notification path", () => {
  assert.equal(
    normalizeFastPathURL("https://mail-ingress.example.com/agent-mail/ingest/v1").href,
    "https://mail-ingress.example.com/agent-mail/ingest/v1"
  );
  assert.throws(() => normalizeFastPathURL("https://mail-ingress.example.com/other"), /path must be/);
});

test("archiveInboundMessage fails when the R2 binding is missing", async () => {
  const rawBytes = await fixtureBytes("inbound.eml");
  await assert.rejects(
    archiveInboundMessage(await buildMessage(rawBytes), {}, new Date("2026-04-18T12:34:56.000Z")),
    /missing ARCHIVE_BUCKET R2 binding/
  );
});
