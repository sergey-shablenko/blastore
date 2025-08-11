export declare class SyncMemoryStorage {
    state: Record<string, any>;
    getItem(key: string): any;
    setItem(key: string, value: unknown): void;
    removeItem(key: string): void;
}
