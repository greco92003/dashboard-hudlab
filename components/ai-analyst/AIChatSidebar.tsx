"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIChatSidebar({ isOpen, onClose }: AIChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar contexto inicial
  useEffect(() => {
    if (isOpen && !context) {
      loadContext();
    }
  }, [isOpen]);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadContext = async () => {
    try {
      const response = await fetch("/api/ai-analyst/chat");
      const data = await response.json();
      if (data.success) {
        setContext(data.context);

        // Adicionar mensagem de boas-vindas
        setMessages([
          {
            role: "assistant",
            content: `Olá! 👋 Sou seu **Analista IA** da HUDLAB.\n\nEstou aqui para ajudar você a entender melhor seus dados de negócios, vendas e performance.\n\n**O que posso fazer por você:**\n- 📊 Analisar métricas de vendas\n- 🎯 Avaliar performance de vendedores e designers\n- 💰 Calcular indicadores financeiros\n- 📈 Identificar tendências e oportunidades\n- 🏆 Comparar resultados com metas\n\n**Pergunte-me algo!** Por exemplo:\n- "Como está a performance de vendas este mês?"\n- "Qual vendedor teve melhor desempenho?"\n- "Qual é o ticket médio dos negócios?"`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Erro ao carregar contexto:", error);
    }
  };

  const sendMessage = async (questionText: string, periodDays: number = 30) => {
    if (!questionText || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: questionText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-analyst/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: questionText,
          periodDays: periodDays,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Erro ao enviar mensagem");
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `❌ **Erro:** ${
          error.message ||
          "Não foi possível processar sua mensagem. Tente novamente."
        }`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const predefinedQuestions = [
    {
      id: "ticket-1-mes",
      label: "Ticket médio por par - Último mês",
      question: "Qual o ticket médio por par no último mês?",
      icon: "📊",
      periodDays: 30,
    },
    {
      id: "ticket-2-meses",
      label: "Ticket médio por par - 2 meses",
      question: "Qual o ticket médio por par nos últimos dois meses?",
      icon: "📈",
      periodDays: 60,
    },
    {
      id: "ticket-3-meses",
      label: "Ticket médio por par - 3 meses",
      question: "Qual o ticket médio por par nos últimos três meses?",
      icon: "💰",
      periodDays: 90,
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full md:w-[500px] bg-background border-l border-border z-50",
          "transform transition-transform duration-300 ease-in-out",
          "flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/10 to-gray-800/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-r from-primary to-gray-800">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Analista IA</h2>
              <p className="text-xs text-muted-foreground">
                Powered by ChatGPT
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg p-3",
                      message.role === "user"
                        ? "bg-primary text-gray-900"
                        : "bg-muted"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div className="ai-chat-message prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                    <p
                      className={cn(
                        "text-xs mt-1",
                        message.role === "user"
                          ? "text-gray-700"
                          : "text-muted-foreground"
                      )}
                    >
                      {message.timestamp.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                </div>
              )}
              {/* Elemento invisível para scroll automático */}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Perguntas Pré-definidas */}
        <div className="p-4 border-t border-border">
          <p className="text-sm font-medium mb-3">Selecione uma análise:</p>
          <div className="flex flex-col gap-2">
            {predefinedQuestions.map((item) => (
              <Button
                key={item.id}
                variant="outline"
                className="justify-start text-left h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary"
                onClick={() => sendMessage(item.question, item.periodDays)}
                disabled={isLoading}
              >
                <span className="mr-2 text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
