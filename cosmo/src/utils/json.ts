/**
 * Минимальные JSON-типы и guard'ы (без RJSF / JSON Schema-зависимостей).
 * Общие для monaco / keywords / validation / roles.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** `false` в качестве схемы означает «свойства не должно быть» (см. ветки then в манифесте). */
export type SchemaNode = JsonSchema | boolean;

export interface JsonSchema {
  $comment?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  default?: JsonValue;
  readOnly?: boolean;

  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: SchemaNode;
  items?: SchemaNode | SchemaNode[];
  additionalItems?: SchemaNode;
  minItems?: number;
  maxItems?: number;

  enum?: JsonValue[];
  const?: JsonValue;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: SchemaNode;
  else?: SchemaNode;

  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  [keyword: string]: unknown;
}

export function isSchemaObject(node: SchemaNode | undefined): node is JsonSchema {
  return typeof node === 'object' && node !== null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
