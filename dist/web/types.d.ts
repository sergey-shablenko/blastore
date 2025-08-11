export interface SyncSchema<TValidate extends Record<string, (v: unknown) => unknown | Error>, TSerialize extends Partial<Record<TSerializeKey, (v: Exclude<ReturnType<TValidate[TSerializeKey]>, Error>) => unknown>>, TDeserialize extends Partial<Record<TDeserializeKey, (v: unknown) => Exclude<ReturnType<TValidate[TDeserializeKey]>, Error>>>, TSerializeKey extends keyof TValidate, TDeserializeKey extends keyof TValidate> {
    validate: TValidate;
    defaultSerialize?: (v: unknown) => unknown;
    defaultDeserialize?: (v: unknown) => unknown;
    serialize?: TSerialize;
    deserialize?: TDeserialize;
}
export interface AsyncSchema<TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TSerialize extends Partial<Record<TSerializeKey, (v: Exclude<Awaited<ReturnType<TValidate[TSerializeKey]>>, Error>) => Promise<unknown>>>, TDeserialize extends Partial<Record<TDeserializeKey, (v: unknown) => Promise<Exclude<Awaited<ReturnType<TValidate[TDeserializeKey]>>, Error>>>>, TSerializeKey extends keyof TValidate, TDeserializeKey extends keyof TValidate> {
    validate: TValidate;
    defaultSerialize?: (v: unknown) => Promise<unknown>;
    defaultDeserialize?: (v: unknown) => Promise<unknown>;
    serialize?: TSerialize;
    deserialize?: TDeserialize;
}
export interface SyncStore {
    getItem(key: string): unknown;
    setItem(key: string, value: unknown): unknown;
    removeItem(key: string): void;
}
export interface AsyncStore {
    getItem(key: string): Promise<any>;
    setItem(key: string, value: unknown): Promise<unknown>;
    removeItem(key: string): Promise<void>;
}
export type Trigger = () => unknown;
export type Unsubscribe = () => void;
export type KeyVariable = string | number | boolean;
export type CompiledKeys = Record<string, (vars: Record<string, KeyVariable>) => string>;
export type ExtractVars<S extends string> = S extends `${string}\${${infer Var}}${infer Rest}` ? Var | ExtractVars<Rest> : never;
export type KeyVariables<K extends string> = [ExtractVars<K>] extends [never] ? {
    variables?: never;
} : {
    variables: Record<ExtractVars<K>, string>;
};
