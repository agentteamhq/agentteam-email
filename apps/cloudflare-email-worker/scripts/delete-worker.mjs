import { SCRIPT_NAME, cloudflareRequest, requireEnv } from "./cloudflare-api.mjs";

const accountID = requireEnv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID");
await cloudflareRequest(`/accounts/${accountID}/workers/scripts/${SCRIPT_NAME}`, {
  method: "DELETE"
});

console.log(
  JSON.stringify(
    {
      script: SCRIPT_NAME,
      status: "deleted"
    },
    null,
    2
  )
);
