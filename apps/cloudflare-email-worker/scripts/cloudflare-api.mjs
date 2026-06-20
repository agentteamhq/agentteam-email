export const SCRIPT_NAME = "agent-mail-ingress";
export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value.trim();
}

export async function cloudflareRequest(path, { method = "GET", body } = {}) {
  const token = requireEnv("AGENT_MAIL_CLOUDFLARE_API_TOKEN");
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text === "" ? null : JSON.parse(text);

  if (!response.ok) {
    throw new Error(
      `Cloudflare API ${method} ${path} failed with status ${response.status}: ${text}`
    );
  }

  if (payload && payload.success === false) {
    const detail = Array.isArray(payload.errors)
      ? payload.errors.map((entry) => entry.message).join("; ")
      : text;
    throw new Error(`Cloudflare API ${method} ${path} returned an error: ${detail}`);
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return payload.result;
  }

  return payload;
}

export async function parseCloudflareResponse(response, method, path) {
  const text = await response.text();
  const payload = text === "" ? null : JSON.parse(text);

  if (!response.ok) {
    throw new Error(
      `Cloudflare API ${method} ${path} failed with status ${response.status}: ${text}`
    );
  }

  if (payload && payload.success === false) {
    const detail = Array.isArray(payload.errors)
      ? payload.errors.map((entry) => entry.message).join("; ")
      : text;
    throw new Error(`Cloudflare API ${method} ${path} returned an error: ${detail}`);
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return payload.result;
  }

  return payload;
}

export async function resolveZoneID(zoneName) {
  if (typeof zoneName !== "string" || zoneName.trim() === "") {
    throw new Error("missing Cloudflare zone name");
  }

  const params = new URLSearchParams({ name: zoneName.trim() });
  const zones = await cloudflareRequest(`/zones?${params.toString()}`);
  if (!Array.isArray(zones)) {
    throw new Error(`Cloudflare zone lookup for ${zoneName} returned a non-array result`);
  }
  if (zones.length === 0) {
    throw new Error(`Cloudflare zone ${zoneName} was not found`);
  }
  if (zones.length > 1) {
    throw new Error(`Cloudflare zone lookup for ${zoneName} returned multiple zones`);
  }
  return zones[0].id;
}
