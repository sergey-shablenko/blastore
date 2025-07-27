export class AsyncMemoryStorage {
    constructor() {
        this.state = {};
    }
    getItem(key) {
        return Promise.resolve(this.state[key]);
    }
    setItem(key, value) {
        this.state[key] = value;
        return Promise.resolve();
    }
    removeItem(key) {
        delete this.state[key];
        return Promise.resolve();
    }
}
