/**
 * Storage Wrapper - Centraliza o uso de sessionStorage ao invés de localStorage
 * 
 * Este módulo fornece uma interface unificada para armazenamento de dados,
 * usando sessionStorage por padrão para garantir que os dados sejam limpos
 * quando a aba/janela é fechada.
 */

type StorageType = 'session' | 'local';

class StorageManager {
  private getStorage(type: StorageType = 'session'): Storage | null {
    if (typeof window === 'undefined') return null;
    return type === 'session' ? window.sessionStorage : window.localStorage;
  }

  /**
   * Obtém um item do storage
   */
  getItem(key: string, type: StorageType = 'session'): string | null {
    try {
      const storage = this.getStorage(type);
      return storage?.getItem(key) ?? null;
    } catch (error) {
      console.warn(`Failed to get item "${key}" from ${type}Storage:`, error);
      return null;
    }
  }

  /**
   * Define um item no storage
   */
  setItem(key: string, value: string, type: StorageType = 'session'): void {
    try {
      const storage = this.getStorage(type);
      storage?.setItem(key, value);
    } catch (error) {
      console.warn(`Failed to set item "${key}" in ${type}Storage:`, error);
    }
  }

  /**
   * Remove um item do storage
   */
  removeItem(key: string, type: StorageType = 'session'): void {
    try {
      const storage = this.getStorage(type);
      storage?.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove item "${key}" from ${type}Storage:`, error);
    }
  }

  /**
   * Limpa todo o storage
   */
  clear(type: StorageType = 'session'): void {
    try {
      const storage = this.getStorage(type);
      storage?.clear();
    } catch (error) {
      console.warn(`Failed to clear ${type}Storage:`, error);
    }
  }

  /**
   * Obtém um item parseado como JSON
   */
  getJSON<T>(key: string, type: StorageType = 'session'): T | null {
    try {
      const item = this.getItem(key, type);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.warn(`Failed to parse JSON for "${key}" from ${type}Storage:`, error);
      return null;
    }
  }

  /**
   * Define um item como JSON
   */
  setJSON<T>(key: string, value: T, type: StorageType = 'session'): void {
    try {
      this.setItem(key, JSON.stringify(value), type);
    } catch (error) {
      console.warn(`Failed to stringify JSON for "${key}" in ${type}Storage:`, error);
    }
  }

  /**
   * Verifica se uma chave existe
   */
  hasItem(key: string, type: StorageType = 'session'): boolean {
    return this.getItem(key, type) !== null;
  }

  /**
   * Obtém todas as chaves do storage
   */
  keys(type: StorageType = 'session'): string[] {
    try {
      const storage = this.getStorage(type);
      if (!storage) return [];
      
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    } catch (error) {
      console.warn(`Failed to get keys from ${type}Storage:`, error);
      return [];
    }
  }

  /**
   * Limpa todos os storages (session e local)
   */
  clearAll(): void {
    this.clear('session');
    this.clear('local');
  }
}

// Exporta uma instância singleton
export const storage = new StorageManager();

// Exporta o tipo para uso em outros arquivos
export type { StorageType };

