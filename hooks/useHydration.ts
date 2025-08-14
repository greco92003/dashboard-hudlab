"use client";

import { useState, useEffect } from "react";

/**
 * Hook para gerenciar hidratação de forma segura
 * Evita problemas de mismatch entre servidor e cliente
 */
export function useHydration() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
}

/**
 * Hook para gerenciar estado que depende de localStorage
 * Evita problemas de hidratação ao sincronizar com localStorage
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, boolean] {
  const [isHydrated, setIsHydrated] = useState(false);
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    setIsHydrated(true);
    
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored));
      }
    } catch (error) {
      console.warn(`Failed to read localStorage key "${key}":`, error);
    }
  }, [key]);

  const setValue = (value: T) => {
    setState(value);
    
    if (isHydrated) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn(`Failed to write to localStorage key "${key}":`, error);
      }
    }
  };

  return [state, setValue, isHydrated];
}

/**
 * Hook para componentes que precisam renderizar diferente no servidor vs cliente
 * Retorna um valor padrão durante SSR e o valor real após hidratação
 */
export function useClientValue<T>(serverValue: T, clientValue: T): T {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated ? clientValue : serverValue;
}
