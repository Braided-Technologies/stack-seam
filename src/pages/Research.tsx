import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useUserApplications } from '@/hooks/useStackData';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTED_PROMPTS = [
  "Compare top RMM tools for a 20-person MSP",
  "What backup solutions integrate well with my stack?",
  "Best practices for MSP cybersecurity stack",
  "Recommend a PSA tool that works with our current setup",
];

export default function Research() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: userApps } = useUserApplications();
  const { toast } = useToast();

  const stackContext = userApps?.map(ua => ua.applications?.name).filter(Boolean).join(', ') || '';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';
    const allMessages = [...messages, userMsg];

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-research`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, stackContext }),
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">AI Research Assistant</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions about IT tools, compare vendors, and get stack recommendations
        </p>
      </div>

      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
            <Bot className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center max-w-md">
              I can help you research IT tools, compare vendors, and optimize your MSP stack. Try one of the suggestions below or ask your own question.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
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
                <div className={`rounded-lg px-4 py-3 max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
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

      <div className="border-t px-6 py-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
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
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
