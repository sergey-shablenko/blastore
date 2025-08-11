import { type KeyVariables } from '../types';
import { BuildSync } from '../sync';
export declare function useSyncStore<TStore extends ReturnType<BuildSync<any, any, any, any>>, TKey extends keyof TStore['schema']['validate'] & string>(store: TStore, key: TKey, defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>, options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}): {
    value: Exclude<ReturnType<TStore["schema"]["validate"][TKey]>, Error>;
    error: undefined;
    set: ReturnType<ReturnType<BuildSync<TStore["schema"]["validate"], TStore["schema"]["serialize"], TStore["schema"]["deserialize"], TKey>>["buildKeyApi"]>["set"];
    remove: () => boolean;
    emit: () => void;
    subscribe: (trigger: import("../types").Trigger) => import("../types").Unsubscribe;
};
