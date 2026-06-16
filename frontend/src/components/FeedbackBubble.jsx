import { useState, useRef, useEffect, useCallback } from 'react';
import { getStoredModel, getStoredApiKey } from './SettingsModal';
import '../styles/FeedbackBubble.css';
import arrowUpIcon from '../assets/images/Icons_Arrow_up.svg';
import copyIcon from '../assets/images/Icons=Copy.svg';
import thumbsUpIcon from '../assets/images/Icons=Thumbs_up.svg';
import thumbsDownIcon from '../assets/images/Icons=Thumbs_down.svg';
import moreHorizIcon from '../assets/images/Icons=More_Horizontal.svg';
import suiteChartsIcon from '../assets/images/SuiteIcons-Charts.svg';
import suiteDataIcon from '../assets/images/SuiteIcons-Data.svg';
import suiteMapsIcon from '../assets/images/SuiteIcons-Maps.svg';
import chevronDownIcon from '../assets/images/Icons=chevron_down.svg';
import loadIcon from '../assets/images/Icons=Load.svg';
import Markdown from 'markdown-to-jsx';
import FollowUpQuestions, { parseAskBlock } from './FollowUpQuestions';

const SUGGESTED_QUESTIONS = [
  { text: "Find nearby bus stops for 78205", icon: suiteMapsIcon },
  { text: "Show departures for Stop ID 88779", icon: suiteDataIcon },
  { text: "List all my uploaded data sources", icon: suiteChartsIcon },
  { text: "What columns are in my latest uploaded dataset?", icon: suiteDataIcon },
];


function deriveMaptitle(userText) {
  const t = userText.toLowerCase();
  const zipMatch = t.match(/\b(782\d{2})\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  const suffix = zip ? ` in ${zip}` : '';

  if (t.includes('route') || t.includes('bus') || t.includes('via')) return `Transit Routes${suffix}`;
  if (t.includes('delay') || t.includes('late')) return `Transit Delays${suffix}`;
  if (t.includes('stop') || t.includes('station')) return `Transit Stops${suffix}`;
  if (t.includes('ridership') || t.includes('apc')) return `Ridership Data${suffix}`;
  if (t.includes('trip') || t.includes('schedule')) return `Trip Schedules${suffix}`;

  return 'Transit Map';
}



export default function FeedbackBubble({ setHighlightData, setChartData, restoreChartData, setMapTitle, chartType, setChartType, openVisualizationPanel, setIsLoading, setLastQuery, setLastBotResponse, initialQuery, chatHistory, setChatHistory, setLiveBuses, setHeatStat }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(1);
  const [openCitations, setOpenCitations] = useState({});
  const [openMoreIdx, setOpenMoreIdx] = useState(null);
  const moreDropdownRef = useRef(null);
  const [reactions, setReactions] = useState({});
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [reportToast, setReportToast] = useState(null); // { idx, status: 'ok'|'err' }
  const historyRef = useRef(null);
  const textareaRef = useRef(null);
  const initialQuerySent = useRef(false);
  const abortRef = useRef(null);

  // Close "more" dropdown on outside click
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

  // Switch to phase 2 after 2.5s of loading
  useEffect(() => {
    if (!loading) { setLoadingPhase(1); return; }
    const timer = setTimeout(() => setLoadingPhase(2), 2500);
    return () => clearTimeout(timer);
  }, [loading]);

  // Auto-send query from URL ?q= param on first mount
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

    const title = deriveMaptitle(trimmed);
    const userMsg = { from: 'user', text: trimmed };
    setChatHistory(prev => [...prev, userMsg]);
    if (setLastQuery) setLastQuery(trimmed);
    
    // Automatically open the map panel ONLY if the user explicitly asks for a map
    if (setMapTitle) setMapTitle(title);
    if (openVisualizationPanel && trimmed.toLowerCase().includes('map')) {
      openVisualizationPanel('map');
    }

    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);
    if (setIsLoading) setIsLoading(true);
    if (setHighlightData) setHighlightData(null);
    if (setChartData) setChartData(null);

    const botIdx = chatHistory.length + 1; // since we just pushed userMsg to setChatHistory

    const controller = new AbortController();
    abortRef.current = controller;
    let placeholderAdded = false;
    let fullAnswer = '';
    let mapPayload = null;
    let chartPayload = null;

    try {
      const apiKey = getStoredApiKey();
      const res = await fetch(`/api/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-OpenAI-Key': apiKey } : {}),
        },
        body: JSON.stringify({ message: trimmed, history: chatHistory, model: getStoredModel() }),
        signal: controller.signal
      });
      
      if (!res.ok) {
        // Read the actual error from the server instead of swallowing it
        let errMsg = `Server error (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) errMsg = errBody.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          for (const line of event.split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);

              // Custom event from Buffi's map tools: render points on the map.
              if (json.buffi_map) {
                mapPayload = json.buffi_map;
                const pts = json.buffi_map.points || [];
                if (setHighlightData) setHighlightData(pts);
                if (json.buffi_map.title && setMapTitle) setMapTitle(json.buffi_map.title);
                // live=true keeps the map auto-refreshing the live bus feed.
                if (setLiveBuses) {
                  setLiveBuses(json.buffi_map.live ? { active: true, routeId: json.buffi_map.route_id || null } : null);
                }
                // heatmap selects a census ACS statistic to color ZIPs by.
                if (setHeatStat) setHeatStat(json.buffi_map.heatmap || '');
                if (openVisualizationPanel) openVisualizationPanel('map');
                continue;
              }

              // Custom event from Buffi's make_chart tool: render a chart.
              if (json.buffi_chart) {
                chartPayload = json.buffi_chart;
                if (setChartData) setChartData(json.buffi_chart.chartData);
                if (json.buffi_chart.chartType && setChartType) setChartType(json.buffi_chart.chartType);
                if (openVisualizationPanel) openVisualizationPanel();
                continue;
              }

              const delta = json?.choices?.[0]?.delta?.content;
              if (delta) {
                if (!placeholderAdded) {
                  placeholderAdded = true;
                  setLoading(false);
                }
                fullAnswer += delta;
                setChatHistory(prev => {
                  const next = [...prev];
                  next[botIdx] = { from: 'bot', text: fullAnswer };
                  return next;
                });
              }
            } catch (e) {}
          }
        }
      }

      // Attach any visualization Buffi produced to the bot message so it
      // persists and restores when the conversation is reopened.
      const hasMap = mapPayload && ((mapPayload.points && mapPayload.points.length) || mapPayload.heatmap);
      const hasChart = chartPayload && chartPayload.chartData;
      if (hasMap || hasChart) {
        setChatHistory(prev => {
          const next = [...prev];
          const existing = next[botIdx] || { from: 'bot', text: fullAnswer || 'Here is the visualization you asked for.' };
          const patch = { ...existing };
          if (hasMap) {
            patch.savedHighlightData = mapPayload.points && mapPayload.points.length ? mapPayload.points : (existing.savedHighlightData || null);
            patch.savedTitle = mapPayload.title || existing.savedTitle;
            patch.mapTag = true;
            if (mapPayload.live) patch.liveBuses = { active: true, routeId: mapPayload.route_id || null };
            if (mapPayload.heatmap) patch.savedHeatStat = mapPayload.heatmap;
          }
          if (hasChart) {
            patch.savedChartData = chartPayload.chartData;
            patch.savedChartType = chartPayload.chartType || 'bar';
            patch.chartTag = true;
          }
          next[botIdx] = patch;
          return next;
        });
      }

      if (setLastBotResponse) setLastBotResponse(fullAnswer);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Chat error:', err);
        setChatHistory(prev => [
          ...prev,
          { from: 'bot', text: `Error: ${err.message || 'Could not connect to chatbot'}` },
        ]);
      }
    }
    abortRef.current = null;
    setLoading(false);
    if (setIsLoading) setIsLoading(false);
  };

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(message);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).catch(() => { });
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
    navigator.clipboard.writeText(plain).catch(() => { });
    setOpenMoreIdx(null);
  };

  const handleReport = async (idx) => {
    setOpenMoreIdx(null);
    const messageText = chatHistory[idx]?.text || '';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: messageText }),
      });
      if (!res.ok) throw new Error('server error');
      setReportToast({ idx, status: 'ok' });
    } catch (_) {
      setReportToast({ idx, status: 'err' });
    }
    setTimeout(() => setReportToast(null), 2000);
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
          <div className="landing-questions">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                className="landing-question-btn"
                onClick={() => sendMessage(q.text)}
              >
                <span className="landing-question-icon">
                  <img src={q.icon} alt="" className="landing-q-icon" />
                </span>
                {q.text}
              </button>
            ))}
          </div>
        </div>
        <ChatInput
          message={message}
          setMessage={setMessage}
          onSubmit={handleSubmit}
          onStop={handleStop}
          loading={loading}
          textareaRef={textareaRef}
        />
      </div>
    );
  }

  // ── Chat State ──
  const lastMsg = chatHistory[chatHistory.length - 1];
  const activeAsk = !loading && lastMsg && lastMsg.from === 'bot' ? parseAskBlock(lastMsg.text) : null;

  const lastChartIdx = chatHistory.reduce((acc, msg, i) => msg.chartTag ? i : acc, -1);
  const lastVizIdx = chatHistory.reduce((acc, msg, i) => (msg.chartTag || msg.mapTag) ? i : acc, -1);

  // Build a set of dataset names already shown in earlier bot messages (for dedup)
  const seenDatasets = [];
  chatHistory.forEach((msg) => {
    seenDatasets.push(new Set(msg.from === 'bot' ? (msg.citations || []).map(c => c.dataset) : []));
  });

  const restoreViz = (msg, mode = 'chart') => {
    // Use restoreChartData (raw setter) so chart type is NOT reset to 'bar'
    const chartSetter = restoreChartData || setChartData;
    if (mode === 'map') {
      // Clear chart so the map panel is revealed
      if (chartSetter) chartSetter(null);
    } else {
      if (msg.savedChartData && chartSetter) chartSetter(msg.savedChartData);
      else if (chartSetter) chartSetter(null);
    }
    if (msg.savedHighlightData && setHighlightData) setHighlightData(msg.savedHighlightData);
    else if (setHighlightData) setHighlightData(null);
    if (msg.savedTitle && setMapTitle) setMapTitle(msg.savedTitle);
    // Re-enable the live bus feed if this message was a live-buses view.
    if (setLiveBuses) setLiveBuses(mode === 'map' && msg.liveBuses ? msg.liveBuses : null);
    // Restore the census heat map statistic if this was a heat-map view.
    if (setHeatStat) setHeatStat(mode === 'map' && msg.savedHeatStat ? msg.savedHeatStat : '');
    if (openVisualizationPanel) openVisualizationPanel();
  };

  return (
    <div className="chat-wrapper">
      <div className="chat-history" ref={historyRef}>
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`msg-row ${msg.from}`}>
            {msg.from === 'user' ? (
              <div className="user-pill">{msg.text}</div>
            ) : (
              <div className="bot-block">
                {msg.chartTag && (
                  <button className="map-tag chart-tag map-tag--clickable" onClick={() => restoreViz(msg, 'chart')} title="Click to show this chart">
                    <img src={suiteChartsIcon} alt="chart" className="suite-tag-icon" />
                    <span className="map-tag-label">{msg.chartTag}</span>
                  </button>
                )}
                {msg.mapTag && (
                  <button className="map-tag map-tag--clickable" onClick={() => restoreViz(msg, 'map')} title="Click to show this map">
                    <img src={suiteMapsIcon} alt="map" className="suite-tag-icon" />
                    <span className="map-tag-label">{msg.mapTag}</span>
                  </button>
                )}
                {!msg.chartTag && !msg.mapTag && (
                  <div className="map-tag data-tag">
                    <img src={suiteDataIcon} alt="data" className="suite-tag-icon" />
                    <span className="map-tag-label">Data Response</span>
                  </div>
                )}
                {msg.from === 'bot' && parseAskBlock(msg.text) ? null : (
                  <div className="bot-text">
                    {/* H-1: disableParsingRawHTML prevents markdown-to-jsx from rendering
                        raw HTML tags in AI responses, closing the XSS vector. */}
                    <Markdown options={{ forceBlock: true, disableParsingRawHTML: true }}>
                      {String(msg.text).replace(/\n/g, '  \n')}
                    </Markdown>
                  </div>
                )}
                {msg.structured?.reasoning_summary && (
                  <div className="structured-panel structured-reasoning">
                    <div className="structured-label">Reasoning</div>
                    <Markdown options={{ forceBlock: true }}>
                      {String(msg.structured.reasoning_summary).replace(/\n/g, '  \n')}
                    </Markdown>
                  </div>
                )}
                {msg.structured?.recommendations?.length > 0 && (
                  <div className="structured-panel structured-recs">
                    <div className="structured-label">Recommendations</div>
                    <ul>
                      {msg.structured.recommendations.map((line, ri) => (
                        <li key={ri}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {msg.structured?.limitations?.length > 0 && (
                  <div className="structured-panel structured-limits">
                    <div className="structured-label">Limitations</div>
                    <ul>
                      {msg.structured.limitations.map((line, ix) => (
                        <li key={ix}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(() => {
                  // Only show citations not already displayed in a prior message
                  const priorSeen = new Set(
                    seenDatasets.slice(0, idx).flatMap(s => [...s])
                  );
                  const newCitations = (msg.citations || []).filter(
                    c => !priorSeen.has(c.dataset)
                  );
                  if (newCitations.length === 0) return null;
                  return (
                    <div className="citations-panel">
                      <button
                        className="citations-toggle"
                        onClick={() => setOpenCitations(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      >
                        <span className="citations-toggle-label">Sources ({newCitations.length})</span>
                        <img
                          src={chevronDownIcon}
                          alt=""
                          className={`citations-toggle-arrow${openCitations[idx] ? ' citations-toggle-arrow--open' : ''}`}
                        />
                      </button>
                      {openCitations[idx] && (
                        <ol className="citations-list">
                          {newCitations.map((c, ci) => (
                            <li key={ci} className="citation-item">
                              <span className="citation-dataset">{c.dataset}</span>
                              {c.source && <span className="citation-source"> · {c.source}</span>}
                              <div className="citation-links">
                                {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="citation-link">Source ↗</a>}
                                {c.data_link && <a href={c.data_link} target="_blank" rel="noreferrer" className="citation-link">Data ↗</a>}
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })()}
                {msg.structured?.follow_up_question && (
                  <div className="structured-followup">
                    <span className="structured-label">Try asking</span>
                    <span className="structured-followup-q">{msg.structured.follow_up_question}</span>
                  </div>
                )}
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
                    {reportToast?.idx === idx && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: reportToast.status === 'ok' ? '#4caf50' : '#e53935',
                        marginLeft: '6px',
                        whiteSpace: 'nowrap',
                      }}>
                        {reportToast.status === 'ok' ? 'Reported ✓' : 'Report failed'}
                      </span>
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
                <div className="loading-state-line2">Searching your sources</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeAsk ? (
        <FollowUpQuestions
          questions={activeAsk.questions}
          onSubmit={(answerText) => sendMessage(answerText, { afterFollowUp: true })}
        />
      ) : (
        <ChatInput
          message={message}
          setMessage={setMessage}
          onSubmit={handleSubmit}
          onStop={handleStop}
          loading={loading}
          textareaRef={textareaRef}
        />
      )}

    </div>
  );
}

function ChatInput({ message, setMessage, onSubmit, onStop, loading, textareaRef }) {
  return (
    <div className="chat-input-area">
      <div className="chat-input-box">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Write message here..."
            aria-label="Chat message input"
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
          {loading ? (
            <button
              type="button"
              className="send-btn send-btn--stop"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating response"
            >
              <span className="stop-icon" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              disabled={!message.trim()}
              onClick={onSubmit}
              aria-label="Send message"
            >
              <img src={arrowUpIcon} alt="Send" className="send-icon" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
