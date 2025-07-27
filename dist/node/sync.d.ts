import type { KeyId, Scheme, SyncStore, Trigger, Unsubscribe } from './types';
export declare function buildSync<TValidate extends Record<string, (v: unknown) => unknown | Error>, TSerialize extends Partial<Record<TKey, (v: Exclude<ReturnType<TValidate[TKey]>, Error>) => unknown>>, TDeserialize extends Partial<Record<TKey, (v: unknown) => Exclude<ReturnType<TValidate[TKey]>, Error>>>, TKey extends keyof TValidate & string>(scheme: Scheme<TValidate, TSerialize, TDeserialize, TKey, TKey>, store?: SyncStore): {
    get: <TGetKey extends TKey>(key: TGetKey, defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>, options?: {
        variables?: KeyId[];
    }) => Exclude<ReturnType<TValidate[TGetKey]>, Error>;
    set: <TSetKey extends TKey>(key: TSetKey, value: Exclude<ReturnType<TValidate[TSetKey]>, Error>, options?: {
        variables?: KeyId[];
    }) => boolean;
    remove: <TRemoveKey extends TKey>(key: TRemoveKey, variables?: KeyId[]) => boolean;
    trySet: <TSetKey extends TKey>(key: TSetKey, value: Exclude<ReturnType<TValidate[TSetKey]>, Error>, options?: {
        variables?: KeyId[];
    }) => void | Error;
    tryGet: <TGetKey extends TKey>(key: TGetKey, options?: {
        variables?: KeyId[];
    }) => ReturnType<TValidate[TGetKey]> | Error;
    tryRemove: <TRemoveKey extends TKey>(key: TRemoveKey, variables?: KeyId[]) => void | Error;
    subscribe: <TSubKey extends TKey>(key: TSubKey, trigger: Trigger, options?: {
        variables?: KeyId[];
    }) => Unsubscribe;
    untypedSubscribe: (key: string, trigger: Trigger) => Unsubscribe;
    emit: (key: TKey, variables?: KeyId[]) => void;
    untypedEmit: (key: string) => void;
    buildKeyApi: <TApiKey extends TKey>(key: TApiKey, variables?: KeyId[]) => {
        get: (defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>) => Exclude<ReturnType<TValidate[TApiKey]>, Error>;
        set: (value: Exclude<ReturnType<TValidate[TApiKey]>, Error>) => boolean;
        remove: () => boolean;
        trySet: (value: Exclude<ReturnType<TValidate[TApiKey]>, Error>) => void | Error;
        tryGet: () => ReturnType<TValidate[TApiKey]> | Error;
        tryRemove: () => void | Error;
        subscribe: (trigger: Trigger) => Unsubscribe;
        emit: () => void;
    };
};
