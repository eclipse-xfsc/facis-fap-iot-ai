{{/*
Expand the name of the chart.
*/}}
{{- define "facis-ai-insight-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "facis-ai-insight-ui.fullname" -}}
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
{{- define "facis-ai-insight-ui.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource in this chart.
*/}}
{{- define "facis-ai-insight-ui.labels" -}}
helm.sh/chart: {{ include "facis-ai-insight-ui.chart" . }}
{{ include "facis-ai-insight-ui.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: facis
app: orce
component: ai-insight-ui
{{- with .Values.extraLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels (used to identify resources belonging to this release).
*/}}
{{- define "facis-ai-insight-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "facis-ai-insight-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the flows ConfigMap.
Prefers the explicit value from .Values.flows.configMapName; falls back to
the chart fullname with a "-flows" suffix so it is always unique per release.
*/}}
{{- define "facis-ai-insight-ui.flowsConfigMapName" -}}
{{- default (printf "%s-flows" (include "facis-ai-insight-ui.fullname" .)) .Values.flows.configMapName }}
{{- end }}

{{/*
Name of the UI files ConfigMap.
*/}}
{{- define "facis-ai-insight-ui.uiFilesConfigMapName" -}}
{{- default (printf "%s-ui-files" (include "facis-ai-insight-ui.fullname" .)) .Values.uiFiles.configMapName }}
{{- end }}

{{/*
Name of the LLM API keys Secret.
*/}}
{{- define "facis-ai-insight-ui.llmSecretName" -}}
{{- default (printf "%s-llm-secrets" (include "facis-ai-insight-ui.fullname" .)) .Values.llmSecret.name }}
{{- end }}

{{/*
Render the flows JSON content.
Priority: .Values.flows.inlineContent > .Files.Get .Values.flows.filePath > placeholder.
*/}}
{{- define "facis-ai-insight-ui.flowsContent" -}}
{{- if .Values.flows.inlineContent }}
{{- .Values.flows.inlineContent }}
{{- else if .Files.Get .Values.flows.filePath }}
{{- .Files.Get .Values.flows.filePath }}
{{- else }}
[]
{{- end }}
{{- end }}

{{/*
Render extra annotations for a resource, merging chart-level extraAnnotations.
*/}}
{{- define "facis-ai-insight-ui.annotations" -}}
{{- with .Values.extraAnnotations }}
{{ toYaml . }}
{{- end }}
{{- end }}
