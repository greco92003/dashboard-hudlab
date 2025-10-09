"use client";

import { useState } from "react";
import { AIFloatingButton } from "./AIFloatingButton";
import { AIChatSidebar } from "./AIChatSidebar";

/**
 * Wrapper component que gerencia o estado do Analista IA
 * Inclui o botão flutuante e a sidebar de chat
 *
 * ⚠️ DISPONÍVEL APENAS EM DESENVOLVIMENTO
 * O Analista IA está desabilitado em produção até testes completos
 */
export function AIAnalystWrapper() {
  const [isOpen, setIsOpen] = useState(false);

  // Verificar se está em ambiente de desenvolvimento
  const isDevelopment = process.env.NODE_ENV === "development";

  // Não renderizar em produção
  if (!isDevelopment) {
    return null;
  }

  return (
    <>
      <AIFloatingButton onClick={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      <AIChatSidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
