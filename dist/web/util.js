const META = /[.*+?^${}()|[\]\\]/g;
const esc = (s) => s.replace(META, '\\$&');
export function buildRegexForKeyTemplate(parts) {
    return `^${parts
        .map(([literal, variable]) => variable ? `${esc(literal)}(\.+)` : esc(literal))
        .join('')}$`;
}
export function parseKey(tmpl) {
    const parts = [];
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
export function createKeyBuilder(compiledKeys) {
    let lastKey;
    let lastVars;
    let lastCompiled;
    let i = 0;
    let tmpKey;
    return function getFullKey(key, variables) {
        if (lastKey === key && lastVars === variables) {
            return lastCompiled;
        }
        for (i = 0; i < compiledKeys.length; i++) {
            tmpKey = compiledKeys[i];
            if (tmpKey.key === key && tmpKey.builder) {
                break;
            }
            if (i === compiledKeys.length - 1) {
                return key;
            }
        }
        lastKey = key;
        lastVars = variables;
        lastCompiled = tmpKey.builder(variables || {}) || key;
        return lastCompiled;
    };
}
