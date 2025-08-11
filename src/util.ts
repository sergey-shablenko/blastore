import { CompiledKeys, KeyVariable } from './types';

export function parseKey(tmpl: string): [string, string][] {
  const parts: [string, string][] = [];
  let i = 0;
  let varIdx = 0;
  while (i < tmpl.length) {
    const dollar = tmpl.indexOf('${', i);
    if (dollar === -1) {
      parts.push([tmpl.slice(i), '']);
      break;
    }
    if (dollar > 0 && tmpl[dollar - 1] === '\\') {
      parts.push([tmpl.slice(i, dollar - 1) + '${', '']);
      i = dollar + 2;
      continue;
    }
    const end = tmpl.indexOf('}', dollar);
    if (end === -1) {
      parts.push([tmpl.slice(i), '']);
      break;
    }
    parts.push([tmpl.slice(i, dollar), tmpl.slice(dollar + 2, end)]);
    varIdx += 1;
    i = end + 1;
  }
  return parts;
}

let lastKey: string | undefined;
let lastVars: Record<string, KeyVariable> | undefined;
let lastCompiled: string | undefined;

export function getFullKey(
  compiledKeys: CompiledKeys,
  key: string,
  variables: Record<string, KeyVariable>
) {
  const template = compiledKeys[key];
  if (template === undefined) {
    return key;
  }
  if (lastKey === key && lastVars === variables) {
    return lastCompiled!;
  }
  lastKey = key;
  lastVars = variables;
  lastCompiled = template(variables || {}) || key;
  return lastCompiled!;
}
