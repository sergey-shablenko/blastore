export class AsyncMemoryStorage {
  state: Record<string, any> = {};

  getItem(key: string) {
    return Promise.resolve(this.state[key]);
  }

  setItem(key: string, value: any) {
    this.state[key] = value;
    return Promise.resolve();
  }

  removeItem(key: string) {
    delete this.state[key];
    return Promise.resolve();
  }
}
