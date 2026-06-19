class IndexedDbService {
  private dbName = 'TakeoutFixDB';
  private dbVersion = 3;
  private db: IDBDatabase | null = null;

  private init(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (e) => {
        const db = request.result;
        const transaction = request.transaction || (e.target as any).transaction;
        if (!db.objectStoreNames.contains('telemetry')) {
          db.createObjectStore('telemetry');
        }
        if (!db.objectStoreNames.contains('checkpoints')) {
          db.createObjectStore('checkpoints');
        }
        
        let filesStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('files')) {
          filesStore = db.createObjectStore('files');
        } else {
          filesStore = transaction.objectStore('files');
        }
        
        if (!filesStore.indexNames.contains('status')) {
          filesStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions');
        }
      };
    });
  }

  async set(storeName: string, key: string, value: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setAll(storeName: string, items: { key: string; value: any }[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      for (const item of items) {
        store.put(item.value, item.key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async get(storeName: string, key: string): Promise<any> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(storeName: string, key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName: string): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllKeys(storeName: string): Promise<string[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result as string[]) || []);
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async countByIndex(
    storeName: string,
    indexName: string,
    indexValue: any
  ): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.count(IDBKeyRange.only(indexValue));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllByIndex(
    storeName: string,
    indexName: string,
    indexValue: any
  ): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const out: any[] = [];
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.openCursor(IDBKeyRange.only(indexValue), 'next');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingFilesPage(lastId: string | null, limit: number): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const out: any[] = [];
      const transaction = db.transaction('files', 'readonly');
      const store = transaction.objectStore('files');
      const index = store.index('status');
      const request = index.openCursor(IDBKeyRange.only('pending'), 'next');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        const record = cursor.value;
        if (lastId && record.id <= lastId) {
          cursor.continue();
          return;
        }
        out.push(record);
        if (out.length >= limit) {
          resolve(out);
          return;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const indexedDbService = new IndexedDbService();

