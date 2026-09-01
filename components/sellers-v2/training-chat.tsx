"use client";

import { memo, type FormEvent } from "react";
import { ArrowUp, Bot, History, Loader2, X } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";

export interface TrainingChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface TrainingChatProps {
  messages: TrainingChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  isActive: boolean;
  error: string | null;
  onDismissError: () => void;
  onStart: () => void;
  onViewFeedbackHistory: () => void;
  isLoadingFeedbackHistory: boolean;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline underline-offset-4"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code>
  ),
};

const TrainingMessageList = memo(function TrainingMessageList({
  messages,
  isLoading,
}: {
  messages: TrainingChatMessage[];
  isLoading: boolean;
}) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport aria-label="Conversa de treinamento">
          <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-1 py-6 sm:px-6">
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id ?? `${message.timestamp}-${index}`}
                messageId={message.id ?? `${message.timestamp}-${index}`}
              >
                <Message align={message.role === "user" ? "end" : "start"}>
                  <MessageContent>
                    <Bubble
                      align={message.role === "user" ? "end" : "start"}
                      variant={message.role === "user" ? "muted" : "ghost"}
                      className={
                        message.role === "user"
                          ? "max-w-[85%] sm:max-w-[80%]"
                          : undefined
                      }
                    >
                      <BubbleContent
                        className={
                          message.role === "user"
                            ? "whitespace-pre-wrap px-4"
                            : undefined
                        }
                      >
                        {message.role === "user" ? (
                          message.content
                        ) : (
                          <ReactMarkdown components={markdownComponents}>
                            {message.content}
                          </ReactMarkdown>
                        )}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}

            {isLoading && (
              <MessageScrollerItem messageId="thinking">
                <div className="shimmer px-3 text-sm text-muted-foreground">
                  Pensando…
                </div>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
});

export function TrainingChat({
  messages,
  input,
  onInputChange,
  onSend,
  isLoading,
  isActive,
  error,
  onDismissError,
  onStart,
  onViewFeedbackHistory,
  isLoadingFeedbackHistory,
}: TrainingChatProps) {
  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!input.trim() || isLoading || !isActive) return;
    onSend();
  };

  if (!isActive && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Bot className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold">Treinamento com IA</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Simule uma conversa com um cliente difícil. Você terá 15 minutos
              para convencê-lo. Ao final, receberá uma nota de 0 a 100.
            </p>
          </div>
          <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={onStart}>Iniciar treinamento</Button>
            <Button
              type="button"
              variant="outline"
              onClick={onViewFeedbackHistory}
              disabled={isLoadingFeedbackHistory}
              className="gap-2"
            >
              {isLoadingFeedbackHistory ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <History className="size-4" />
              )}
              Ver últimos feedbacks
            </Button>
          </div>
          {error && (
            <div className="mt-1 flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-left">
              <p className="flex-1 text-xs font-medium leading-5 text-destructive">
                {error}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDismissError}
                className="size-6 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Fechar aviso"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="mx-auto mb-3 flex w-full max-w-2xl items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p className="flex-1 text-sm font-medium text-destructive">{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismissError}
            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Fechar aviso"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <TrainingMessageList messages={messages} isLoading={isLoading} />

      <div className="mx-auto w-full max-w-2xl shrink-0 px-1 pb-6 pt-2 sm:px-6">
        <form onSubmit={handleSubmit}>
          <div className="flex min-h-24 flex-col rounded-2xl border border-border/60 bg-background shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/30 dark:border-white/10">
            <Textarea
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Digite sua resposta…"
              disabled={!isActive || isLoading}
              className="max-h-32 min-h-14 flex-1 resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0"
              aria-label="Mensagem para o cliente"
            />
            <div className="flex min-h-10 items-center justify-end px-2 pb-2">
              <Button
                type="submit"
                size="icon"
                disabled={!isActive || isLoading || !input.trim()}
                className="size-8 rounded-full"
                aria-label="Enviar mensagem"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
