import React, { useState, useRef, useEffect } from 'react';
import { X, Bot, Send, ArrowRight, BrainCircuit, Terminal, Database, Code, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './CopilotDrawer.css';

const CodeBlock = ({ inline, className, children, theme, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const content = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    const isLight = theme === 'light';
    return (
      <div className="copilot-code-block">
        <div className="code-header">
          <span className="code-lang">{match[1]}</span>
          <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          style={isLight ? vs : vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{ 
            margin: 0, 
            padding: '20px',
            borderTopLeftRadius: 0, 
            borderTopRightRadius: 0, 
            fontSize: '13px',
            lineHeight: '1.6',
            background: isLight ? '#fdfdfd' : '#0d1117',
            fontFamily: "'JetBrains Mono', monospace"
          }}
          {...props}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    );
  }
  return <code className={`inline-code ${className || ''}`} {...props}>{children}</code>;
};

export function CopilotDrawer({ isOpen, onClose, theme }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endOfMessagesRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Handle outside click to close
  const handleOverlayClick = (e) => {
    if (e.target.className.includes('copilot-overlay') && !e.target.className.includes('copilot-drawer')) {
      onClose();
    }
  };

  const PRESET_SUGGESTIONS = [
    { text: "Help me write a Postgres to S3 pipeline", icon: Database },
    { text: "Explain how Vault encryption works", icon: BrainCircuit },
    { text: "Clear system cache and restart workers", icon: Terminal },
    { text: "Write a semantic transform script", icon: Code }
  ];

  // Auto-resize textarea
  const handleInput = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = async (text) => {
    const messagePart = text || inputValue.trim();
    if (!messagePart) return;

    // Build exactly what will go to the server
    const currentMessages = [...messages, { role: 'user', content: messagePart }];
    setMessages(currentMessages);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsTyping(true);

    // Read BYOK configuration from user's secure local storage
    const provider = localStorage.getItem('arithflow_copilot_provider') || 'groq';
    const apiKey = localStorage.getItem('arithflow_copilot_key') || '';

    try {
      const res = await fetch('/etl/api/v1/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: currentMessages,
          provider: provider,
          api_key: apiKey
        })
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.statusText}`);
      }

      const data = await res.json();
      
      setMessages([
        ...currentMessages, 
        { role: 'ai', content: data.reply }
      ]);
    } catch (err) {
      setMessages([
        ...currentMessages, 
        { role: 'ai', content: "⚠️ Could not connect to the ArithFlow LLM backend. Please ensure GROQ_API_KEY is properly set in the `.env` file." }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`copilot-overlay ${isOpen ? 'open' : ''}`} onMouseDown={handleOverlayClick}>
      <div className={`copilot-drawer ${isOpen ? 'open' : ''}`} onMouseDown={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="copilot-header">
          <div className="copilot-title-wrapper">
            <div className="copilot-sparkle">
              <Bot size={18} />
            </div>
            <div>
              <h3>ArithFlow Copilot</h3>
              <span className="copilot-status">Online and ready</span>
            </div>
          </div>
          <button className="copilot-close" onClick={onClose} aria-label="Close Assistant">
            <X size={20} />
          </button>
        </div>

        {/* Chat Canvas */}
        <div className="copilot-chat-canvas">
          {messages.length === 0 ? (
            <div className="copilot-empty-state">
              <div className="copilot-branding-icon">
                <BrainCircuit size={28} />
              </div>
              <h4>How can I help you today?</h4>
              <p>I can help you construct ETL pipelines, manage infrastructure, or debug connector issues.</p>
              
              <div className="copilot-suggestions">
                {PRESET_SUGGESTIONS.map((sug, idx) => {
                  const Icon = sug.icon;
                  return (
                    <button 
                      key={idx} 
                      className="suggestion-pill"
                      onClick={() => handleSend(sug.text)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={16} className="suggestion-icon" />
                        {sug.text}
                      </span>
                      <ArrowRight size={14} className="suggestion-icon" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <React.Fragment>
              {messages.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.role}`}>
                  <div className="bubble markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: (props) => <CodeBlock theme={theme} {...props} />,
                        a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="chat-message ai">
                  <div className="bubble" style={{ color: "var(--text-muted)", fontStyle: 'italic', padding: "10px 18px" }}>
                    Analyzing workspace...
                  </div>
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </React.Fragment>
          )}
        </div>

        {/* Input Area */}
        <div className="copilot-input-area">
          <div className="copilot-input-wrapper">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask anything about your data engines..."
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
            />
            <button 
              className="copilot-send-btn" 
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isTyping}
            >
              <Send size={16} style={{ marginLeft: "2px" }} />
            </button>
          </div>
          <div className="legal-footer">
            Copilot can make mistakes. Verify pipeline configs before deploying.
          </div>
        </div>

      </div>
    </div>
  );
}
