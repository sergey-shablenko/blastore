import { CompiledKeys, KeyId } from './types';
export declare function parseKey(tmpl: string): [string, number][];
export declare function getFullKey(compiledKeys: CompiledKeys, key: string, variables?: KeyId[]): string;
