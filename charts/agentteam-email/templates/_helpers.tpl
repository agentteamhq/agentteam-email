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

{{- define "agentteam-email.envFor" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- if eq $name "AGENT_MAIL_R2_ENDPOINT" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.objectStorage.endpoint "name" "objectStorage.endpoint") -}}
{{- else if eq $name "AGENT_MAIL_R2_REGION" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.objectStorage.region) -}}
{{- else if eq $name "AGENT_MAIL_R2_BUCKET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.objectStorage.bucket "name" "objectStorage.bucket") -}}
{{- else if eq $name "AGENT_MAIL_R2_ACCESS_KEY_ID" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.objectStorage.accessKeyId "name" "objectStorage.accessKeyId") -}}
{{- else if eq $name "AGENT_MAIL_R2_SECRET_ACCESS_KEY" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.objectStorage.secretAccessKey "name" "objectStorage.secretAccessKey") -}}
{{- else if eq $name "AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.wildduck.adminAccessToken "name" "wildduck.adminAccessToken") -}}
{{- else if eq $name "AGENT_MAIL_WILDDUCK_ACCESS_CONTROL_SECRET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.wildduck.accessControlSecret "name" "wildduck.accessControlSecret") -}}
{{- else if eq $name "AGENT_MAIL_WILDDUCK_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "http://%s:8080" $root.Values.names.wildduckApi))) -}}
{{- else if eq $name "AGENT_MAIL_WILDDUCK_IMAP_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:143" $root.Values.names.wildduckImap))) -}}
{{- else if eq $name "AGENT_MAIL_HARAKA_SMTP_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:25" $root.Values.names.haraka))) -}}
{{- else if eq $name "AGENT_MAIL_ZONEMTA_DSN_ADDRESS" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "%s:2526" $root.Values.names.zonemtaDsn))) -}}
{{- else if eq $name "AGENT_MAIL_ZONEMTA_RELAY_PASSWORD" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.mailRuntime.zonemtaRelayPassword "name" "mailRuntime.zonemtaRelayPassword") -}}
{{- else if eq $name "AGENT_MAIL_FEEDBACK_MAILBOX_PASSWORD" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.mailRuntime.feedbackMailboxPassword "name" "mailRuntime.feedbackMailboxPassword") -}}
{{- else if eq $name "AGENT_MAIL_OUTBOUND_PROVIDER" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.outbound.provider) -}}
{{- else if eq $name "AGENT_MAIL_CONTROL_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (printf "http://%s:8081" $root.Values.names.mailControlService))) -}}
{{- else if eq $name "AGENT_MAIL_CONTROL_API_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.controlApi.token "name" "controlApi.token") -}}
{{- else if eq $name "AGENT_MAIL_CLOUDFLARE_API_BASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.cloudflare.apiBaseUrl)) -}}
{{- else if eq $name "AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.cloudflare.accountId "name" "cloudflare.accountId") -}}
{{- else if eq $name "AGENT_MAIL_CLOUDFLARE_WORKER_SCRIPT_NAME" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.cloudflare.worker.scriptName)) -}}
{{- else if eq $name "AGENT_MAIL_CLOUDFLARE_WORKER_ARCHIVE_BUCKET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.cloudflare.worker.archiveBucket "name" "cloudflare.worker.archiveBucket") -}}
{{- else if eq $name "AGENT_MAIL_CLOUDFLARE_API_TOKEN" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.cloudflare.apiToken "name" "cloudflare.apiToken") -}}
{{- else if eq $name "AGENT_MAIL_AWS_REGION" -}}{{ if eq $root.Values.outbound.provider.value "ses" }}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.ses.region "name" "ses.region") }}{{ else }}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.ses.region) }}{{ end -}}
{{- else if eq $name "AGENT_MAIL_AWS_ACCESS_KEY_ID" -}}{{ if eq $root.Values.outbound.provider.value "ses" }}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.ses.accessKeyId "name" "ses.accessKeyId") }}{{ else }}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.ses.accessKeyId) }}{{ end -}}
{{- else if eq $name "AGENT_MAIL_AWS_SECRET_ACCESS_KEY" -}}{{ if eq $root.Values.outbound.provider.value "ses" }}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.ses.secretAccessKey "name" "ses.secretAccessKey") }}{{ else }}{{ include "agentteam-email.valueSourceEnv" (dict "source" $root.Values.ses.secretAccessKey) }}{{ end -}}
{{- else if eq $name "AGENTTEAM_EMAIL_WILDDUCK_MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "wildduck" "options" "maxPoolSize=4&minPoolSize=0&maxIdleTimeMS=60000")))) -}}
{{- else if eq $name "AGENTTEAM_EMAIL_CONTROL_MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agent_mail_control" "options" "maxPoolSize=4&minPoolSize=0&maxIdleTimeMS=60000")))) -}}
{{- else if eq $name "NODE_ENV" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "production")) -}}
{{- else if eq $name "PORT" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "4321")) -}}
{{- else if eq $name "FRONTEND_HOST" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "0.0.0.0")) -}}
{{- else if eq $name "PUBLIC_HOSTNAME" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (required "publicHostname is required" $root.Values.publicHostname))) -}}
{{- else if eq $name "DATABASE_URL" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agentteam_email")))) -}}
{{- else if eq $name "MONGODB_URI" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" (include "agentteam-email.mongodbUri" (dict "root" $root "database" "agentteam_email")))) -}}
{{- else if eq $name "MONGODB_DATABASE" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "agentteam_email")) -}}
{{- else if eq $name "DATABASE_MAX_POOL_SIZE" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" $root.Values.webServer.databaseMaxPoolSize)) -}}
{{- else if eq $name "TMP_DIR" -}}{{ include "agentteam-email.valueSourceEnv" (dict "source" (dict "value" "/tmp/agentteam-email")) -}}
{{- else if eq $name "BETTER_AUTH_SECRET" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.webServer.authSecret "name" "webServer.authSecret") -}}
{{- else if eq $name "ENCRYPT_SECRET_KEY" -}}{{ include "agentteam-email.requiredValueSourceEnv" (dict "source" $root.Values.webServer.encryptionKey "name" "webServer.encryptionKey") -}}
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
securityContext:
{{ toYaml .Values.containerSecurityContext | nindent 2 }}
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
