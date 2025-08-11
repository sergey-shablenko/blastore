import type { KeyVariables, SyncSchema, SyncStore, Trigger, Unsubscribe } from './types';
export type BuildSync<TValidate extends Record<string, (v: unknown) => unknown | Error>, TSerialize extends Partial<Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>>, TKey extends keyof TValidate & string> = (schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>, store: SyncStore, defaultOptions?: {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}) => {
    schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>;
    get<TGetKey extends TKey>(key: TGetKey, defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>, options?: KeyVariables<TGetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Exclude<ReturnType<TValidate[TGetKey]>, Error>;
    set<TSetKey extends TKey>(key: TSetKey, value: Exclude<ReturnType<TValidate[TSetKey]>, Error>, options?: KeyVariables<TSetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): boolean;
    remove<TRemoveKey extends TKey>(key: TRemoveKey, options?: KeyVariables<TRemoveKey> & {
        out?: {
            error?: Error;
        };
    }): boolean;
    subscribe<TSubKey extends TKey>(key: TSubKey, trigger: Trigger, variables?: KeyVariables<TSubKey>['variables']): Unsubscribe;
    untypedSubscribe(key: string, trigger: Trigger): Unsubscribe;
    emit<TEmitKey extends TKey>(key: TEmitKey, variables?: KeyVariables<TEmitKey>['variables']): void;
    untypedEmit(key: string): void;
    buildKeyApi: <TApiKey extends TKey>(key: TApiKey, options?: KeyVariables<TApiKey> & {
        validateOnGet?: boolean;
        validateOnSet?: boolean;
        out?: {
            error?: Error;
        };
    }) => {
        get(defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>): Exclude<ReturnType<TValidate[TApiKey]>, Error>;
        set(value: Exclude<ReturnType<TValidate[TApiKey]>, Error>): boolean;
        remove(): boolean;
        subscribe(trigger: Trigger): Unsubscribe;
        emit(): void;
    };
};
export declare const buildSync: <TValidate extends Record<string, (v: unknown) => unknown | Error>, TSerialize extends Partial<Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>>, TKey extends keyof TValidate & string>(schema: SyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>, store?: SyncStore, defaultOptions?: {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}) => ReturnType<BuildSync<TValidate, TSerialize, TDeserialize, TKey>>;
