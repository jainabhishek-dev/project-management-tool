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
  function formatContent(content) {
    if (!content) return '';
    
    // Safety check: strip any literal HTML tags the AI might hallucinate
    let sanitized = content.replace(/<\/?[^>]+(>|$)/g, "");
    
    // Convert bold
    let text = sanitized.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    const lines = text.split('\n');
    const elements = [];
    let inTable = false;
    let tableRows = [];

    const renderTable = (rows, key) => {
      if (rows.length < 2) return null;
      return (
        <div className="overflow-x-auto my-4" key={key}>
          <table className={styles.chatTable}>
            <thead>
              <tr>{rows[0].map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(2).filter(r => r.length === rows[0].length).map((row, i) => (
                <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Table detection
      if (line.startsWith('|') && line.endsWith('|')) {
        inTable = true;
        const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        tableRows.push(cells);
        continue;
      } 
      
      // If we were in a table but this line isn't part of it
      if (inTable && tableRows.length > 0) {
        elements.push(renderTable(tableRows, `table-${i}`));
        tableRows = [];
        inTable = false;
      }

      // Skip table separators (---|---|---)
      if (line.includes('---') && line.includes('|')) continue;

      // Bullets (support -, *, and •)
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        elements.push(<li key={i} className="ml-6 mb-1 list-disc">{line.substring(2)}</li>);
        continue;
      }

      // Numbered Lists
      if (/^\d+\.\s/.test(line)) {
        elements.push(<li key={i} className="ml-6 mb-1 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>);
        continue;
      }

      // Regular paragraphs
      if (line === '') {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(<p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: line }} />);
      }
    }

    // FINAL CHECK: If the AI ended with a table, render it now
    if (inTable && tableRows.length > 0) {
      elements.push(renderTable(tableRows, 'table-final'));
    }

    return elements;
  }

  return (
    <div>
      <Header 
        title="AI Assistant" 
        subtitle="Conversational financial analysis powered by Gemini 3.1 Pro."
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
