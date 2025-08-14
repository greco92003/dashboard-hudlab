"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useSyncContext } from "@/contexts/SyncContext";

interface SyncStatus {
  isRunning: boolean;
  syncId?: string;
  startedAt?: string;
  completedAt?: string;
  status?: string;
  error?: string;
}

export function SyncChecker() {
  const { triggerDataRefresh } = useSyncContext();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isRunning: false,
  });
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const syncStatusRef = useRef<SyncStatus>({ isRunning: false });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Mantém a ref sincronizada com o estado
  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Função para verificar status na API
  const checkSyncStatus = async (): Promise<SyncStatus> => {
    try {
      const response = await fetch("/api/deals-health", {
        method: "GET",
        cache: "no-cache",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      if (response.ok) {
        const data = await response.json();

        return {
          isRunning: data.sync?.isRunning || false,
          syncId: data.cache?.lastSyncAt || null,
          status: data.cache?.lastSyncStatus || null,
        };
      }
    } catch (error) {
      console.warn("❌ SyncChecker: API check failed:", error);
    }

    return { isRunning: false };
  };

  // Verificação inicial ao carregar a página - SEMPRE executa
  useEffect(() => {
    if (!isHydrated) return;

    const initialCheck = async () => {
      const status = await checkSyncStatus();
      setSyncStatus(status);
    };

    initialCheck();
  }, [isHydrated]);

  // Função para iniciar o monitoramento
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return; // Já está monitorando

    intervalRef.current = setInterval(async () => {
      const newStatus = await checkSyncStatus();
      const currentStatus = syncStatusRef.current;

      // Se sync terminou (estava rodando e agora não está mais)
      if (currentStatus.isRunning && !newStatus.isRunning) {
        // Para o monitoramento PRIMEIRO
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Atualiza o estado para parar o sync alert
        const finalStatus = { ...newStatus, isRunning: false };
        setSyncStatus(finalStatus);
        syncStatusRef.current = finalStatus;

        // Determina se foi sucesso ou erro baseado no status
        if (newStatus.status === "completed") {
          setShowSuccessAlert(true);
          setTimeout(() => setShowSuccessAlert(false), 4000);

          // Trigger data refresh for business data and follow-up pages
          console.log(
            "🔄 SyncChecker: Sync completed successfully, triggering data refresh..."
          );
          triggerDataRefresh();
        } else if (newStatus.status === "failed") {
          setShowErrorAlert(true);
          setTimeout(() => setShowErrorAlert(false), 5000);
        }

        return;
      }

      // Atualiza status se mudou
      if (newStatus.isRunning !== currentStatus.isRunning) {
        setSyncStatus(newStatus);
      }
    }, 3000); // Verifica a cada 3 segundos
  }, [triggerDataRefresh]);

  // Para o monitoramento
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Listener ativo apenas quando há sync em andamento
  useEffect(() => {
    if (!isHydrated) return;

    if (syncStatus.isRunning && !intervalRef.current) {
      startMonitoring();
    } else if (!syncStatus.isRunning && intervalRef.current) {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [isHydrated, syncStatus.isRunning, startMonitoring, stopMonitoring]);

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      {/* Sync Alert - aparece durante sincronização */}
      {syncStatus.isRunning && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 shadow-xl rounded-lg p-3 min-w-[250px]">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <span className="text-blue-800 dark:text-blue-200 font-medium text-sm">
                Sincronizando dados...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert - aparece quando sync completa com sucesso */}
      {showSuccessAlert && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 shadow-xl rounded-lg p-3 min-w-[250px]">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-green-800 dark:text-green-200 font-medium text-sm">
                Sincronização concluída com sucesso!
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert - aparece quando sync falha */}
      {showErrorAlert && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 shadow-xl rounded-lg p-3 min-w-[250px]">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-800 dark:text-red-200 font-medium text-sm">
                Erro na sincronização
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
