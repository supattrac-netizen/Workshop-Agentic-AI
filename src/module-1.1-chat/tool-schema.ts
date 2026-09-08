const ALLOWED_KEYS = new Set([
  'type', 'description', 'properties', 'required', 'items', 'enum', 'format', 'nullable',
]);

const GEMINI_TYPES: Record<string, string> = {
  object: 'OBJECT', string: 'STRING', number: 'NUMBER', integer: 'INTEGER',
  boolean: 'BOOLEAN', array: 'ARRAY', null: 'NULL',
};

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const input = schema as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (key === 'type' && typeof value === 'string') output.type = GEMINI_TYPES[value.toLowerCase()] ?? value.toUpperCase();
    else if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const properties: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(value)) properties[name] = toGeminiSchema(child);
      output.properties = properties;
    } else if (key === 'items') output.items = toGeminiSchema(value);
    else output[key] = value;
  }
  return output;
}