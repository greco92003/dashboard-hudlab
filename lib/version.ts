/**
 * Sistema de Versionamento de Build
 * 
 * Gerencia a versão do build para detectar quando um novo deploy foi feito
 * e forçar logout/limpeza de cache quando necessário
 */

import { storage } from './storage';

// Gera um ID único baseado no timestamp do build
// Este valor será diferente a cada build/deploy
export const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || 
                             process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 
                             Date.now().toString();

const VERSION_KEY = 'app_build_version';

/**
 * Obtém a versão armazenada no cliente
 */
export function getStoredVersion(): string | null {
  return storage.getItem(VERSION_KEY);
}

/**
 * Armazena a versão atual no cliente
 */
export function setStoredVersion(version: string): void {
  storage.setItem(VERSION_KEY, version);
}

/**
 * Verifica se a versão do cliente está desatualizada
 */
export function isVersionOutdated(serverVersion: string): boolean {
  const clientVersion = getStoredVersion();
  
  // Se não há versão armazenada, é a primeira vez - não está desatualizado
  if (!clientVersion) {
    setStoredVersion(serverVersion);
    return false;
  }
  
  // Compara as versões
  return clientVersion !== serverVersion;
}

/**
 * Limpa todos os dados do cliente (cookies, storage, cache)
 */
export async function clearClientData(): Promise<void> {
  try {
    console.log('🧹 Limpando dados do cliente devido a nova versão...');
    
    // Limpa sessionStorage e localStorage
    storage.clearAll();
    
    // Limpa cookies
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      
      // Remove o cookie em todos os paths possíveis
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    }
    
    // Limpa cache do service worker se disponível
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    console.log('✅ Dados do cliente limpos com sucesso');
  } catch (error) {
    console.error('❌ Erro ao limpar dados do cliente:', error);
  }
}

/**
 * Força logout e redireciona para login
 */
export function forceLogoutAndRedirect(): void {
  console.log('🔄 Forçando logout devido a nova versão do sistema...');
  
  // Limpa dados
  clearClientData().then(() => {
    // Redireciona para login
    window.location.href = '/login?reason=version_update';
  });
}

/**
 * Valida a versão e executa ações necessárias
 */
export async function validateVersion(serverVersion: string): Promise<boolean> {
  if (isVersionOutdated(serverVersion)) {
    console.warn('⚠️ Nova versão detectada! Versão atual:', serverVersion);
    forceLogoutAndRedirect();
    return false;
  }
  
  return true;
}

/**
 * Hook para validação de versão em componentes React
 */
export function useVersionCheck() {
  if (typeof window === 'undefined') return;
  
  // Verifica a versão a cada 5 minutos
  const checkInterval = 5 * 60 * 1000; // 5 minutos
  
  const checkVersion = async () => {
    try {
      const response = await fetch('/api/version');
      if (response.ok) {
        const data = await response.json();
        await validateVersion(data.version);
      }
    } catch (error) {
      console.error('Erro ao verificar versão:', error);
    }
  };
  
  // Verifica imediatamente
  checkVersion();
  
  // Configura verificação periódica
  const interval = setInterval(checkVersion, checkInterval);
  
  return () => clearInterval(interval);
}

