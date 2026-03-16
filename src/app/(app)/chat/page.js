'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import Header from '@/components/layout/Header';
import styles from './chat.module.css';

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hello! I am your LeadSchool Finance Assistant. I can help you analyze projects, budgets, and operational costs. How can I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const suggestions = [
    "What is the total budget for all projects?",
    "Show me the creator budget for KTLO project",
    "Which tasks are costliest in project X?",
    "How many budgets are approved?"
  ];

  async function handleSend(text = input) {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'ai', content: data.content }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  // Simple Markdown-to-HTML helper for basic formatting (Tables, Bold, Bullets)
  function formatContent(dataString) {
    if (!dataString) return '';
    
    let data;
    try {
      // The AI returns a JSON string, try to parse it
      data = JSON.parse(dataString);
    } catch (e) {
      // Fallback for simple strings
      return <p className="mb-2">{dataString}</p>;
    }

    return (
      <div className="space-y-4">
        {/* Summary Paragraph */}
        {data.summary && (
          <p className="text-lg leading-relaxed text-gray-200">{data.summary}</p>
        )}

        {/* Key Metrics Grid - Stacked with spacing */}
        {data.keyMetrics && data.keyMetrics.length > 0 && (
          <div className="flex flex-col gap-4 my-6">
            {data.keyMetrics.map((m, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-full px-5 py-2 flex items-center gap-2 w-fit">
                <span className="text-xs text-secondary uppercase tracking-wider">{m.label} = </span>
                <span className="text-sm font-bold text-accent">{m.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Data Table */}
        {data.table && data.table.headers && (
          <div className="overflow-x-auto my-4 rounded-lg border border-white/10">
            <table className={styles.chatTable}>
              <thead>
                <tr>{data.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.table.rows && data.table.rows.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Insights Bullets */}
        {data.insights && data.insights.length > 0 && (
          <div className="bg-accent/5 border-l-4 border-accent p-4 rounded-r-lg">
            <div className="text-sm font-bold text-accent mb-2">Insights</div>
            <ul className="space-y-2 list-none">
              {data.insights.map((insight, i) => (
                <li key={i} className="text-sm text-gray-300">
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <Header
        title="LEAD PM AI Assistant"
        subtitle="Conversational financial analysis powered by AI."
        actions={<Sparkles className="text-accent" />}
      />

      <div className={styles.chatContainer}>
        <div className={styles.messagesList}>
          {messages.map((m, i) => (
            <div key={i} className={`${styles.messageWrapper} ${m.role === 'user' ? styles.userMessage : styles.aiMessage}`}>
              <div className={styles.senderName}>
                {m.role === 'user' ? 'You' : 'LeadSchool AI'}
              </div>
              <div className={`${styles.bubble} ${m.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
                {m.role === 'ai' ? (
                  <div className="animate-fade-in">{formatContent(m.content)}</div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className={styles.aiMessage}>
              <div className={styles.senderName}>LeadSchool AI</div>
              <div className={styles.thinking}>
                <div className={styles.pulse} />
                Analysing financial data...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!loading && messages.length < 3 && (
          <div className={styles.suggestions}>
            {suggestions.map((s, i) => (
              <button key={i} className={styles.suggestionPill} onClick={() => handleSend(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className={styles.inputArea}
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <input
            className="form-input"
            placeholder="Type your question about projects or budgets..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !input.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
