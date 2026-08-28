{{/*
PrettyK Pure — shared template helpers.
*/}}

{{- define "prettyk.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "prettyk.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "prettyk.labels" -}}
app.kubernetes.io/name: {{ include "prettyk.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: prettyk
{{- end }}

{{- define "prettyk.session.labels" -}}
{{ include "prettyk.labels" . }}
com.prettyk.session-id: {{ .Values.sessionId | default "unknown" }}
com.prettyk.generation: {{ .Values.generation | default "1" | quote }}
{{- end }}