{{- define "facis-guard.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "facis-guard.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "facis-guard.labels" -}}
helm.sh/chart: {{ include "facis-guard.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "facis-guard.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "facis-guard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "facis-guard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Public origin without a trailing slash; required, https unless dev. */}}
{{- define "facis-guard.publicUrl" -}}
{{- $u := required "publicUrl is required (the guard's public https origin)" .Values.publicUrl | trimSuffix "/" }}
{{- if and (not .Values.dev) (not (hasPrefix "https://" $u)) }}
{{- fail "publicUrl must be https (set dev=true for a local http setup)" }}
{{- end }}
{{- $u }}
{{- end }}

{{- define "facis-guard.hydraSecretName" -}}
{{- default (printf "%s-hydra" (include "facis-guard.fullname" .)) .Values.existingSecrets.hydra }}
{{- end }}
{{- define "facis-guard.postgresSecretName" -}}
{{- default (printf "%s-postgres" (include "facis-guard.fullname" .)) .Values.existingSecrets.postgres }}
{{- end }}
{{- define "facis-guard.loginSecretName" -}}
{{- default (printf "%s-login" (include "facis-guard.fullname" .)) .Values.existingSecrets.loginProvider }}
{{- end }}

{{- define "facis-guard.policyUrl" -}}
{{- if .Values.policyEngine.enabled }}
{{- printf "http://%s-policy:8181/v1/data/facis/login/allow" (include "facis-guard.fullname" .) }}
{{- else }}
{{- required "policyEngine.url is required when policyEngine.enabled is false" .Values.policyEngine.url }}
{{- end }}
{{- end }}

{{- define "facis-guard.clientIds" -}}
{{- $ids := list }}
{{- range .Values.clients }}{{ $ids = append $ids (required "clients[].clientId is required" .clientId) }}{{ end }}
{{- if eq (len $ids) 0 }}{{ fail "clients must list at least one web application" }}{{ end }}
{{- join "," $ids }}
{{- end }}
