# Google Workspace And Cloudflare Split-Domain Mail Plan

## Status

Proposed implementation plan. This is not current production behavior.

Security-sensitive changes to OAuth grants, token storage, Worker secrets,
credential handling, internal send authorization, or protected routes require
current-task approval under `SECURITY.md` before code changes begin.

## Goal

Support one customer-owned domain where:

- Google Workspace owns normal human mailboxes and the public apex MX records.
- AgentTeam Email owns agent mailboxes on the same visible domain through
  WildDuck.
- Google Workspace routes non-Google agent recipients to an AgentTeam-controlled
  Cloudflare Email Routing subdomain.
- Cloudflare Email Routing invokes the existing AgentTeam Email Worker path for
  agent inbound mail.
- Cloudflare Email Sending sends outbound agent mail with the visible
  `From:` address on the apex domain.
- Gmail users continue to receive and send human mailbox mail through Google
  Workspace.

The canonical customer domain in examples is `example.com`. The AgentTeam
Cloudflare receiving subdomain in examples is `agent-mx.example.com`.

## Provider Facts This Plan Relies On

- Google Workspace Gmail routing can apply a setting to **All inactive and
  unrecognized accounts**.
- Google Workspace Gmail routing can **Change the route** for matching mail.
- Google Workspace Gmail routing can **Change envelope recipient** and
  **Replace domain**, preserving the original local part.
- Google Workspace Gmail routing can add the `X-Gm-Original-To` header when it
  changes the recipient.
- Google Workspace Gmail routing settings can require secure transport with
  TLS for onward delivery.
- Cloudflare Email Routing can be enabled on subdomains of the same zone.
- Cloudflare Email Routing can create a catch-all rule whose action is
  **Send to a Worker**.
- Cloudflare Email Workers receive `message.from`, `message.to`, headers, and
  raw MIME bytes through the `email()` handler.
- Cloudflare Email Sending is separate from Cloudflare Email Routing.
- Cloudflare Email Sending can send from an onboarded apex domain even when the
  apex inbound MX records point to Google.
- Cloudflare Email Sending uses a `cf-bounce.<domain>` subdomain for bounce
  handling and sending SPF records, and uses separate DKIM records for sending.
- Cloudflare Email Sending SMTP authentication uses an API token as the SMTP
  password. The existing AgentTeam integration uses Cloudflare OAuth access and
  the REST raw-send path instead of storing customer API tokens.

Provider reference URLs:

- Google Gmail routing settings:
  `https://support.google.com/a/answer/6297084`
- Google split delivery:
  `https://support.google.com/a/answer/2685650`
- Google mail route hosts:
  `https://support.google.com/a/answer/60730`
- Cloudflare Email Routing subdomains:
  `https://developers.cloudflare.com/email-service/configuration/subdomains/`
- Cloudflare Email Routing rules and catch-all:
  `https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/`
- Cloudflare Email Worker handler:
  `https://developers.cloudflare.com/email-service/api/route-emails/email-handler/`
- Cloudflare Email Sending setup:
  `https://developers.cloudflare.com/email-service/get-started/send-emails/`
- Cloudflare Email Sending SMTP:
  `https://developers.cloudflare.com/email-service/api/send-emails/smtp/`
- Cloudflare Email authentication:
  `https://developers.cloudflare.com/email-service/concepts/email-authentication/`

## SES-First Design Brain Dump

This section captures the current SES-first implementation direction discussed
after the original Cloudflare Email Routing subdomain plan. It is intentionally
explicit so the implementation can be decomposed into backend provisioning,
customer DNS setup, Google Workspace setup, Worker ingress, and mail-control
ingestion tasks.

The current preferred design is:

```text
Google Workspace unknown or agent-recipient route
  -> agent-mx.example.com
  -> MX to Amazon SES inbound SMTP endpoint
  -> SES receipt rule S3 action
  -> raw MIME stored in AgentTeam-owned S3 bucket
  -> SES S3 action SNS notification
  -> AgentTeam Cloudflare Worker HTTPS endpoint
  -> backend queue/import pipeline
  -> mail-control/WildDuck delivery under canonical example.com
```

This design uses Cloudflare Workers as an HTTPS notification and edge-ingress
surface. The Worker is not an SMTP endpoint. Amazon SES is the SMTP receiver
for `agent-mx.example.com`.

### Why SES Replaces Cloudflare Email Routing For This Path

Cloudflare Email Routing and Email Workers are useful when the customer's
domain or subdomain is using Cloudflare Email Routing. They are not a generic
SMTP target for Google Workspace routing, and a Worker cannot directly receive
SMTP. Cloudflare Email Service also requires Cloudflare DNS for the sending
service.

SES gives AgentTeam an SMTP receiving endpoint that can be used by any customer
who can publish DNS records, regardless of whether the customer uses
Cloudflare DNS. Cloudflare remains useful for customers who connect Cloudflare
OAuth because AgentTeam can create the required DNS records automatically.
Customers without Cloudflare can copy the same generated records into their DNS
provider.

### SES Inbound Provider Facts

- SES inbound receives SMTP for a domain or subdomain through an MX record
  pointing at `inbound-smtp.<region>.amazonaws.com`.
- SES receipt rules support these action types: add header, bounce, Lambda, S3,
  SNS, stop rule set, and WorkMail.
- SES receipt rules do not have a direct SQS action.
- SES SNS action can include complete raw MIME content, but only when the
  complete message including headers is no larger than 150 KB. Larger messages
  bounce.
- SES S3 action stores the raw, unmodified MIME email and supports a default
  maximum message size of 40 MB including headers.
- SES S3 action can publish an SNS notification after the message is saved.
- The SNS notification from the SES S3 action contains SES receipt metadata and
  the S3 object location; it must not be treated as the canonical email body.
- Generic S3 `ObjectCreated` notifications to SQS or SNS do not preserve the
  full SES receipt metadata shape. Use the SNS topic configured on the SES S3
  receipt action when the service needs SES `receipt` and `mail` objects.
- S3 can publish object events to SQS, SNS, Lambda, or EventBridge. If the
  product uses SQS later, the queue is downstream of S3, not a direct SES
  receipt action.

SES inbound provider reference URLs:

- SES receipt action options:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action.html`
- SES inbound MX:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-mx-record.html`
- SES S3 receipt action:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-s3.html`
- SES SNS receipt action and 150 KB limit:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-sns.html`
- SES receipt notification contents:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-notifications-contents.html`
- SES receiving concepts, authentication, and malware scanning:
  `https://docs.aws.amazon.com/ses/latest/dg/receiving-email-concepts.html`
- S3 event notification destinations:
  `https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html`

### SES Raw MIME And Metadata Model

The implementation must persist two separate artifacts for every inbound SES
message:

```text
raw MIME object from S3
SES receipt notification JSON from SNS
```

The raw MIME object is the canonical message content. It contains the message
headers, body parts, MIME boundaries, encodings, and attachments. SES adds
useful headers to the message stored in S3, including authentication and
scanning evidence such as:

```text
Authentication-Results
X-SES-Spam-Verdict
X-SES-Virus-Verdict
```

The SES notification JSON is the canonical delivery, routing, and SES
processing metadata. It includes:

```text
notificationType
receipt.action.type
receipt.action.bucketName
receipt.action.objectKey
receipt.recipients
receipt.spfVerdict.status
receipt.dkimVerdict.status
receipt.dmarcVerdict.status
receipt.dmarcPolicy.status
receipt.spamVerdict.status
receipt.virusVerdict.status
receipt.processingTimeMillis
mail.messageId
mail.source
mail.destination
mail.timestamp
mail.headers
mail.commonHeaders
mail.headersTruncated
```

The ingestion pipeline must not rely on the raw MIME alone when SES verdicts,
envelope sender, matched receipt recipients, S3 object keys, or SES processing
status are required. The ingestion pipeline must not rely on the SES
notification alone for message body, attachments, or complete original MIME
content.

### SES Inbound Provisioning Shape

The backend must own SES inbound provisioning in an AgentTeam-controlled AWS
account. Customers must not need their own AWS account for this mode.

Required AWS state per receiving region:

```text
SES verified receiving identity for customer domain or subdomain
Active SES receipt rule set
Receipt rule matching agent-mx.example.com or configured recipients
S3 bucket for raw MIME
S3 object key prefix partitioned by organization/domain
SNS topic for SES S3 action notifications
HTTPS subscription from SNS topic to AgentTeam Cloudflare Worker endpoint
IAM permission allowing SES to write to S3
IAM permission allowing SES to publish to SNS
S3 lifecycle and retention policy for raw MIME archives
```

The receipt rule action order for production must be:

```text
1. Optional add-header action for AgentTeam diagnostic metadata
2. S3 action storing raw MIME
3. SNS notification configured on the S3 action
```

Do not use the SES direct SNS action as the production inbound body transport
because messages larger than 150 KB bounce. Direct SNS raw MIME may be used
only for local prototypes or explicitly scoped tests.

The Worker endpoint must support SNS HTTPS subscription confirmation and SNS
message notification handling. The Worker must verify the SNS signature and
allowlist the expected topic ARN before accepting a notification. The Worker
must use SES `mail.messageId` and S3 `objectKey` as idempotency inputs.

### SES Inbound DNS Records

For a customer domain `example.com` and AgentTeam receiving subdomain
`agent-mx.example.com`, the inbound DNS record generated by the backend is:

```text
agent-mx.example.com. MX 10 inbound-smtp.<region>.amazonaws.com.
```

The region must be the SES receiving region selected by AgentTeam. The UI must
render the concrete region-specific value, such as:

```text
agent-mx.example.com. MX 10 inbound-smtp.us-east-1.amazonaws.com.
```

If Cloudflare DNS is connected through OAuth, the web server may create this
record through the Cloudflare DNS API. If Cloudflare DNS is not connected, the
web server must show this record for manual creation and poll public DNS until
the expected value resolves.

### Google Workspace Routing To SES

Google Workspace remains the apex MX owner for `example.com`. Google must route
unknown or agent recipients to `agent-mx.example.com`.

The intended Google route target is the subdomain hostname, not a Worker URL
and not an authenticated outbound SMTP endpoint:

```text
Host/domain: agent-mx.example.com
Perform MX lookup on host: enabled
TLS: required when the Google Admin route allows it
```

Google then performs MX lookup for `agent-mx.example.com` and delivers to the
SES inbound SMTP endpoint. The routing setting must replace the envelope
recipient domain from `example.com` to `agent-mx.example.com` while preserving
the local part.

Required effective recipient mapping:

```text
original address: agent-123@example.com
Google routed envelope recipient: agent-123@agent-mx.example.com
SES recipient: agent-123@agent-mx.example.com
canonical WildDuck recipient: agent-123@example.com
```

The service must store any Google-provided original recipient evidence, such as
`X-Gm-Original-To`, but that header must not be treated as cryptographic proof
that Google handled the message.

### Cloudflare Worker Role In SES Inbound

The Worker must be an HTTPS SNS receiver for SES notifications. It must not
attempt to receive SMTP.

Required Worker behavior:

- Accept SNS `SubscriptionConfirmation` requests only for configured topics.
- Confirm SNS subscriptions through the SNS confirmation URL only after
  validating the topic ARN and endpoint ownership expectations.
- Accept SNS `Notification` messages only after signature verification.
- Reject or ignore SNS messages from unexpected topic ARNs.
- Parse the SES notification JSON from the SNS message body with a typed
  schema.
- Persist the SES notification metadata or forward it to the backend without
  including raw MIME content.
- Never log raw MIME, full headers, OAuth tokens, AWS credentials, SNS
  signatures, webhook secrets, cookies, or decrypted secrets.
- Trigger the backend import path with organization/domain/connection
  identifiers and SES message/S3 object identifiers only.

Open implementation decision: whether the Worker fetches the S3 object itself
or forwards the verified SES notification to the backend and lets the backend
fetch from S3. The safer default is backend fetch, because AWS credentials stay
inside the backend/AWS boundary rather than being placed in Worker secrets.

### SQS Position In The Design

SQS is not directly downstream of SES receipt rules. If the product needs an
AWS queue, the supported production shape is:

```text
SES inbound
  -> S3 raw MIME
  -> S3 ObjectCreated notification
  -> SQS
  -> backend consumer
```

or:

```text
SES inbound
  -> S3 raw MIME
  -> SES S3 action SNS notification
  -> SQS subscription
  -> backend consumer
```

SQS does not push to a Cloudflare Worker. A Worker can poll SQS only by using
scheduled Worker invocations and AWS request signing, but this is not the
preferred first implementation because it adds queue visibility timeout,
delete-on-success, retry, DLQ, and AWS signing complexity at the Worker
boundary.

### SES Outbound Provider Facts

SES outbound can send mail for a verified domain identity. A verified domain
identity allows sending from addresses under that domain, subject to SES account
policy and sandbox/production status.

SES Easy DKIM for a domain produces three DKIM tokens. The backend must convert
those tokens into three DNS CNAME records:

```text
<token1>._domainkey.example.com. CNAME <token1>.dkim.amazonses.com.
<token2>._domainkey.example.com. CNAME <token2>.dkim.amazonses.com.
<token3>._domainkey.example.com. CNAME <token3>.dkim.amazonses.com.
```

SES custom MAIL FROM uses a customer-selected subdomain of the verified
identity. The custom MAIL FROM domain must not be used as a From address and
must not be used to receive mail. For `mail.example.com`, the backend must
render:

```text
mail.example.com. MX 10 feedback-smtp.<region>.amazonses.com.
mail.example.com. TXT "v=spf1 include:amazonses.com ~all"
```

The SPF record for the visible root domain must be merged with any existing
Google or customer SPF record when needed. The product must not publish
multiple SPF TXT records at the same DNS name.

SES outbound provider reference URLs:

- SES v2 `CreateEmailIdentity`:
  `https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_CreateEmailIdentity.html`
- SES v2 `GetEmailIdentity`:
  `https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_GetEmailIdentity.html`
- SES v2 DKIM attributes:
  `https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_DkimAttributes.html`
- SES legacy `GetIdentityDkimAttributes`:
  `https://docs.aws.amazon.com/ses/latest/APIReference/API_GetIdentityDkimAttributes.html`
- Easy DKIM management:
  `https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy-managing.html`
- SES custom MAIL FROM:
  `https://docs.aws.amazon.com/ses/latest/dg/mail-from.html`
- SES v2 custom MAIL FROM API:
  `https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_PutEmailIdentityMailFromAttributes.html`
- SES legacy custom MAIL FROM attributes:
  `https://docs.aws.amazon.com/ses/latest/APIReference/API_GetIdentityMailFromDomainAttributes.html`

### SES Outbound Provisioning API Shape

The backend must be able to provision and report SES outbound DNS requirements
programmatically.

Required API flow:

```text
1. Create or read SES email identity for example.com.
2. Read DKIM tokens and DKIM verification status.
3. Construct Easy DKIM CNAME records from the tokens.
4. Configure custom MAIL FROM subdomain, defaulting to mail.example.com or a
   product-owned naming convention that does not conflict with inbound.
5. Construct custom MAIL FROM MX and TXT records from the selected region and
   subdomain.
6. Read identity verification, DKIM status, and MAIL FROM status.
7. Return a DNS checklist to the UI and DNS automation layer.
8. Poll DNS and SES identity status until verified or failed.
```

Required SES v2 calls:

```text
CreateEmailIdentity
GetEmailIdentity
PutEmailIdentityMailFromAttributes
```

Legacy SES v1 equivalents that may be useful where v2 does not cover an
operation:

```text
VerifyDomainDkim
GetIdentityDkimAttributes
SetIdentityMailFromDomain
GetIdentityMailFromDomainAttributes
```

The backend must render DNS records as normalized data, not prose-only setup
steps:

```json
[
  {
    "purpose": "ses_easy_dkim",
    "type": "CNAME",
    "name": "<token1>._domainkey.example.com",
    "value": "<token1>.dkim.amazonses.com"
  },
  {
    "purpose": "ses_custom_mail_from_mx",
    "type": "MX",
    "name": "mail.example.com",
    "priority": 10,
    "value": "feedback-smtp.us-east-1.amazonses.com"
  },
  {
    "purpose": "ses_custom_mail_from_spf",
    "type": "TXT",
    "name": "mail.example.com",
    "value": "v=spf1 include:amazonses.com ~all"
  },
  {
    "purpose": "ses_inbound_mx",
    "type": "MX",
    "name": "agent-mx.example.com",
    "priority": 10,
    "value": "inbound-smtp.us-east-1.amazonaws.com"
  }
]
```

Cloudflare-connected customers can have these records created automatically
through Cloudflare DNS OAuth. Non-Cloudflare customers must receive the same
records as manual instructions.

### SES Outbound Sending Shape

For SES outbound mode, agent messages use SES rather than Google or Cloudflare
Email Sending:

```text
Agent/user action
  -> authenticated web server mailbox operation
  -> WildDuck submit
  -> ZoneMTA queue
  -> Mail Control Service internal SMTP relay
  -> SES outbound provider send
  -> external recipient
```

Required outbound identity:

```text
Header From: agent-123@example.com
Provider sender/from: agent-123@example.com
MAIL FROM / Return-Path: mail.example.com through SES custom MAIL FROM
DKIM: SES Easy DKIM for example.com
SPF: aligned through custom MAIL FROM domain when SPF alignment is used
DMARC: aligned through DKIM for example.com and/or SPF alignment when available
```

Human outbound mail remains Google-owned:

```text
Header From: human@example.com
DKIM: Google Workspace selector for example.com
SPF: Google Workspace SPF where applicable
DMARC: aligned through Google authentication
```

The service must not send agent outbound from `agent-mx.example.com` unless a
future product mode explicitly exposes subdomain-visible addresses. The visible
agent sender domain remains `example.com`.

### Shared Google And SES Authentication Requirements

The root DMARC policy is shared by Google human mail and SES agent mail:

```text
_dmarc.example.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Initial rollout must use `p=none` or preserve the customer's existing DMARC
policy until both Google and SES outbound authentication pass. The setup UI must
not recommend moving to `quarantine` or `reject` until real test messages prove
Google human mail and SES agent mail both align.

If root SPF authorizes both Google and SES, it must be a single SPF record:

```text
example.com. TXT "v=spf1 include:_spf.google.com include:amazonses.com ~all"
```

The custom MAIL FROM SPF record remains separate because it is on
`mail.example.com`:

```text
mail.example.com. TXT "v=spf1 include:amazonses.com ~all"
```

### Customer-Facing Setup And Detection

The setup UI must show:

- Apex Google MX records detected for `example.com`.
- Google Workspace route instructions for unknown/agent recipients.
- AgentTeam inbound subdomain, such as `agent-mx.example.com`.
- SES inbound MX record for the subdomain.
- SES Easy DKIM CNAME records.
- SES custom MAIL FROM MX and TXT records.
- Root SPF merge guidance when SES must be included at `example.com`.
- DMARC current state and rollout recommendation.
- SES identity verification status.
- SES DKIM verification status.
- SES custom MAIL FROM status.
- Last successful inbound test that produced both S3 raw MIME and SES metadata.
- Last successful outbound SES test with DKIM/DMARC alignment evidence.

The UI must distinguish generated DNS records from provider status. A record
being generated does not mean SES has verified it. The domain must not be marked
live until DNS checks and provider verification checks pass.

### OAuth And Scope Notes

The first implementation should avoid Google Gmail restricted scopes.

Google Gmail API facts already researched:

- `gmail.send` is a sensitive scope.
- `gmail.compose`, `gmail.modify`, `gmail.readonly`, `gmail.metadata`,
  `gmail.insert`, `gmail.settings.basic`, `gmail.settings.sharing`, and full
  `mail.google.com` are restricted scopes.
- Draft creation requires restricted Gmail scopes.
- Gmail forwarding address settings require `gmail.settings.sharing` and are
  only available to service account clients with domain-wide authority.
- Apps that request restricted scopes and access Google user data through a
  third-party server may require Google restricted-scope verification and an
  annual security assessment.

Therefore the first cut should treat Google Workspace routing as an admin
manual setup with status checks, not as an OAuth-automated Gmail settings
mutation.

Google OAuth reference URLs:

- Gmail API scopes:
  `https://developers.google.com/workspace/gmail/api/auth/scopes`
- Restricted-scope verification:
  `https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification`
- Gmail forwarding address API:
  `https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.forwardingAddresses/create`
- Google Workspace app access control:
  `https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data`
- Domain-wide delegation:
  `https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation`

### Security Requirements For SES Mode

AWS credentials must remain server-side. Public clients, Workers, status DTOs,
logs, and setup instructions must not expose AWS access keys, secret access
keys, STS session tokens, SNS signing material, webhook secrets, raw OAuth
tokens, or decrypted secrets.

If the Worker receives SNS notifications directly:

- The Worker must verify SNS signatures before trusting the message.
- The Worker must allowlist the expected SNS topic ARN.
- The Worker must reject unexpected topic ARNs.
- The Worker must not log full SNS messages because SES headers can contain
  private message metadata.
- The Worker must forward only metadata required for backend import.

If the backend fetches raw MIME from S3:

- The backend must authenticate and authorize the domain/import operation before
  accessing organization-scoped message records.
- Raw MIME must be treated as customer message content and must not appear in
  logs, public diagnostics, or provider error surfaces.
- S3 object keys must be partitioned by organization and domain, and lookup
  must be constrained to the expected organization/domain prefix.

### Open Questions

- Whether the Worker should only forward verified SES notifications or also
  fetch S3 objects. The default proposed answer is backend fetch.
- Whether SES inbound identities are provisioned at `example.com`,
  `agent-mx.example.com`, or both. The receiving MX is on
  `agent-mx.example.com`; outbound identity must cover `example.com`.
- Whether one global SES receipt rule set can safely route all customer
  subdomains or whether the service should create one receipt rule per
  customer domain with explicit recipient conditions.
- Whether SES outbound sending is selected per domain as a replacement for
  Cloudflare Email Sending or coexists as a separate outbound provider mode.
- Whether SQS is needed in the first implementation. The current proposed
  first cut is SES S3 action SNS notification to Worker, with backend queueing
  after Worker verification.

## Current Repo Boundaries To Preserve

- The web server remains the only public application boundary.
- Cloudflare OAuth, account selection, zone selection, domain desired state,
  Worker deployment, Email Routing setup, Email Sending setup, and customer
  remediation messages remain web-owned behavior.
- Mail-control receives active domain runtime projection from the web server
  through `agentMail.runtime.sync`.
- Mail-control does not call Cloudflare APIs with admin credentials for
  customer-domain routing or sending.
- Inbound Worker notifications continue to enter through
  `/rpc/agent-mail/ingest/v1/{connectionPublicId}` and contain metadata only.
- The Worker must write `raw.eml` before `edge.json`.
- The R2 sweep remains the recovery path for missed Worker notifications.
- Outbound provider sends continue to flow from WildDuck submission to ZoneMTA,
  then through the Mail Control Service internal SMTP relay.
- Cloudflare outbound sends continue to use the web server internal raw-send
  endpoint and the connected user's Cloudflare OAuth grant.
- Public clients must not receive Cloudflare tokens, WildDuck credentials,
  internal service URLs, Worker webhook secrets, or R2 credentials.

## Target Domain Modes

Add an explicit domain inbound mode instead of overloading the existing
Cloudflare apex-routing behavior.

### Existing Mode: Cloudflare Apex Routing

Use this mode when Cloudflare Email Routing owns the public recipient domain.

```text
domain: example.com
inbound_mode: cloudflare_apex_routing
cloudflare_routing_domain: example.com
visible_sender_domain: example.com
outbound_provider: cloudflare_email_sending
```

Required behavior:

- Provision Cloudflare Email Routing DNS for `example.com`.
- Create or update the catch-all rule for `example.com`.
- Send inbound Worker archives under the canonical domain `example.com`.

### New Mode: Google Workspace Split Delivery

Use this mode when Google Workspace owns public inbound MX for human users and
unknown or agent recipients route to a Cloudflare Email Routing subdomain.

```text
domain: example.com
inbound_mode: google_workspace_split_delivery
google_workspace_domain: example.com
cloudflare_routing_domain: agent-mx.example.com
visible_sender_domain: example.com
outbound_provider: cloudflare_email_sending
google_original_recipient_header: X-Gm-Original-To
```

Required behavior:

- Keep Google Workspace MX records at `example.com`.
- Provision Cloudflare Email Routing only for `agent-mx.example.com`.
- Create or update the Cloudflare catch-all rule for
  `agent-mx.example.com`.
- Onboard Cloudflare Email Sending for `example.com`, not only for
  `agent-mx.example.com`.
- Archive and deliver mail under canonical domain `example.com` after validating
  the receiving domain and original-recipient mapping.
- Send outbound agent mail as `agent@example.com`, not as
  `agent@agent-mx.example.com`.

## End-To-End Inbound Flow

External sender to human Google mailbox:

```text
sender@example.net
  -> DNS MX example.com
  -> Google Workspace
  -> active Google user/group human@example.com
  -> Gmail inbox
```

External sender to agent mailbox:

```text
sender@example.net
  -> DNS MX example.com
  -> Google Workspace
  -> no active Google user/group for agent-123@example.com
  -> Gmail routing setting for inactive/unrecognized accounts
  -> envelope recipient domain rewritten to agent-mx.example.com
  -> RCPT TO agent-123@agent-mx.example.com
  -> Cloudflare Email Routing MX for agent-mx.example.com
  -> Cloudflare catch-all rule
  -> AgentTeam Email Worker
  -> raw.eml and edge.json in R2 archive under canonical example.com
  -> signed Worker ingest notification to web server
  -> mail-control ingest queue
  -> replay through Haraka into WildDuck
  -> WildDuck mailbox agent-123@example.com
```

Workspace user to agent mailbox:

```text
human@example.com in Gmail
  -> sends to agent-123@example.com
  -> Google Workspace routing setting must route the same recipient class to
     agent-mx.example.com
  -> Cloudflare Email Routing subdomain
  -> AgentTeam Worker and replay path
  -> WildDuck mailbox agent-123@example.com
```

The implementation must prove both external-to-agent and
Google-user-to-agent delivery. If the Google Admin routing UI requires separate
settings for external inbound and internal Workspace-originated mail, the
product setup guide must create both settings with the same rewrite and route
actions.

## DNS Target State

The setup must never publish Cloudflare Email Routing MX records at the apex
`example.com` for this mode.

### Apex Domain: `example.com`

Google Workspace owns public inbound MX:

```text
example.com. MX 1  ASPMX.L.GOOGLE.COM.
example.com. MX 5  ALT1.ASPMX.L.GOOGLE.COM.
example.com. MX 5  ALT2.ASPMX.L.GOOGLE.COM.
example.com. MX 10 ALT3.ASPMX.L.GOOGLE.COM.
example.com. MX 10 ALT4.ASPMX.L.GOOGLE.COM.
```

Google outbound authentication:

```text
google._domainkey.example.com. TXT "<Google DKIM value from Admin console>"
example.com. TXT "v=spf1 include:_spf.google.com ... ~all"
```

Cloudflare Email Sending authentication for agent outbound:

```text
cf-bounce.example.com. MX  <Cloudflare-provided MX targets>
cf-bounce.example.com. TXT "v=spf1 include:_spf.mx.cloudflare.net ~all"
cf-bounce._domainkey.example.com. TXT "<Cloudflare Email Sending DKIM value>"
```

DMARC is shared by Google and Cloudflare sends:

```text
_dmarc.example.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Production rollout must start with `p=none`, collect reports, and only move to
`quarantine` or `reject` after Google and Cloudflare outbound mail both pass
DMARC.

SPF must be one TXT record per DNS name. If a root SPF record at `example.com`
authorizes more than Google, it must be merged into a single SPF record and
kept below the SPF DNS lookup limit. Do not publish one Google SPF record and a
second Cloudflare SPF record at the same DNS name.

### Cloudflare Receiving Subdomain: `agent-mx.example.com`

Cloudflare Email Routing owns MX for the receiving subdomain:

```text
agent-mx.example.com. MX <Cloudflare Email Routing MX target 1>
agent-mx.example.com. MX <Cloudflare Email Routing MX target 2>
agent-mx.example.com. MX <Cloudflare Email Routing MX target 3>
agent-mx.example.com. TXT "v=spf1 include:_spf.mx.cloudflare.net ~all"
cf2024-1._domainkey.agent-mx.example.com. TXT "<Cloudflare Email Routing DKIM value>"
```

The exact Cloudflare MX priorities and DKIM selector values must come from
Cloudflare's Email Routing configuration response or dashboard. The
implementation must not hard-code selector values other than in tests.

### DNS Records That Must Not Exist In This Mode

```text
example.com. MX route1.mx.cloudflare.net.
example.com. MX route2.mx.cloudflare.net.
example.com. MX route3.mx.cloudflare.net.
```

Those records belong to the existing Cloudflare apex-routing mode and would
take inbound human mail away from Google.

## Google Workspace Admin Setup

The setup guide must instruct the Google Workspace admin to verify
`example.com` in Google Workspace before changing MX records.

The admin must create Google users, aliases, and groups for every human address
that must remain in Gmail. Any address not represented by a Google user, alias,
or group is eligible to route to AgentTeam Email.

### Google Host Route

Create a mail route in:

```text
Apps -> Google Workspace -> Gmail -> Hosts
```

Required route values:

```text
Name: AgentTeam Email split delivery for example.com
Host/domain: agent-mx.example.com
Perform MX lookup on host: enabled
Port: default MX SMTP delivery, not 465
TLS: required
CA-signed certificate: required when the UI offers it
Hostname validation: enabled when the UI offers it and the route test passes
```

Do not configure the Cloudflare Email Sending SMTP endpoint
`smtp.mx.cloudflare.net:465` as the Google split-delivery host. That endpoint is
for authenticated outbound SMTP submission, not inbound recipient delivery.

Do not provision a Let's Encrypt certificate for `agent-mx.example.com` for the
Cloudflare subdomain path. Cloudflare receives SMTP at its own MX hosts for
Email Routing.

### Google Routing Setting For Unknown Recipient Delivery

Create a Gmail routing setting in:

```text
Apps -> Google Workspace -> Gmail -> Routing
```

Required setting values:

```text
Name: AgentTeam split delivery unknown recipients for example.com
Messages affected: Inbound messages
Action: Modify message
Account types: All inactive and unrecognized accounts
Modify message:
  Add X-Gm-Original-To header: enabled
  Change route: AgentTeam Email split delivery for example.com
  Change envelope recipient: Replace domain -> agent-mx.example.com
  Require secure transport (TLS): enabled
  Also reroute spam: disabled by default
  Suppress bounces from this recipient: disabled by default
```

The default must keep **Also reroute spam** disabled so Google's spam
classification can drop blatant spam before it reaches AgentTeam Email. If the
product later exposes a customer setting to receive Google-classified spam in
AgentTeam mailboxes, the UI must call out the increased abuse and storage
impact.

The setup must add an optional custom header only as diagnostic metadata:

```text
X-AgentTeam-Google-Split-Route: example.com
```

The Worker and mail-control must not treat this custom header as proof that the
message came from Google. External senders can forge message headers.

### Google Routing For Google User To Agent Delivery

The setup must verify that a Google Workspace user can send to
`agent-123@example.com` and that the message reaches WildDuck. This must be a
mandatory acceptance check.

If the unknown-recipient routing setting does not apply to Gmail-originated
same-domain mail, create a second routing setting with the same modify actions
and one of the following controls:

- `Messages affected: Internal outbound messages` with an envelope-recipient
  filter for the AgentTeam-owned address pattern; or
- `Messages affected: Internal inbound messages` if Google classifies the
  same-domain delivery path as internal inbound for the unrecognized recipient.

The second setting must not route active human Google users or Google groups to
AgentTeam Email. If a safe address pattern cannot be expressed in Google Admin
for the organization's agent addresses, the setup must require a documented
manual Google routing rule or an address-list workflow before the domain can be
marked live.

## Cloudflare Setup

Cloudflare OAuth must continue to be the customer authorization mechanism for
Cloudflare DNS, Email Routing, Worker deployment, R2 credential binding, and
Email Sending.

The required Cloudflare OAuth scope set already includes:

```text
dns.read
dns.write
zone.read
email-routing-address.read
email-routing-address.write
email-routing-rule.read
email-routing-rule.write
email-sending.read
email-sending.write
workers-scripts.read
workers-scripts.write
workers-r2.read
workers-r2.write
offline_access
```

The setup must not ask customers to paste Cloudflare API tokens for
user-domain provisioning or sending.

### Cloudflare Email Routing For Subdomain

Provision Email Routing on `agent-mx.example.com`, not `example.com`.

Required Cloudflare state:

```text
Email Routing domain/subdomain: agent-mx.example.com
Catch-all rule: active
Catch-all action: Send to Worker
Worker: AgentTeam Email Worker for this connection/deployment
Destination address: not required for Worker-only catch-all
Subaddressing: preserve existing account setting; do not require it
```

Implementation tasks:

- Extend Cloudflare provisioning to enable Email Routing for a subdomain.
- Determine the exact Cloudflare SDK or REST endpoint for adding an Email
  Routing subdomain. If the SDK does not expose the operation, use the official
  REST API and keep request/response parsing typed.
- Extend catch-all provisioning so it can target the subdomain routing surface.
- Extend status checks to distinguish:
  - apex Google MX present;
  - subdomain Cloudflare Routing MX present;
  - subdomain catch-all active;
  - subdomain catch-all points at the expected Worker;
  - Worker script exists and has current bindings;
  - Worker webhook secret reference exists;
  - R2 temporary credentials are valid or refreshable.

### Cloudflare Email Sending For Apex Domain

Provision Email Sending for `example.com`.

Required Cloudflare state:

```text
Email Sending domain: example.com
cf-bounce.example.com MX: present
cf-bounce.example.com SPF TXT: present
cf-bounce._domainkey.example.com DKIM TXT: present
_dmarc.example.com TXT: present or intentionally customer-managed
```

Implementation tasks:

- Add or verify Cloudflare Email Sending onboarding/status for `example.com`.
- Ensure outbound raw-send rejects before provider calls when the Cloudflare
  OAuth grant lacks `email-sending.write`.
- Ensure the raw-send call uses the connected user's Cloudflare OAuth access
  token, not an admin token.
- Ensure the raw-send `from` value is on the canonical domain
  `example.com`.
- Ensure sends from `agent@agent-mx.example.com` are not produced unless a
  future feature explicitly supports subdomain-visible sending.

## Canonical Address Mapping

The service must not treat `agent-mx.example.com` as the user's visible mailbox
domain.

For inbound messages in Google split-delivery mode:

```text
received envelope recipient: agent-123@agent-mx.example.com
canonical mailbox recipient: agent-123@example.com
claimed original recipient header: X-Gm-Original-To: agent-123@example.com
```

Mapping rules:

- The canonical domain is the configured `domain` value, such as
  `example.com`.
- The receiving domain is the configured `cloudflare_routing_domain`, such as
  `agent-mx.example.com`.
- The local part must be copied from the Cloudflare envelope recipient.
- `X-Gm-Original-To` must be stored as provenance when present.
- `X-Gm-Original-To` must not be the sole authority for the canonical mailbox
  recipient because direct senders can forge headers.
- If `X-Gm-Original-To` is present, it must match the canonical domain and the
  same local part after standard address normalization. Mismatch is suspicious
  evidence and must be recorded.
- If `X-Gm-Original-To` is missing, the system may still map
  `localpart@agent-mx.example.com` to `localpart@example.com` only when the
  domain mode explicitly allows direct subdomain delivery.

The product must choose and persist one direct-subdomain policy per domain:

```text
direct_subdomain_delivery: accept
direct_subdomain_delivery: reject_without_google_original_to
```

`reject_without_google_original_to` reduces accidental direct use of the bridge
subdomain but is not a cryptographic guarantee that Google handled the message.
If the product requires a cryptographic "Google only" inbound boundary, this
Cloudflare-subdomain design is insufficient and the domain must use a managed
SMTP ingress with traffic policy controls, such as SES Mail Manager, or an
AgentTeam-owned SMTP ingress.

## Runtime Projection Changes

Extend the runtime projection sent through `agentMail.runtime.sync` so
mail-control can validate both canonical and receiving domains.

Proposed projection shape:

```json
{
  "organization_id": "uuidv7",
  "organization_public_id": "org_public_id",
  "archive_prefix": "orgs/org_public_id/domains/example.com/mail/inbound",
  "worker_connection_id": "connection_public_id",
  "worker_domain_deployment_id": "domain_public_id",
  "domain": "example.com",
  "enabled": true,
  "cloudflare_zone_name": "example.com",
  "mail_from_domain": "example.com",
  "inbound_mode": "google_workspace_split_delivery",
  "cloudflare_routing_domain": "agent-mx.example.com",
  "google_workspace_domain": "example.com",
  "google_original_recipient_header": "X-Gm-Original-To",
  "direct_subdomain_delivery": "reject_without_google_original_to",
  "outbound_provider": "cloudflare_email_sending"
}
```

Implementation tasks:

- Add backend-owned TypeScript and Zod contracts for the new fields.
- Keep the existing projection accepted for `cloudflare_apex_routing`.
- Reject projection records where:
  - `cloudflare_routing_domain` is not equal to `domain` in
    `cloudflare_apex_routing` mode;
  - `cloudflare_routing_domain` is not a subdomain of `domain` in
    `google_workspace_split_delivery` mode;
  - `mail_from_domain` is not equal to `domain` for Cloudflare Email Sending
    sends from the apex domain;
  - `google_workspace_domain` differs from `domain` in the initial
    implementation.
- Preserve existing fail-closed behavior when a sender or recipient domain is
  not active.

## Worker Changes

The Worker must support canonical-domain mapping for Google split delivery.

Required Worker behavior:

- Read the Cloudflare envelope recipient from `message.to`.
- Derive the receiving domain from `message.to`.
- Resolve receiving domain to a canonical active domain using Worker binding
  configuration generated by the web server.
- For `cloudflare_apex_routing`, canonical domain equals receiving domain.
- For `google_workspace_split_delivery`, canonical domain equals
  `example.com` and receiving domain equals `agent-mx.example.com`.
- Write archive objects under the canonical domain prefix:

```text
orgs/<org_public_id>/domains/example.com/mail/inbound/YYYY/MM/DD/<ingest_id>/
```

- Persist both the received recipient and canonical recipient in `edge.json`.
- Persist Google split-delivery evidence in `edge.json`:
  - `inbound_mode`;
  - `received_recipient`;
  - `canonical_recipient`;
  - `received_domain`;
  - `canonical_domain`;
  - `google_original_to_header_present`;
  - `google_original_to_header_value` when present;
  - `google_original_to_matches_canonical`;
  - `direct_subdomain_delivery_policy`;
  - `direct_subdomain_delivery_result`.
- Send Worker notification metadata using canonical `recipient_domain`.
- Never include raw MIME bytes in the Worker notification.

The Worker must not log raw headers, full payloads, cookies, OAuth tokens,
R2 credentials, webhook secrets, or decrypted secrets.

## Mail-Control Inbound Changes

Mail-control must validate the canonical/receiving-domain relationship before
enqueueing or replaying a Worker-origin bundle.

Required validation:

- The notification's canonical `recipient_domain` must match an active runtime
  projection domain.
- `edge.json` must contain the expected `inbound_mode`.
- For Google split-delivery mode, `edge.json.received_domain` must equal the
  projection's `cloudflare_routing_domain`.
- For Google split-delivery mode, `edge.json.canonical_domain` must equal the
  projection's `domain`.
- The canonical recipient must be on the canonical domain.
- The received recipient must be on the Cloudflare routing subdomain.
- The local part used for WildDuck delivery must come from the received
  envelope recipient after address normalization.
- A mismatched `X-Gm-Original-To` must not silently rewrite delivery to a
  different local part or domain.
- Replayed SMTP to Haraka must target the canonical mailbox recipient, such as
  `agent-123@example.com`.
- Unknown canonical mailbox behavior remains the current accept-then-DSN path.

## Outbound Flow

Agent outbound mail continues to use the existing internal outbound path:

```text
Agent/user action
  -> authenticated web server mailbox operation
  -> WildDuck submit
  -> ZoneMTA queue
  -> Mail Control Service internal SMTP relay
  -> archive relay.eml and relay.json
  -> Cloudflare provider payload provider.json
  -> web server internal Cloudflare raw-send endpoint
  -> Cloudflare Email Sending with connected user's OAuth grant
  -> external recipient
```

Required outbound identity:

```text
Header From: agent-123@example.com
Provider boundary sender/from: agent-123@example.com
Return-Path: Cloudflare-controlled cf-bounce.example.com path
DKIM: Cloudflare Email Sending selector for example.com
DMARC: aligned through Cloudflare DKIM for example.com
```

The outbound provider must be selected from the canonical sender domain
`example.com`. The relay must not select `agent-mx.example.com` as the sender
domain for messages whose visible sender is `agent-123@example.com`.

Human outbound mail remains Google-owned:

```text
Header From: human@example.com
DKIM: Google Workspace selector for example.com
SPF: Google Workspace SPF where applicable
DMARC: aligned through Google authentication
```

## Feedback And DSN Requirements

Cloudflare Email Sending controls outbound `Return-Path` through its
`cf-bounce.<domain>` processing. AgentTeam Email must model Cloudflare feedback
before marking Cloudflare Email Sending support complete.

Required tasks:

- Determine the exact Cloudflare Email Sending feedback surfaces available for:
  - permanent bounces;
  - transient failures;
  - complaints or suppressions;
  - delivery logs;
  - API result `delivered`, `permanent_bounces`, and `queued`.
- Preserve existing `provider_reverse_path_mode:
  "cloudflare_send_raw_from"` behavior for Cloudflare raw sends.
- Ensure provider result metadata never exposes OAuth tokens or raw provider
  error bodies.
- Ensure DSNs generated for inbound unknown canonical recipients use the
  service-owned per-domain feedback address for `example.com`, not
  `agent-mx.example.com`.
- Ensure Cloudflare Email Sending DSN limitations remain documented:
  Cloudflare does not expose a provider API field for true provider-bound
  `MAIL FROM:<>`.

## Web UI And Product Setup Requirements

The domain setup UI must make the mode explicit.

Required mode labels:

```text
Cloudflare receives this domain directly
Google Workspace receives humans; AgentTeam receives agents through Cloudflare
```

For Google Workspace split delivery, the UI must display:

- Apex domain: `example.com`.
- Google Workspace MX status for `example.com`.
- Cloudflare receiving subdomain: `agent-mx.example.com`.
- Cloudflare Email Routing status for the subdomain.
- Cloudflare Worker catch-all status for the subdomain.
- Cloudflare Email Sending status for the apex domain.
- Google Admin manual steps still required.
- Last successful external-to-agent test.
- Last successful Google-user-to-agent test.
- Last successful agent outbound Cloudflare Email Sending test.
- DMARC monitoring status.

The UI must not claim Google Admin routing is automatically configured unless a
future implementation proves and owns that automation through Google Workspace
APIs and the required admin authorization.

## Provisioning Workflow

Required operator/customer flow:

1. Customer signs in to AgentTeam Email.
2. Customer connects Cloudflare through the existing Cloudflare OAuth flow.
3. Customer selects the Cloudflare account and zone for `example.com`.
4. Customer selects the Google Workspace split-delivery domain mode.
5. AgentTeam records canonical domain `example.com`.
6. AgentTeam proposes a Cloudflare routing subdomain, defaulting to
   `agent-mx.example.com`.
7. AgentTeam provisions Cloudflare Email Routing for `agent-mx.example.com`.
8. AgentTeam deploys or updates the Worker for the connection.
9. AgentTeam configures the subdomain catch-all to send to the Worker.
10. AgentTeam provisions Cloudflare Email Sending for `example.com`.
11. AgentTeam shows the required Google Admin route and routing settings.
12. Customer applies the Google Admin settings.
13. AgentTeam validates DNS and Cloudflare state.
14. Customer sends an external test message to an agent address.
15. Customer sends a Gmail test message from a Google Workspace user to the same
    agent address.
16. AgentTeam sends an outbound test from the agent address through Cloudflare
    Email Sending.
17. AgentTeam marks the domain live only after all required checks pass.

## Validation And Tests

### Unit And Contract Tests

Add tests for:

- Domain mode schema validation.
- Runtime projection serialization for both inbound modes.
- Rejection of invalid canonical/receiving-domain combinations.
- Worker canonical-domain mapping.
- Worker `edge.json` shape for Google split delivery.
- Worker notification metadata for canonical recipient domain.
- Web ingest validation for split-delivery edge metadata.
- Mail-control enqueue rejection for mismatched canonical domain, receiving
  domain, org, connection, deployment, archive prefix, and raw key family.
- Replay delivery to `agent@example.com` when received recipient is
  `agent@agent-mx.example.com`.
- Rejection or explicit handling of missing and mismatched
  `X-Gm-Original-To`.
- Cloudflare raw-send selection from canonical sender domain.
- Outbound rejection when the Cloudflare grant lacks Email Sending scope.
- Status DTOs that do not expose raw provider errors, OAuth tokens, or internal
  service URLs.

### End-To-End Tests

Add e2e scenarios that prove:

- External mail to `human@example.com` remains in Google Workspace and does not
  enter AgentTeam.
- External mail to `agent@example.com` routes through Google, rewrites to
  `agent@agent-mx.example.com`, enters Cloudflare Email Routing, reaches the
  Worker, archives under `example.com`, and delivers to WildDuck as
  `agent@example.com`.
- Google Workspace user mail from `human@example.com` to `agent@example.com`
  reaches WildDuck as `agent@example.com`.
- Direct mail to `agent@agent-mx.example.com` follows the configured
  `direct_subdomain_delivery` policy.
- Unknown canonical agent address produces the accept-then-DSN behavior under
  canonical domain `example.com`.
- Agent outbound from `agent@example.com` sends through Cloudflare Email
  Sending, not Google.
- Human outbound from `human@example.com` remains Google-owned.
- DMARC passes for representative Google and Cloudflare outbound messages.

### Manual Provider Smoke Tests

Before marking this mode generally available, run a real-provider smoke test
with a disposable domain and capture:

- Google Admin host route screenshot or exported setting summary.
- Google Admin routing setting summary.
- DNS records for apex Google MX.
- DNS records for Cloudflare receiving subdomain.
- Cloudflare Email Routing subdomain status.
- Cloudflare catch-all to Worker status.
- Cloudflare Email Sending apex status.
- Raw `edge.json` for an external-to-agent message.
- Raw `edge.json` for a Google-user-to-agent message.
- Provider message details showing Cloudflare DKIM alignment for agent outbound.
- Gmail message details showing Google DKIM alignment for human outbound.

Artifacts must redact tokens, cookies, secrets, full raw message bodies,
private mailbox contents, and private hostnames before any public issue or PR.

## Security And Abuse Notes

The Cloudflare receiving subdomain is a public MX target. Anyone who discovers
`agent-mx.example.com` can attempt direct delivery to
`agent@agent-mx.example.com`.

This design is acceptable only if direct subdomain delivery is treated as one
of these explicit policies:

- accepted as equivalent to mail addressed to the canonical agent mailbox; or
- rejected unless required Google split-delivery evidence is present, while
  acknowledging that message headers are not cryptographic proof.

This design must not be represented as a cryptographic Google-only route. If a
customer requires proof that only Google can submit unknown-recipient mail, use
a managed SMTP ingress with enforceable traffic policy controls or an
AgentTeam-owned SMTP ingress instead of Cloudflare Email Routing for the bridge
subdomain.

## Acceptance Checks

- `example.com` public MX records point only to Google Workspace.
- `agent-mx.example.com` MX records point only to Cloudflare Email Routing.
- Google routing rewrites unknown `localpart@example.com` recipients to
  `localpart@agent-mx.example.com`.
- Google routing adds `X-Gm-Original-To`.
- Cloudflare catch-all for `agent-mx.example.com` sends to the AgentTeam
  Worker.
- Worker archives under canonical domain `example.com`.
- Mail-control replays to canonical WildDuck recipient
  `localpart@example.com`.
- Cloudflare Email Sending is onboarded for `example.com`.
- Agent outbound sends as `localpart@example.com`.
- Google human outbound sends as `human@example.com`.
- Google and Cloudflare outbound mail both pass DMARC for `example.com`.
- Public status and diagnostics expose setup state, not credentials or raw
  provider secrets.
