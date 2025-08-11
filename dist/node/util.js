"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseKey = parseKey;
exports.getFullKey = getFullKey;
function parseKey(tmpl) {
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
let lastKey;
let lastVars;
let lastCompiled;
function getFullKey(compiledKeys, key, variables) {
    const template = compiledKeys[key];
    if (template === undefined) {
        return key;
    }
    if (lastKey === key && lastVars === variables) {
        return lastCompiled;
    }
    lastKey = key;
    lastVars = variables;
    lastCompiled = template(variables || {}) || key;
    return lastCompiled;
}
