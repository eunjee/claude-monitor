import fs from 'fs';

class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  get(filePath) {
    const entry = this.cache.get(filePath);
    if (!entry) return null;

    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs === entry.mtimeMs) return entry.data;
    } catch {
      this.cache.delete(filePath);
    }
    return null;
  }

  set(filePath, data) {
    try {
      const stat = fs.statSync(filePath);
      this.cache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    } catch {
      // file may have been deleted
    }
  }

  has(filePath) {
    return this.cache.has(filePath);
  }

  clear() {
    this.cache.clear();
  }
}

export default new CacheManager();
