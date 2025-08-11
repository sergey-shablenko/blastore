import type { AsyncSchema, AsyncStore, Trigger, Unsubscribe, KeyVariables } from './types';
export type BuildAsync<TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TSerialize extends Partial<Record<TKey, (v: Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>) => Promise<unknown>>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Promise<Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>>>>, TKey extends keyof TValidate & string> = (schema: AsyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>, store: AsyncStore, defaultOptions?: {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}) => {
    schema: AsyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>;
    get<TGetKey extends TKey>(key: TGetKey, defaultValue: Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>, options?: KeyVariables<TGetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Promise<Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>>;
    set<TSetKey extends TKey>(key: TSetKey, value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>, options?: KeyVariables<TSetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    remove<TRemoveKey extends TKey>(key: TRemoveKey, options?: KeyVariables<TRemoveKey> & {
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    subscribe<TSubKey extends TKey>(key: TSubKey, trigger: Trigger, options?: KeyVariables<TSubKey>): Unsubscribe;
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
        get(defaultValue: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>): Promise<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>;
        set(value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>): Promise<boolean>;
        remove(): Promise<boolean>;
        subscribe(trigger: Trigger): Unsubscribe;
        emit(): void;
    };
};
export declare const buildAsync: <TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TSerialize extends Partial<Record<TKey, (v: Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>) => Promise<unknown>>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Promise<Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>>>>, TKey extends keyof TValidate & string>(schema: AsyncSchema<TValidate, TSerialize, TDeserialize, TKey, TKey>, store?: AsyncStore, defaultOptions?: {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}) => ReturnType<BuildAsync<TValidate, TSerialize, TDeserialize, TKey>>;
