export class SyncMemoryStorage {
  state: Record<string, any> = {};

  getItem(key: string) {
    return this.state[key];
  }

  setItem(key: string, value: unknown) {
    this.state[key] = value;
  }

  removeItem(key: string) {
    delete this.state[key];
  }
}
