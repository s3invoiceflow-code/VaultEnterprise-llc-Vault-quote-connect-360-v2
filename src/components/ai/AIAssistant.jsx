import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, X, Send, Minimize2, Maximize2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const SUGGESTED_PROMPTS = [
  "Summarize the current case pipeline and flag any risks",
  "Which cases are overdue or stalled?",
  "Draft a renewal recommendation for a group with an 8% rate increase",
  "What census data fields are required for a medical quote?",
  "List best practices for improving enrollment participation rates",
  "Generate a checklist for onboarding a new employer group",
];

const SYSTEM_CONTEXT = `You are an expert small group benefits broker assistant integrated into Connect Quote 360, a case-centered benefits operating platform. 

You help brokers with:
- Analyzing benefit cases, census data, and quote scenarios
- Drafting proposals, renewal recommendations, and employer communications
- Identifying risks, compliance issues, and missed follow-ups
- Explaining plan types, contribution strategies, and enrollment processes
- Suggesting workflow improvements and best practices

Be concise, professional, and actionable. Use bullet points and structured responses where helpful. Always tailor advice to the small group benefits context (2-100 employees).`;

export default function AIAssistant({ caseContext }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm your GradientAI benefits assistant. I can help you analyze cases, draft proposals, review census data, and navigate the benefits lifecycle.\n\nWhat can I help you with today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && !minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimized]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const contextNote = caseContext
      ? `\n\n[Current case context: ${JSON.stringify(caseContext)}]`
      : "";

    const conversationPrompt = `${SYSTEM_CONTEXT}${contextNote}\n\nConversation:\n${newMessages.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}\n\nAssistant:`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: conversationPrompt,
      model: "claude_sonnet_4_6",
    });

    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setMessages([{
      role: "assistant",
      content: "Chat cleared. How can I help you?",
    }]);
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
        >
          <Sparkles className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-background flex items-center justify-center">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-300",
            minimized
              ? "bottom-6 right-4 sm:right-6 w-64 sm:w-72 h-14"
              : "bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] md:w-[420px] h-[520px] sm:h-[560px] md:h-[600px] max-h-[85vh]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0 rounded-t-2xl bg-gradient-to-r from-primary/5 to-accent/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">GradientAI</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Benefits Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={reset} title="Clear chat">
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setMinimized(!minimized)}>
                {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:leading-relaxed [&_ul]:my-1 [&_li]:my-0.5">
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mr-2 flex-shrink-0">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggested prompts — only show on first message */}
              {messages.length === 1 && (
                <div className="px-4 pb-2 flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Suggested</p>
                  <div className="grid grid-cols-1 gap-1">
                    {SUGGESTED_PROMPTS.slice(0, 3).map((p, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(p)}
                        className="text-left text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-lg px-3 py-2 transition-colors truncate"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2 border-t border-border/50">
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about cases, quotes, enrollment..."
                    className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
                    rows={1}
                    disabled={loading}
                  />
                  <Button
                    size="icon"
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent hover:opacity-90 flex-shrink-0"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Powered by GradientAI • Uses integration credits</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}