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
    
    // Convert bold
    let html = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Split into paragraphs/lines
    const lines = html.split('\n');
    let inTable = false;
    let tableRows = [];

    const result = lines.map((line, idx) => {
      // Very specific check for markdown table rows
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true;
        const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
        tableRows.push(cells);
        return null;
      } else if (inTable) {
        // We were in a table, but now we're not. Render the collected rows.
        inTable = false;
        const rows = [...tableRows];
        tableRows = [];
        return (
          <table key={`table-${idx}`}>
            <thead>
              <tr>{rows[0].map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(2).map((row, i) => (
                <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        );
      }
      
      // Bullets
      if (line.trim().startsWith('- ')) {
        return <li key={idx} style={{ marginLeft: '20px' }}>{line.replace('- ', '')}</li>;
      }

      return line.trim() === '' ? <br key={idx} /> : <p key={idx} style={{ marginBottom: '8px' }}>{line}</p>;
    });

    return result;
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
