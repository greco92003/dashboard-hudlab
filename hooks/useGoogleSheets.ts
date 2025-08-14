import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseGoogleSheetsOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
}

interface SheetData {
  values: string[][];
  headers?: string[];
  data?: Record<string, any>[];
}

interface SyncDealsOptions {
  spreadsheetId: string;
  sheetName?: string;
  mode?: 'replace' | 'append';
  dateRange?: {
    start: string;
    end: string;
  };
  includeHeaders?: boolean;
}

export function useGoogleSheets(options: UseGoogleSheetsOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { onSuccess, onError } = options;

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    onError?.(errorMessage);
    toast.error(errorMessage);
  }, [onError]);

  const handleSuccess = useCallback((data: any, successMessage?: string) => {
    setError(null);
    onSuccess?.(data);
    if (successMessage) {
      toast.success(successMessage);
    }
  }, [onSuccess]);

  // Ler dados de uma planilha
  const readSheet = useCallback(async (
    spreadsheetId: string,
    range: string,
    includeHeaders: boolean = true
  ): Promise<SheetData | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/google-sheets/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId,
          range,
          includeHeaders,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao ler planilha');
      }

      handleSuccess(result.data, 'Planilha lida com sucesso!');
      return result.data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      handleError(`Erro ao ler planilha: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleError, handleSuccess]);

  // Escrever dados em uma planilha
  const writeSheet = useCallback(async (
    spreadsheetId: string,
    range: string,
    values: (string | number | boolean)[][],
    mode: 'update' | 'append' = 'update'
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/google-sheets/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId,
          range,
          values,
          mode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao escrever na planilha');
      }

      handleSuccess(result, `Dados ${mode === 'append' ? 'adicionados' : 'atualizados'} com sucesso!`);
      return true;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      handleError(`Erro ao escrever na planilha: ${errorMessage}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleError, handleSuccess]);

  // Obter informações da planilha
  const getSheetInfo = useCallback(async (spreadsheetId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/google-sheets/info?spreadsheetId=${spreadsheetId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao obter informações da planilha');
      }

      handleSuccess(result.data);
      return result.data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      handleError(`Erro ao obter informações da planilha: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleError, handleSuccess]);

  // Sincronizar deals com Google Sheets
  const syncDeals = useCallback(async (options: SyncDealsOptions): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/google-sheets/sync-deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao sincronizar deals');
      }

      handleSuccess(result.data, result.message);
      return true;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      handleError(`Erro ao sincronizar deals: ${errorMessage}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleError, handleSuccess]);

  // Função para testar conexão
  const testConnection = useCallback(async (spreadsheetId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const info = await getSheetInfo(spreadsheetId);
      if (info) {
        toast.success(`Conexão bem-sucedida! Planilha: "${info.title}"`);
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro de conexão';
      handleError(`Erro ao testar conexão: ${errorMessage}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getSheetInfo, handleError]);

  return {
    loading,
    error,
    readSheet,
    writeSheet,
    getSheetInfo,
    syncDeals,
    testConnection,
  };
}
