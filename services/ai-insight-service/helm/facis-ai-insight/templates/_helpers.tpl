{{/*
Expand the name of the chart.
*/}}
{{- define "facis-ai-insight.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "facis-ai-insight.fullname" -}}
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

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "facis-ai-insight.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "facis-ai-insight.labels" -}}
helm.sh/chart: {{ include "facis-ai-insight.chart" . }}
{{ include "facis-ai-insight.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: facis
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "facis-ai-insight.selectorLabels" -}}
app.kubernetes.io/name: {{ include "facis-ai-insight.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "facis-ai-insight.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "facis-ai-insight.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Container image reference.
*/}}
{{- define "facis-ai-insight.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}

{{/*
Name of the LLM credentials Secret.
*/}}
{{- define "facis-ai-insight.llmSecretName" -}}
{{- if .Values.llmSecret.nameOverride }}
{{- .Values.llmSecret.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-llm-credentials" (include "facis-ai-insight.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Name of the Trino CA Secret.
*/}}
{{- define "facis-ai-insight.trinoCASecretName" -}}
{{- if .Values.trinoCA.nameOverride }}
{{- .Values.trinoCA.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-trino-ca" (include "facis-ai-insight.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Name of the main ConfigMap (Trino connectivity + application config).
*/}}
{{- define "facis-ai-insight.configMapName" -}}
{{- printf "%s-config" (include "facis-ai-insight.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Name of the prompt-templates ConfigMap.
*/}}
{{- define "facis-ai-insight.promptTemplatesConfigMapName" -}}
{{- if .Values.promptTemplates.nameOverride }}
{{- .Values.promptTemplates.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-prompt-templates" (include "facis-ai-insight.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
