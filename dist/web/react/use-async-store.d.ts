import { type KeyVariables } from '../types';
import { BuildAsync } from '../async';
export declare function useAsyncStore<TStore extends ReturnType<BuildAsync<any, any, any>>, TKey extends keyof TStore['schema']['validate'] & string>(store: TStore, key: TKey, defaultValue: Exclude<ReturnType<TStore['schema']['validate'][TKey]>, Error>, options?: KeyVariables<TKey> & {
    validateOnGet?: boolean;
    validateOnSet?: boolean;
}): {
    isInitialised: boolean;
    value: Exclude<Awaited<ReturnType<TStore["schema"]["validate"][TKey]>>, Error>;
    error: undefined;
    set: ReturnType<ReturnType<BuildAsync<TStore["schema"]["validate"], any, any>>["buildKeyApi"]>["set"];
    remove: () => Promise<boolean>;
    emit: {
        (action: "remove"): Promise<boolean>;
        (action: "set" | string, data: any): Promise<boolean>;
    };
    subscribe: (trigger: import("../types").Trigger<any>) => import("../types").Unsubscribe;
};
