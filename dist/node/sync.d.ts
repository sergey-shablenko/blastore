import { IndexableKeyOf, KeyVariables, Switch, SyncSchema, Trigger, Unsubscribe } from './types';
export type BuildSync<TValidate extends Record<string, (v: unknown) => unknown | Error>, TInput, TOutput> = (schema: SyncSchema<TValidate, TInput, TOutput>) => Readonly<{
    schema: SyncSchema<TValidate, TInput, TOutput>;
    get<TGetKey extends IndexableKeyOf<TValidate>>(key: TGetKey, defaultValue: Exclude<ReturnType<TValidate[TGetKey]>, Error>, options?: KeyVariables<TGetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Exclude<ReturnType<TValidate[TGetKey]>, Error>;
    set<TSetKey extends IndexableKeyOf<TValidate>>(key: TSetKey, value: Exclude<ReturnType<TValidate[TSetKey]>, Error>, options?: KeyVariables<TSetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): boolean;
    remove<TRemoveKey extends IndexableKeyOf<TValidate>>(key: TRemoveKey, options?: KeyVariables<TRemoveKey> & {
        out?: {
            error?: Error;
        };
    }): boolean;
    subscribe<TSubKey extends IndexableKeyOf<TValidate>>(key: TSubKey, trigger: Trigger<Exclude<ReturnType<TValidate[TSubKey]>, Error>>, options?: KeyVariables<TSubKey>): Unsubscribe;
    untypedSubscribe(key: string, trigger: Trigger<Exclude<ReturnType<TValidate[keyof TValidate]>, Error>>): Unsubscribe;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'remove'): boolean;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'set' | string, data: Exclude<ReturnType<TValidate[TEmitKey]>, Error>, options?: KeyVariables<TEmitKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): boolean;
    untypedEmit(key: string, action: 'remove'): boolean;
    untypedEmit<TFDeserialize extends boolean>(key: string, action: 'set' | string, data: Switch<TFDeserialize, TOutput, Exclude<ReturnType<TValidate[keyof TValidate]>, Error>>, options?: {
        validate?: boolean;
        deserialize?: TFDeserialize;
        out?: {
            error?: Error;
        };
    }): boolean;
    buildKeyApi: <TApiKey extends IndexableKeyOf<TValidate>>(key: TApiKey, options?: KeyVariables<TApiKey> & {
        validateOnGet?: boolean;
        validateOnSet?: boolean;
        validateOnEmit?: boolean;
        out?: {
            error?: Error;
        };
    }) => {
        get(defaultValue: Exclude<ReturnType<TValidate[TApiKey]>, Error>): Exclude<ReturnType<TValidate[TApiKey]>, Error>;
        set(value: Exclude<ReturnType<TValidate[TApiKey]>, Error>): boolean;
        remove(): boolean;
        subscribe(trigger: Trigger<Exclude<ReturnType<TValidate[TApiKey]>, Error>>): Unsubscribe;
        emit(action: 'remove'): boolean;
        emit(action: 'set' | string, data: Exclude<ReturnType<TValidate[TApiKey]>, Error>): boolean;
    };
}>;
export declare const buildSync: <TValidate extends Record<string, (v: unknown) => unknown | Error>, TInput, TOutput>(schema: SyncSchema<TValidate, TInput, TOutput>) => ReturnType<BuildSync<TValidate, TInput, TOutput>>;
