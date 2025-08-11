export class SyncMemoryStorage {
    constructor() {
        this.state = {};
    }
    getItem(key) {
        return this.state[key];
    }
    setItem(key, value) {
        this.state[key] = value;
    }
    removeItem(key) {
        delete this.state[key];
    }
}
