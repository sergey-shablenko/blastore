import { CompiledKeys, KeyVariable } from './types';
export declare function buildRegexForKeyTemplate(parts: [string, string][]): string;
export declare function parseKey(tmpl: string): [string, string][];
export declare function createKeyBuilder(compiledKeys: CompiledKeys): (key: string, variables: Record<string, KeyVariable>) => string;
