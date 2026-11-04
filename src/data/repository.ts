import type { Database } from '../types';
import { buildSeed, DB_VERSION } from './seed';

/**
 * Data-access boundary. The app only talks to this interface, so a real
 * backend (REST/GraphQL) can replace `localStorageRepository` without
 * touching components or the store.
 */
export interface Repository {
  load(): Promise<Database>;
  save(db: Database): Promise<void>;
  reset(): Promise<Database>;
}

const KEY = 'northstar-crm:v1';

export const localStorageRepository: Repository = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed?.version === DB_VERSION && Array.isArray(parsed.leads)) return parsed;
      }
    } catch {
      /* corrupted or unavailable storage: fall through to seed */
    }
    const seed = buildSeed();
    await this.save(seed);
    return seed;
  },
  async save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Could not persist data to localStorage', e);
      throw e;
    }
  },
  async reset() {
    const seed = buildSeed();
    await this.save(seed);
    return seed;
  },
};

export const repository: Repository = localStorageRepository;
