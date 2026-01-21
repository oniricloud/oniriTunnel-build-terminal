class AllowedStore {
  constructor() {
    this.store = {};
  }

  async createServiceStore(storeName, data) {
    this.store[storeName] = data;
  }

  async getAllowedList(storeName) {
    return this.store[storeName];
  }

  async isAllowed(storeName, key) {
    return this.store[storeName].includes(key);
  }

  async setAllowedList(storeName, keys) {
    this.store[storeName] = keys;
  }

  async deleteAllowed(storeName, key) {
    this.store[storeName] = this.store[storeName].filter((k) => k !== key);
  }

  async clearAllowedList(storeName) {
    this.store[storeName] = [];
  }
}

export default AllowedStore;
