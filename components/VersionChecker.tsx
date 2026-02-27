"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { storage } from "@/lib/storage";

/**
 * Componente que verifica a versão do build e força logout se detectar nova versão
 *
 * Este componente deve ser incluído no layout principal da aplicação
 *
 * Melhorias implementadas:
 * - Usa localStorage para persistir versão entre sessões
 * - Verifica quando a aba ganha foco (visibilitychange)
 * - Verifica em toda navegação de rota
 * - Verifica periodicamente a cada 5 minutos
 */

const VERSION_KEY = "app_build_version";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

async function clearAppCacheOnly() {
  try {
    console.log("🧹 Limpando cache do app devido a nova versão...");

    // Limpa apenas dados de cache do app — NÃO limpa tokens de auth do Supabase
    const localKeys = storage.keys("local");
    for (const key of localKeys) {
      // Preserva cookies/tokens do Supabase (sb-*) e da autenticação
      if (
        key.startsWith("sb-") ||
        key.includes("supabase") ||
        key.includes("auth") ||
        key.includes("persistent_auth")
      ) {
        continue;
      }
      storage.removeItem(key, "local");
    }

    // Limpa sessionStorage inteiramente (não tem tokens de auth)
    storage.clear("session");

    // Limpa cache do service worker se disponível
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    console.log("✅ Cache do app limpo com sucesso");
  } catch (error) {
    console.error("❌ Erro ao limpar cache do app:", error);
  }
}

function reloadForNewVersion() {
  console.log("🔄 Nova versão detectada — recarregando a página...");

  clearAppCacheOnly().then(() => {
    // Atualiza a versão armazenada com a nova antes de recarregar
    // para evitar loop de reload
    window.location.reload();
  });
}

async function checkVersion() {
  try {
    const response = await fetch("/api/version", {
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("Falha ao verificar versão do servidor");
      return;
    }

    const data = await response.json();
    const serverVersion = data.version;
    // IMPORTANTE: Usa localStorage para persistir entre sessões
    const clientVersion = storage.getItem(VERSION_KEY, "local");

    // Se não há versão armazenada, é a primeira vez - armazena a versão atual
    if (!clientVersion) {
      storage.setItem(VERSION_KEY, serverVersion, "local");
      console.log("📦 Versão inicial armazenada:", serverVersion);
      return;
    }

    // Se as versões são diferentes, recarrega a página preservando a sessão
    if (clientVersion !== serverVersion) {
      console.warn(
        "⚠️ Nova versão detectada!",
        "\nVersão cliente:",
        clientVersion,
        "\nVersão servidor:",
        serverVersion,
      );
      // Salva a nova versão ANTES de recarregar para evitar loop infinito
      storage.setItem(VERSION_KEY, serverVersion, "local");
      reloadForNewVersion();
    }
  } catch (error) {
    console.error("Erro ao verificar versão:", error);
  }
}

export function VersionChecker() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Verifica imediatamente ao montar
    checkVersion();

    // Configura verificação periódica a cada 5 minutos
    intervalRef.current = setInterval(checkVersion, CHECK_INTERVAL);

    // Verifica quando a aba ganha foco
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("👁️ Aba ganhou foco - verificando versão...");
        checkVersion();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Limpa listeners ao desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Verifica a versão sempre que a rota mudar
  useEffect(() => {
    console.log("🔄 Navegação detectada - verificando versão...");
    checkVersion();
  }, [pathname]);

  // Este componente não renderiza nada
  return null;
}
