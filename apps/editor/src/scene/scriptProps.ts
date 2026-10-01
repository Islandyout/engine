// Script props: inspector-editable values a Lua script declares with
//   -- @prop speed 5
//   -- @prop target "Player"
//   -- @prop armed true
// and reads through the `props` global. The declared list, and each prop's
// type, come from the source; the Script component stores only the values.

export type ScriptPropValue = number | boolean | string;

export interface ScriptPropDeclaration {
  name: string;
  defaultValue: ScriptPropValue;
}

const declarationPattern = /^[ \t]*--[ \t]*@prop[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+(.+?)[ \t]*$/gm;

function parseDefault(text: string): ScriptPropValue {
  if (text === "true") return true;
  if (text === "false") return false;
  const quoted = /^"(.*)"$|^'(.*)'$/.exec(text);
  if (quoted) return quoted[1] ?? quoted[2] ?? "";
  const number = Number(text);
  if (text !== "" && Number.isFinite(number)) return number;
  return text; // a bare word is a string
}

export function declaredProps(source: string): ScriptPropDeclaration[] {
  const seen = new Set<string>();
  const result: ScriptPropDeclaration[] = [];
  for (const match of source.matchAll(declarationPattern)) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    result.push({ name, defaultValue: parseDefault(match[2]!) });
  }
  return result;
}

// The props a Script actually has: every declared name, keeping a stored
// value when it has the declared type, otherwise the declared default.
// Undeclared stored values are dropped, so renaming or removing a
// declaration never leaves stale entries behind.
export function reconcileProps(
  source: string,
  stored: Record<string, unknown> | undefined,
): Record<string, ScriptPropValue> {
  const result: Record<string, ScriptPropValue> = {};
  for (const { name, defaultValue } of declaredProps(source)) {
    const value = stored?.[name];
    result[name] =
      typeof value === typeof defaultValue &&
      (typeof value !== "number" || Number.isFinite(value))
        ? (value as ScriptPropValue)
        : defaultValue;
  }
  return result;
}

// The bridge's editor_set_script_props line format: name\tkind\tvalue.
export function encodeProps(props: Record<string, ScriptPropValue>): string {
  return Object.entries(props)
    .map(([name, value]) => {
      if (typeof value === "number") return `${name}\tn\t${value}`;
      if (typeof value === "boolean") return `${name}\tb\t${value ? 1 : 0}`;
      return `${name}\ts\t${value.replace(/[\n\t]/g, " ")}`;
    })
    .join("\n");
}
