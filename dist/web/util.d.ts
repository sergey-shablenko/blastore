import { CompiledKeys, KeyVariable } from './types';
export declare function parseKey(tmpl: string): [string, string][];
export declare function getFullKey(compiledKeys: CompiledKeys, key: string, variables: Record<string, KeyVariable>): string;
