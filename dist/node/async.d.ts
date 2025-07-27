import type { AsyncScheme, AsyncStore, KeyId, Trigger, Unsubscribe } from './types';
export declare function buildAsync<TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TSerialize extends Partial<Record<TKey, (v: Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>) => Promise<unknown>>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Promise<Exclude<Awaited<ReturnType<TValidate[TKey]>>, Error>>>>, TKey extends keyof TValidate & string>(scheme: AsyncScheme<TValidate, TSerialize, TDeserialize, TKey, TKey>, store?: AsyncStore): {
    get: <TGetKey extends TKey>(key: TGetKey, defaultValue: Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>, options?: {
        variables?: KeyId[];
    }) => Promise<Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>>;
    set: <TSetKey extends TKey>(key: TSetKey, value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>, options?: {
        variables?: KeyId[];
    }) => Promise<boolean>;
    remove: <TRemoveKey extends TKey>(key: TRemoveKey, variables?: KeyId[]) => Promise<boolean>;
    trySet: <TSetKey extends TKey>(key: TSetKey, value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>, options?: {
        variables?: KeyId[];
    }) => Promise<void | Error>;
    tryGet: <TGetKey extends TKey>(key: TGetKey, options?: {
        variables?: KeyId[];
    }) => Promise<ReturnType<TValidate[TGetKey]> | Error>;
    tryRemove: <TRemoveKey extends TKey>(key: TRemoveKey, variables?: KeyId[]) => Promise<void | Error>;
    subscribe: <TSubKey extends TKey>(key: TSubKey, trigger: Trigger, options?: {
        variables?: KeyId[];
    }) => Unsubscribe;
    untypedSubscribe: (key: string, trigger: Trigger) => Unsubscribe;
    emit: (key: TKey, variables?: KeyId[]) => void;
    untypedEmit: (key: string) => void;
    buildKeyApi: <TApiKey extends TKey>(key: TApiKey, variables?: KeyId[]) => {
        get: (defaultValue: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>) => Promise<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>;
        set: (value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>) => Promise<boolean>;
        remove: () => Promise<boolean>;
        trySet: (value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>) => Promise<void | Error>;
        tryGet: () => Promise<ReturnType<TValidate[TApiKey]> | Error>;
        tryRemove: () => Promise<void | Error>;
        subscribe: (trigger: Trigger) => Unsubscribe;
        emit: () => void;
    };
};
