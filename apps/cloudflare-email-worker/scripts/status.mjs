import { SCRIPT_NAME, cloudflareRequest, requireEnv } from "./cloudflare-api.mjs";

const accountID = requireEnv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID");
const settings = await cloudflareRequest(
  `/accounts/${accountID}/workers/scripts/${SCRIPT_NAME}/settings`
);

console.log(
  JSON.stringify(
    {
      script: SCRIPT_NAME,
      settings
    },
    null,
    2
  )
);
