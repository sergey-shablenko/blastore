"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseKey = parseKey;
exports.getFullKey = getFullKey;
function parseKey(tmpl) {
    const parts = [];
    let out = '';
    let i = 0;
    let varIdx = 0;
    while (i < tmpl.length) {
        const dollar = tmpl.indexOf('${', i);
        if (dollar === -1) {
            out += tmpl.slice(i);
            break;
        }
        if (dollar > 0 && tmpl[dollar - 1] === '\\') {
            out += tmpl.slice(i, dollar - 1) + '${';
            i = dollar + 2;
            continue;
        }
        out += tmpl.slice(i, dollar);
        const end = tmpl.indexOf('}', dollar);
        if (end === -1) {
            out += tmpl.slice(dollar); // broken pattern
            break;
        }
        parts.push([out, varIdx]);
        varIdx += 1;
        i = end + 1;
    }
    return parts;
}
function getFullKey(compiledKeys, key, variables) {
    return compiledKeys[key]?.(variables ?? []) ?? key;
}
