{{- define "agentteam-email.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentteam-email.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.namespace" -}}
{{- default .Release.Namespace .Values.namespace.name -}}
{{- end -}}

{{- define "agentteam-email.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentteam-email.labels" -}}
helm.sh/chart: {{ include "agentteam-email.chart" . }}
app.kubernetes.io/part-of: agentteam-email
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "agentteam-email.componentLabels" -}}
{{ include "agentteam-email.labels" .root }}
app.kubernetes.io/name: {{ .name | quote }}
app.kubernetes.io/component: {{ .component | quote }}
{{- end -}}

{{- define "agentteam-email.selectorLabels" -}}
app.kubernetes.io/name: {{ .name | quote }}
app.kubernetes.io/instance: {{ .root.Release.Name | quote }}
{{- end -}}

{{- define "agentteam-email.image" -}}
{{- $image := . -}}
{{- $defaultTag := "" -}}
{{- if hasKey . "image" -}}
{{- $image = .image -}}
{{- $defaultTag = default "" .defaultTag -}}
{{- end -}}
{{- $tag := default (default "latest" $defaultTag) $image.tag -}}
{{- $digest := default "" $image.digest -}}
{{- if $digest -}}
{{- printf "%s:%s@%s" $image.repository $tag $digest -}}
{{- else -}}
{{- printf "%s:%s" $image.repository $tag -}}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.valueSourceEnv" -}}
{{- $source := default dict .source -}}
{{- if hasKey $source "valueFrom" -}}
valueFrom:
{{- toYaml $source.valueFrom | nindent 2 }}
{{- else if hasKey $source "value" -}}
value: {{ $source.value | quote }}
{{- else -}}
{{- fail "valueSource.value or valueSource.valueFrom is required" -}}
{{- end }}
{{- end -}}

{{- define "agentteam-email.requiredValueSourceEnv" -}}
{{- $source := default dict .source -}}
{{- $name := .name -}}
{{- if hasKey $source "valueFrom" -}}
valueFrom:
{{- toYaml $source.valueFrom | nindent 2 }}
{{- else -}}
value: {{ required (printf "%s.value or %s.valueFrom is required" $name $name) $source.value | quote }}
{{- end }}
{{- end -}}

{{- define "agentteam-email.webOauthEnv" -}}
- name: CLOUDFLARE_OAUTH_CLIENT_ID
{{- include "agentteam-email.envFor" (dict "root" . "name" "CLOUDFLARE_OAUTH_CLIENT_ID") | nindent 2 }}
{{- end -}}

{{- define "agentteam-email.requiredBundledConfigValue" -}}
{{- $source := default dict .source -}}
{{- $name := .name -}}
{{- if hasKey $source "valueFrom" -}}
{{- fail (printf "%s cannot use valueFrom because it is rendered into bundled mail config; set %s.value or provide external service config" $name $name) -}}
{{- end -}}
{{- required (printf "%s.value is required for bundled mail config" $name) $source.value -}}
{{- end -}}

{{- define "agentteam-email.generatedClaimName" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- if eq $name "mongodb" -}}{{ $root.Values.names.mongodb }}-data
{{- else if eq $name "redis" -}}{{ $root.Values.names.redis }}-data
{{- else if eq $name "rspamd" -}}{{ $root.Values.names.rspamd }}-data
{{- else if eq $name "harakaQueue" -}}{{ $root.Values.names.haraka }}-queue
{{- else -}}{{ fail (printf "unsupported persistence service %s" $name) }}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.claimName" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- $claim := required (printf "persistence.%s is required" $name) (index $root.Values.persistence $name) -}}
{{- default (include "agentteam-email.generatedClaimName" .) $claim.existingClaim -}}
{{- end -}}

{{- define "agentteam-email.storageVolumeSource" -}}
{{- $root := .root -}}
{{- if $root.Values.persistence.enabled -}}
persistentVolumeClaim:
  claimName: {{ include "agentteam-email.claimName" . | quote }}
{{- else -}}
emptyDir: {}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.mongodbUri" -}}
{{- $root := .root -}}
{{- $database := .database -}}
{{- $options := default "" .options -}}
{{- if $options -}}
{{- printf "mongodb://%s:27017/%s?replicaSet=%s&%s" $root.Values.names.mongodb $database $root.Values.mongodb.replicaSetName $options -}}
{{- else -}}
{{- printf "mongodb://%s:27017/%s?replicaSet=%s" $root.Values.names.mongodb $database $root.Values.mongodb.replicaSetName -}}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.mongodbClientOptions" -}}
{{- $pool := .pool -}}
{{- printf "maxPoolSize=%v&minPoolSize=%v&maxIdleTimeMS=%v" $pool.maxPoolSize $pool.minPoolSize $pool.maxIdleTimeMS -}}
{{- end -}}

{{- define "agentteam-email.envFor" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- if eq $name "AT_EMAIL_ADMIN_CF_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.admin.cloudflare.apiBaseUrl)) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_ACCOUNT_ID" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.accountId "name" "admin.cloudflare.r2.accountId") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_API_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.apiToken "name" "admin.cloudflare.r2.apiToken") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_ENDPOINT" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.endpoint "name" "admin.cloudflare.r2.endpoint") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_REGION" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.region) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_BUCKET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.bucket "name" "admin.cloudflare.r2.bucket") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.accessKeyId "name" "admin.cloudflare.r2.accessKeyId") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.r2.secretAccessKey "name" "admin.cloudflare.r2.secretAccessKey") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.wildduck.adminAccessToken "name" "wildduck.adminAccessToken") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_WILDDUCK_ACCESS_CONTROL_SECRET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.wildduck.accessControlSecret "name" "wildduck.accessControlSecret") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "http://%s:8080" $root.Values.names.wildduckApi))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:143" $root.Values.names.wildduckImap))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:25" $root.Values.names.haraka))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:2526" $root.Values.names.zonemtaDsn))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.mailRuntime.zonemtaRelayPassword "name" "mailRuntime.zonemtaRelayPassword") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.mailRuntime.feedbackMailboxPassword "name" "mailRuntime.feedbackMailboxPassword") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_CONTROL_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "http://%s:8081" $root.Values.names.mailControlService))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "http://%s:%v" $root.Values.names.webServer $root.Values.service.webServer.port))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.controlApi.controlToWebToken "name" "controlApi.controlToWebToken") -}}
{{- else if eq $name "AT_EMAIL_ADMIN_WILDDUCK_MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "wildduck" "options" (include "agentteam-email.mongodbClientOptions" (dict "pool" $root.Values.mongodb.clientPools.wildduck)))))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_CONTROL_MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agent_mail_control" "options" (include "agentteam-email.mongodbClientOptions" (dict "pool" $root.Values.mongodb.clientPools.control)))))) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_ENABLED" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.enabled) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_ORGANIZATION_ID" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.organizationId) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_DOMAIN" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.domain) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_ADMISSION_TOKEN" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.admissionToken) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_CAPABILITIES" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.capabilities) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_CLAIM_INTENT_TTL_SECONDS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.claimIntentTtlSeconds) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_DAILY_SEND_LIMIT" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.dailySendLimit) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_MAILBOX_LIFETIME_SECONDS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.mailboxLifetimeSeconds) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_MAILBOX_LOCAL_PREFIX" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.mailboxLocalPrefix) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_MAX_ACTIVE" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.maxActive) -}}
{{- else if eq $name "AT_EMAIL_ADMIN_TRIAL_TOTAL_SEND_LIMIT" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.trial.totalSendLimit) -}}
{{- else if eq $name "NODE_ENV" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "production")) -}}
{{- else if eq $name "PORT" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "4321")) -}}
{{- else if eq $name "FRONTEND_HOST" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "0.0.0.0")) -}}
{{- else if eq $name "PUBLIC_HOSTNAME" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (required "publicHostname is required" $root.Values.publicHostname))) -}}
{{- else if eq $name "DATABASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agentteam_email")))) -}}
{{- else if eq $name "MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agentteam_email")))) -}}
{{- else if eq $name "MONGODB_DATABASE" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "agentteam_email")) -}}
{{- else if eq $name "DATABASE_MAX_POOL_SIZE" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.webServer.databaseMaxPoolSize)) -}}
{{- else if eq $name "TMP_DIR" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.webServer.tmpDir) -}}
{{- else if eq $name "BETTER_AUTH_SECRET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.webServer.authSecret "name" "webServer.authSecret") -}}
{{- else if eq $name "ENCRYPT_SECRET_KEY" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.webServer.encryptionKey "name" "webServer.encryptionKey") -}}
{{- else if eq $name "CLOUDFLARE_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.admin.cloudflare.apiBaseUrl)) -}}
{{- else if eq $name "CLOUDFLARE_OAUTH_AUTHORIZATION_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.cloudflare.oauth.authorizationUrl) -}}
{{- else if eq $name "CLOUDFLARE_OAUTH_CLIENT_ID" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.admin.cloudflare.oauth.clientId "name" "admin.cloudflare.oauth.clientId") -}}
{{- else if eq $name "CLOUDFLARE_OAUTH_ISSUER" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.cloudflare.oauth.issuer) -}}
{{- else if eq $name "CLOUDFLARE_OAUTH_REVOKE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.cloudflare.oauth.revokeUrl) -}}
{{- else if eq $name "CLOUDFLARE_OAUTH_TOKEN_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.cloudflare.oauth.tokenUrl) -}}
{{- else if eq $name "PUBLIC_GOOGLE_CLIENT_ID" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.socialAuth.google.clientId) -}}
{{- else if eq $name "GOOGLE_CLIENT_SECRET" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.socialAuth.google.clientSecret) -}}
{{- else if eq $name "PUBLIC_LINKEDIN_CLIENT_ID" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.socialAuth.linkedin.clientId) -}}
{{- else if eq $name "LINKEDIN_CLIENT_SECRET" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.socialAuth.linkedin.clientSecret) -}}
{{- else if eq $name "STRIPE_PUBLISHABLE_KEY" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.stripe.publishableKey) -}}
{{- else if eq $name "STRIPE_SECRET_KEY" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.stripe.secretKey) -}}
{{- else if eq $name "SMTP_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.address) -}}
{{- else if eq $name "SMTP_FROM_EMAIL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.fromEmail) -}}
{{- else if eq $name "SMTP_PASSWORD" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.password) -}}
{{- else if eq $name "SMTP_PORT" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.port) -}}
{{- else if eq $name "SMTP_REPLY_TO_EMAIL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.replyToEmail) -}}
{{- else if eq $name "SMTP_SECURE_TLS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.secureTls) -}}
{{- else if eq $name "SMTP_SEND_AS_EMAIL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.sendAsEmail) -}}
{{- else if eq $name "SMTP_USERNAME" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.admin.smtp.username) -}}
{{- else -}}{{ fail (printf "unsupported environment variable %s" $name) }}
{{- end }}
{{- end -}}

{{- define "agentteam-email.configDataFromGlob" -}}
{{- $root := .root -}}
{{- range $path, $_ := $root.Files.Glob .glob }}
{{ base $path }}: |-
{{ tpl ($root.Files.Get $path) $root | nindent 2 }}
{{- end -}}
{{- end -}}

{{- define "agentteam-email.securityContext" -}}
{{- with .Values.containerSecurityContext }}
securityContext:
{{ toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{- define "agentteam-email.bundledSecurityContext" -}}
{{- with .Values.bundledContainerSecurityContext }}
securityContext:
{{ toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{- define "agentteam-email.podScheduling" -}}
{{- with .Values.nodeSelector }}
nodeSelector:
{{ toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.affinity }}
affinity:
{{ toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
{{ toYaml . | nindent 2 }}
{{- end }}
{{- end -}}
