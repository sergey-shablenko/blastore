"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStorage = void 0;
class MemoryStorage {
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
exports.MemoryStorage = MemoryStorage;
