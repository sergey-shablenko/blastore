import { AsyncSchema, IndexableKeyOf, KeyVariables, Switch, Trigger, Unsubscribe } from './types';
export type BuildAsync<TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TInput, TOutput> = (schema: AsyncSchema<TValidate, TInput, TOutput>) => Readonly<{
    schema: AsyncSchema<TValidate, TInput, TOutput>;
    get<TGetKey extends IndexableKeyOf<TValidate>>(key: TGetKey, defaultValue: Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>, options?: KeyVariables<TGetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Promise<Exclude<Awaited<ReturnType<TValidate[TGetKey]>>, Error>>;
    set<TSetKey extends IndexableKeyOf<TValidate>>(key: TSetKey, value: Exclude<Awaited<ReturnType<TValidate[TSetKey]>>, Error>, options?: KeyVariables<TSetKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    remove<TRemoveKey extends IndexableKeyOf<TValidate>>(key: TRemoveKey, options?: KeyVariables<TRemoveKey> & {
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    subscribe<TSubKey extends IndexableKeyOf<TValidate>>(key: TSubKey, trigger: Trigger<Exclude<Awaited<ReturnType<TValidate[TSubKey]>>, Error>>, options?: KeyVariables<TSubKey>): Unsubscribe;
    untypedSubscribe(key: string, trigger: Trigger<Exclude<Awaited<ReturnType<TValidate[keyof TValidate]>>, Error>>): Unsubscribe;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'remove'): Promise<boolean>;
    emit<TEmitKey extends IndexableKeyOf<TValidate>>(key: TEmitKey, action: 'set' | string, data: Exclude<Awaited<ReturnType<TValidate[TEmitKey]>>, Error>, options?: KeyVariables<TEmitKey> & {
        validate?: boolean;
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    untypedEmit(key: string, action: 'remove'): Promise<boolean>;
    untypedEmit<TFDeserialize extends boolean>(key: string, action: 'set' | string, data: Switch<TFDeserialize, TOutput, Exclude<Awaited<ReturnType<TValidate[keyof TValidate]>>, Error>>, options?: {
        validate?: boolean;
        deserialize?: TFDeserialize;
        out?: {
            error?: Error;
        };
    }): Promise<boolean>;
    buildKeyApi: <TApiKey extends IndexableKeyOf<TValidate>>(key: TApiKey, options?: KeyVariables<TApiKey> & {
        validateOnGet?: boolean;
        validateOnSet?: boolean;
        validateOnEmit?: boolean;
        out?: {
            error?: Error;
        };
    }) => {
        get(defaultValue: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>): Promise<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>;
        set(value: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>): Promise<boolean>;
        remove(): Promise<boolean>;
        subscribe(trigger: Trigger<Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>>): Unsubscribe;
        emit(action: 'remove'): Promise<boolean>;
        emit(action: 'set' | string, data: Exclude<Awaited<ReturnType<TValidate[TApiKey]>>, Error>): Promise<boolean>;
    };
}>;
export declare const buildAsync: <TValidate extends Record<string, (v: unknown) => Promise<unknown | Error>>, TInput, TOutput>(schema: AsyncSchema<TValidate, TInput, TOutput>) => ReturnType<BuildAsync<TValidate, TInput, TOutput>>;
