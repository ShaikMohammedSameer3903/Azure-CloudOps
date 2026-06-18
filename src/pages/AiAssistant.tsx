// ============================================================
// CloudOps AI Copilot Chat Component
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { Brain, Send, User, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

export default function AiAssistant() {
  const {
    aiMessages, addAiMessage,
    aiLoading, setAiLoading,
    clearAiMessages
  } = useAppStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'How can I optimize costs in my environment?',
    "Show me today's critical security incidents (SOC)",
    'Explain Security Hub findings',
    'What is the status of my Virtual Machines?'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages, aiLoading]);

  // Set default welcome message if chat history is empty
  useEffect(() => {
    const currentMessages = useAppStore.getState().aiMessages;
    if (currentMessages.length === 0 || !currentMessages.some(m => m.id === 'welcome-msg')) {
      addAiMessage({
        id: 'welcome-msg',
        role: 'assistant',
        content: `Hello! I am your CloudOps Enterprise AI Copilot. 

I can analyze your connected subscriptions, resources, cost reports, and active incidents in real time to suggest optimizations.

How can I help you today? Select a quick prompt below or type your question.`,
        timestamp: new Date().toISOString()
      });
    }
  }, [aiMessages.length, addAiMessage]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || aiLoading) return;
    setInput('');

    // 1. Add user message
    const userMsgId = `user-${Math.random().toString(36).substring(2, 11)}`;
    addAiMessage({
      id: userMsgId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    });

    setAiLoading(true);

    try {
      // 2. Call backend
      const result = await api.post<any>('/api/ai/chat', {
        message: textToSend
      });

      // 3. Add assistant reply
      const assistantMsgId = `assistant-${Math.random().toString(36).substring(2, 11)}`;
      addAiMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      addAiMessage({
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `I apologize, but I encountered an error communicating with the AI backend service: ${err.message || 'Unknown error'}. Please verify that the local backend server is running.`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 48px)' }}>
      <header className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">CloudOps AI Copilot</h1>
          <p className="page-subtitle">
            Context-aware AI assistant helping you manage costs, policies, and operational issues.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearAiMessages}>
          Reset Conversation
        </button>
      </header>

      {/* Main chat card taking all remaining height */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Messages feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {aiMessages.map((msg) => {
            const isAi = msg.role === 'assistant';
            
            return (
              <div 
                key={msg.id} 
                style={{ 
                  display: 'flex', 
                  gap: 12, 
                  alignItems: 'flex-start',
                  maxWidth: '85%',
                  alignSelf: isAi ? 'flex-start' : 'flex-end',
                  flexDirection: isAi ? 'row' : 'row-reverse'
                }}
              >
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: isAi ? 'linear-gradient(135deg, var(--azure-600), var(--teal-500))' : 'var(--bg-surface-tertiary)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: isAi ? 'white' : 'var(--text-secondary)',
                  flexShrink: 0
                }}>
                  {isAi ? <Brain size={16} /> : <User size={16} />}
                </div>

                <div>
                  <div style={{ 
                    padding: '12px 16px', 
                    borderRadius: 'var(--radius-lg)', 
                    background: isAi ? 'var(--bg-surface-secondary)' : 'var(--azure-600)', 
                    color: isAi ? 'var(--text-primary)' : 'white',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    boxShadow: 'var(--shadow-xs)',
                  }}>
                    {/* Render basic formatting */}
                    {msg.content.split('\n').map((line, idx) => {
                      if (line.trim() === '') return <div key={idx} style={{ height: 8 }} />;
                      if (line.startsWith('### ')) {
                        return <h3 key={idx} style={{ fontSize: 14.5, fontWeight: 700, margin: '8px 0 4px', color: isAi ? 'var(--text-primary)' : 'white' }}>{line.replace('### ', '')}</h3>;
                      }
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return <p key={idx} style={{ margin: 0 }}><strong>{line.replace(/\*\*/g, '')}</strong></p>;
                      }
                      if (line.startsWith('* ') || line.startsWith('- ')) {
                        return <li key={idx} style={{ marginLeft: 16, listStyleType: 'disc' }}>{line.substring(2)}</li>;
                      }
                      if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ')) {
                        return <li key={idx} style={{ marginLeft: 16, listStyleType: 'decimal' }}>{line.substring(3)}</li>;
                      }
                      return <p key={idx} style={{ margin: 0 }}>{line}</p>;
                    })}
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4, display: 'block', textAlign: isAi ? 'left' : 'right' }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {aiLoading && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start' }}>
              <div style={{ 
                width: 32, height: 32, borderRadius: '50%', 
                background: 'linear-gradient(135deg, var(--azure-600), var(--teal-500))', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                flexShrink: 0
              }}>
                <Brain size={16} />
              </div>
              <div style={{ 
                padding: '12px 16px', 
                borderRadius: 'var(--radius-lg)', 
                background: 'var(--bg-surface-secondary)', 
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)', animationDelay: '200ms' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-secondary)', animationDelay: '400ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom panel including suggestions and input */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 16, background: 'var(--bg-surface-raised)' }}>
          {/* Quick Prompts */}
          {aiMessages.length === 1 && !aiLoading && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                <Sparkles size={12} color="var(--warning-500)" />
                <span>Suggested Prompts:</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {quickPrompts.map((p, i) => (
                  <button 
                    key={i}
                    className="btn btn-secondary btn-sm" 
                    onClick={() => handleSendMessage(p)}
                    style={{ borderRadius: 'var(--radius-full)', fontSize: 12 }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="Ask AI Copilot for suggestions (e.g., how to reduce costs)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
              disabled={aiLoading}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: 13.5
              }}
            />
            <button 
              className="btn btn-primary"
              onClick={() => handleSendMessage(input)}
              disabled={!input.trim() || aiLoading}
              style={{ padding: '0 20px' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
