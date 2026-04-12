import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserApplications } from '@/hooks/useStackData';
import { Send, Bot, User, Sparkles, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';

type Msg = { role: 'user' | 'assistant'; content: string };

const SESSION_KEY = 'research-chat-messages';
const SESSION_MODEL_KEY = 'research-chat-model';

const SUGGESTED_PROMPTS = [
  "Compare top RMM tools for a 20-person MSP",
  "What backup solutions integrate well with my stack?",
  "Best practices for MSP cybersecurity stack",
  "Recommend a PSA tool that works with our current setup",
];

const AI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)', description: 'Fast, cost-effective for most tasks' },
  { value: 'gpt-4o', label: 'GPT-4o (Balanced)', description: 'Strong reasoning and accuracy' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: 'Latest mini model, great performance' },
  { value: 'gpt-4.1', label: 'GPT-4.1 (Powerful)', description: 'Most capable, best for complex tasks' },
];

function loadSessionMessages(): Msg[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveSessionMessages(msgs: Msg[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs)); } catch {}
}

export default function Research() {
  const [messages, setMessages] = useState<Msg[]>(loadSessionMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => sessionStorage.getItem(SESSION_MODEL_KEY) || 'gpt-4o-mini');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: userApps } = useUserApplications();
  const { toast } = useToast();

  const stackContext = userApps?.map(ua => ua.applications?.name).filter(Boolean).join(', ') || '';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Persist messages to sessionStorage
  useEffect(() => {
    saveSessionMessages(messages);
  }, [messages]);

  // Persist model selection
  useEffect(() => {
    sessionStorage.setItem(SESSION_MODEL_KEY, selectedModel);
  }, [selectedModel]);

  const resetChat = () => {
    setMessages([]);
    setInput('');
    sessionStorage.removeItem(SESSION_KEY);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';
    const allMessages = [...messages, userMsg];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-research`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: allMessages, stackContext, model: selectedModel }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        if (resp.status === 429) toast({ title: 'Rate Limited', description: err.error, variant: 'destructive' });
        else if (resp.status === 402) toast({ title: 'Credits Exhausted', description: err.error, variant: 'destructive' });
        else toast({ title: 'Error', description: err.error || 'Something went wrong', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: 'assistant', content: assistantSoFar }];
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to connect to AI service', variant: 'destructive' });
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div data-tour="research-header">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">AI Research Assistant</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Ask questions about IT tools, compare vendors, and get stack recommendations
            </p>
          </div>
          <div data-tour="research-model" className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={resetChat} className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                New Chat
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Model:</span>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    <div>
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground ml-1">— {m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
            <Bot className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center max-w-md">
              I can help you research IT tools, compare vendors, and optimize your MSP stack. Try one of the suggestions below or ask your own question.
            </p>
            <div data-tour="research-prompts" className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map(prompt => (
                <Card
                  key={prompt}
                  className="p-3 cursor-pointer hover:bg-accent transition-colors text-sm"
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`rounded-lg px-4 py-3 overflow-x-auto ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground max-w-[80%]'
                    : 'bg-muted max-w-full'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-3 [&_table]:border-collapse [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_table]:block [&_table]:overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div data-tour="research-input" className="border-t px-6 py-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about IT tools, vendors, or best practices..."
            className="min-h-[44px] max-h-32 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
