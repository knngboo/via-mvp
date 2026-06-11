import { useState, useRef, useEffect } from 'react';
import '../styles/FeedbackBubble.css';
import arrowUpIcon from '../assets/images/Icons_Arrow_up.svg';
import attachIcon from '../assets/images/Icons_Attach.svg';
import copyIcon from '../assets/images/Icons=Copy.svg';
import thumbsUpIcon from '../assets/images/Icons=Thumbs_up.svg';
import thumbsDownIcon from '../assets/images/Icons=Thumbs_down.svg';
import moreHorizIcon from '../assets/images/Icons=More_Horizontal.svg';
import loadIcon from '../assets/images/Icons=Load.svg';
import Markdown from 'markdown-to-jsx';
import { chatWithOpenAI } from '../services/openai';
import { chatWithAgent } from '../services/agent';
import { getAllUploadedFiles } from '../context/CsvContext';

const SUGGESTED_QUESTIONS = [];

export default function FeedbackBubble({
  setLastQuery,
  setLastBotResponse,
  initialQuery,
  chatHistory,
  setChatHistory,
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(1);
  const [openMoreIdx, setOpenMoreIdx] = useState(null);
  const moreDropdownRef = useRef(null);
  const [reactions, setReactions] = useState({});
  const [copiedIdx, setCopiedIdx] = useState(null);
  const historyRef = useRef(null);
  const textareaRef = useRef(null);
  const initialQuerySent = useRef(false);

  useEffect(() => {
    if (openMoreIdx === null) return;
    const handler = (e) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target)) {
        setOpenMoreIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMoreIdx]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  useEffect(() => {
    if (!loading) { setLoadingPhase(1); return; }
    const timer = setTimeout(() => setLoadingPhase(2), 2500);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (initialQuery && !initialQuerySent.current) {
      initialQuerySent.current = true;
      sendMessage(initialQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = { from: 'user', text: trimmed };
    const nextHistory = [...chatHistory, userMsg];
    setChatHistory(nextHistory);
    if (setLastQuery) setLastQuery(trimmed);
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    try {
      let answerText;
      try {
        // Preferred path: backend agent with tool access to MongoDB sources
        // and VIA GTFS data.
        answerText = await chatWithAgent({
          userMessage: trimmed,
          history: chatHistory,
        });
      } catch (agentErr) {
        // Backend unreachable (network error) — fall back to calling OpenAI
        // directly with the locally stored CSVs as inline context.
        if (!(agentErr instanceof TypeError)) throw agentErr;
        const files = getAllUploadedFiles();
        answerText = await chatWithOpenAI({
          userMessage: trimmed,
          files,
          history: chatHistory,
        });
      }
      setChatHistory(prev => [...prev, { from: 'bot', text: answerText }]);
      if (setLastBotResponse) setLastBotResponse(answerText);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [
        ...prev,
        { from: 'bot', text: `Error: ${err.message || 'Could not reach OpenAI'}` },
      ]);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(message);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleRegenerate = (idx) => {
    const userMsg = chatHistory.slice(0, idx).reverse().find(m => m.from === 'user');
    if (userMsg) sendMessage(userMsg.text);
    setOpenMoreIdx(null);
  };

  const handleCopyPlain = (text) => {
    const plain = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/`(.+?)`/g, '$1');
    navigator.clipboard.writeText(plain).catch(() => {});
    setOpenMoreIdx(null);
  };

  const handleReport = (idx) => {
    try {
      const reports = JSON.parse(localStorage.getItem('buffi_reports') || '[]');
      reports.push({ idx, text: chatHistory[idx]?.text, timestamp: Date.now() });
      localStorage.setItem('buffi_reports', JSON.stringify(reports));
    } catch {}
    setOpenMoreIdx(null);
  };

  const handleReaction = (idx, type) => {
    setReactions(prev => {
      const current = prev[idx];
      return { ...prev, [idx]: current === type ? null : type };
    });
  };

  // ── Landing State ──
  if (chatHistory.length === 0 && !loading) {
    return (
      <div className="chat-wrapper">
        <div className="landing-body">
          <div className="landing-greeting">Hi Buffi,</div>
          <div className="landing-heading">What should we dive into?</div>
          {SUGGESTED_QUESTIONS.length > 0 && (
            <div className="landing-questions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="landing-question-btn"
                  onClick={() => {
                    setMessage(q.text);
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
                    }
                  }}
                >
                  <span className="landing-question-icon">
                    <img src={q.icon} alt="" className="landing-q-icon" />
                  </span>
                  {q.text}
                </button>
              ))}
            </div>
          )}
        </div>
        <ChatInput
          message={message}
          setMessage={setMessage}
          onSubmit={handleSubmit}
          loading={loading}
          textareaRef={textareaRef}
        />
      </div>
    );
  }

  return (
    <div className="chat-wrapper">
      <div className="chat-history" ref={historyRef}>
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`msg-row ${msg.from}`}>
            {msg.from === 'user' ? (
              <div className="user-pill">{msg.text}</div>
            ) : (
              <div className="bot-block">
                <div className="bot-text">
                  <Markdown options={{ forceBlock: true }}>
                    {String(msg.text).replace(/\n/g, '  \n')}
                  </Markdown>
                </div>
                <div className="reaction-bar">
                  <div className="reaction-copy-wrapper">
                    <button
                      className="reaction-btn"
                      title="Copy response"
                      onClick={() => handleCopy(msg.text, idx)}
                    >
                      <img src={copyIcon} alt="Copy" className="reaction-icon" />
                    </button>
                    {copiedIdx === idx && (
                      <span className="reaction-copied-toast">Copied!</span>
                    )}
                  </div>
                  <button
                    className={`reaction-btn${reactions[idx] === 'up' ? ' reaction-btn--active' : ''}`}
                    title="Helpful"
                    onClick={() => handleReaction(idx, 'up')}
                  >
                    <img src={thumbsUpIcon} alt="Helpful" className="reaction-icon" />
                  </button>
                  <button
                    className={`reaction-btn${reactions[idx] === 'down' ? ' reaction-btn--active' : ''}`}
                    title="Not helpful"
                    onClick={() => handleReaction(idx, 'down')}
                  >
                    <img src={thumbsDownIcon} alt="Not helpful" className="reaction-icon" />
                  </button>
                  <div
                    className="reaction-more-wrapper"
                    ref={openMoreIdx === idx ? moreDropdownRef : null}
                  >
                    <button
                      className={`reaction-btn${openMoreIdx === idx ? ' reaction-btn--active' : ''}`}
                      title="More options"
                      onClick={() => setOpenMoreIdx(openMoreIdx === idx ? null : idx)}
                    >
                      <img src={moreHorizIcon} alt="More" className="reaction-icon" />
                    </button>
                    {openMoreIdx === idx && (
                      <div className="reaction-more-dropdown">
                        <button className="reaction-more-item" onClick={() => handleRegenerate(idx)}>
                          Regenerate
                        </button>
                        <button className="reaction-more-item" onClick={() => handleCopyPlain(msg.text)}>
                          Copy as plain text
                        </button>
                        <button className="reaction-more-item reaction-more-item--danger" onClick={() => handleReport(idx)}>
                          Report
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="msg-row bot">
            <div className="bot-block">
              <div className={`loading-state loading-state--${loadingPhase}`}>
                <div className="loading-state-line1">
                  <img src={loadIcon} alt="" className="loading-state-icon" />
                  <span>Working</span>
                </div>
                <div className="loading-state-line2">Asking OpenAI</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput
        message={message}
        setMessage={setMessage}
        onSubmit={handleSubmit}
        loading={loading}
        textareaRef={textareaRef}
      />
    </div>
  );
}

function ChatInput({ message, setMessage, onSubmit, loading, textareaRef }) {
  const fileRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) setAttachedFile(file);
    e.target.value = '';
  };

  const handleRemoveFile = () => setAttachedFile(null);

  return (
    <div className="chat-input-area">
      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
      />
      <div className="chat-input-box">
        {attachedFile && (
          <div className="attached-file-chip">
            <span className="attached-file-name" title={attachedFile.name}>{attachedFile.name}</span>
            <button className="attached-file-remove" onClick={handleRemoveFile} title="Remove">✕</button>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Write message here..."
            value={message}
            rows={1}
            disabled={loading}
            onChange={(e) => {
              setMessage(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && message.trim()) onSubmit(e);
              }
            }}
          />
        </div>
        <div className="chat-input-actions">
          <button type="button" className="at-btn" tabIndex={-1} onClick={() => fileRef.current?.click()} title="Attach file">
            <img src={attachIcon} alt="Attach" className="send-icon" />
          </button>
          <button
            type="button"
            className="send-btn"
            disabled={loading || !message.trim()}
            onClick={onSubmit}
          >
            <img src={arrowUpIcon} alt="Send" className="send-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}
