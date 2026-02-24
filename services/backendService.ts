
import { Incident, IdentifiedSubject } from '../types';

const DB_NAME = 'SentinelDB';
const DB_VERSION = 1;

export class BackendService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('incidents')) {
          db.createObjectStore('incidents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('registry')) {
          db.createObjectStore('registry', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = () => reject('Database initialization failed');
    });
  }

  // INCIDENT STORAGE
  async saveIncident(incident: Incident): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['incidents'], 'readwrite');
      const store = transaction.objectStore('incidents');
      store.put(incident);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Failed to save incident');
    });
  }

  async getAllIncidents(): Promise<Incident[]> {
    await this.init();
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['incidents'], 'readonly');
      const store = transaction.objectStore('incidents');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteIncident(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['incidents'], 'readwrite');
      const store = transaction.objectStore('incidents');
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Failed to delete incident');
    });
  }

  // REGISTRY STORAGE & DUPLICATE CHECK
  async saveTarget(subject: IdentifiedSubject): Promise<void> {
    await this.init();
    
    // Check for duplicates based on image data or ID
    const existing = await this.getAllTargets();
    const isDuplicate = existing.some(t => 
      t.mugshotBase64 === subject.mugshotBase64 || t.id === subject.id
    );
    
    if (isDuplicate) {
      throw new Error('DUPLICATE_FOUND');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['registry'], 'readwrite');
      const store = transaction.objectStore('registry');
      store.put(subject);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Failed to save target');
    });
  }

  async getAllTargets(): Promise<IdentifiedSubject[]> {
    await this.init();
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['registry'], 'readonly');
      const store = transaction.objectStore('registry');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteTarget(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['registry'], 'readwrite');
      const store = transaction.objectStore('registry');
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject('Failed to delete target');
    });
  }
}

export const db = new BackendService();
