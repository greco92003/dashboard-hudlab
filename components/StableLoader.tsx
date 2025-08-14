"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";

interface StableLoaderProps {
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  timeout?: number; // Timeout em ms (padrão: 10 segundos)
  fallbackContent?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function StableLoader({
  loading,
  error,
  onRetry,
  timeout = 10000,
  fallbackContent,
  children,
  className = "",
}: StableLoaderProps) {
  const [timedOut, setTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Reset timeout quando loading muda
  useEffect(() => {
    setTimedOut(false);

    if (loading) {
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, timeout);

      return () => clearTimeout(timer);
    }
  }, [loading, timeout]);

  // Reset retry count quando não está mais carregando
  useEffect(() => {
    if (!loading && !error) {
      setRetryCount(0);
    }
  }, [loading, error]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    setTimedOut(false);
    onRetry?.();
  };

  // Se não está carregando e não há erro, mostrar conteúdo
  if (!loading && !error) {
    return <>{children}</>;
  }

  // Se há erro, mostrar interface de erro
  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 space-y-4 ${className}`}
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Erro ao carregar dados</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {error.message || "Ocorreu um erro inesperado. Tente novamente."}
          </p>
          {retryCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Tentativas: {retryCount}
            </p>
          )}
        </div>
        {onRetry && (
          <Button onClick={handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        )}
        {fallbackContent && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-2">
              Dados em cache:
            </p>
            {fallbackContent}
          </div>
        )}
      </div>
    );
  }

  // Se deu timeout no loading, mostrar interface de timeout
  if (timedOut) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 space-y-4 ${className}`}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Carregamento demorado</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            O carregamento está demorando mais que o esperado. Verifique sua
            conexão.
          </p>
        </div>
        {onRetry && (
          <Button onClick={handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        )}
        {fallbackContent && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-2">
              Dados em cache:
            </p>
            {fallbackContent}
          </div>
        )}
      </div>
    );
  }

  // Loading normal - mostrar skeleton
  return (
    <div className={`space-y-4 ${className}`}>
      <Skeleton className="h-8 w-[250px]" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

// Componente específico para avatar
export function StableAvatarLoader({
  loading,
  error,
  onRetry,
  src,
  alt,
  className = "h-8 w-8",
}: {
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  src?: string;
  alt?: string;
  className?: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setImageError(false);
    setTimedOut(false);

    if (loading) {
      const timer = setTimeout(() => setTimedOut(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [loading, src]);

  if (error || imageError || timedOut) {
    return (
      <div
        className={`${className} rounded-full bg-muted flex items-center justify-center`}
      >
        <span className="text-xs font-medium">
          {alt?.charAt(0)?.toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  if (loading || !src) {
    return <Skeleton className={`${className} rounded-full`} />;
  }

  return (
    <Image
      src={src}
      alt={alt || "Avatar"}
      width={32}
      height={32}
      className={`${className} rounded-full object-cover`}
      onError={() => setImageError(true)}
      unoptimized
    />
  );
}
