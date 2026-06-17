/**
 * WorkspacePage v5 — canvas sidebar matches AppSidebar exactly.
 *
 * Each canvas has a 180px sidebar on its left that uses the same
 * CSS classes as AppSidebar: icon-strip-btn, strip-icon, strip-label,
 * sidebar-history, sidebar-history-item, sidebar-history-title.
 *
 * When a canvas is in Chat mode the sidebar transforms into a
 * conversation history panel (like Claude.ai) with a "New Chat"
 * button at the top, a scrollable history list, then the view
 * switcher and pane controls at the bottom.
 *
 * Split / close buttons live inside the canvas sidebar — not in the header.
 * The header bar is just the ⠿ grab handle + current view title.
 *
 * Layout node:
 *   | { kind:'pane',  id, activeView:'chat'|'map'|'chart' }
 *   | { kind:'split', id, dir:'row'|'col', ratio, a, b }
 *
 * Per-pane state includes savedConvs[] for per-canvas conversation history.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import GlobalNav from '../components/GlobalNav';
import FeedbackBubble from '../components/FeedbackBubble';
import MapView from '../components/MapView';
import ChartView from '../components/ChartView';
import CanvasDashboard from '../components/CanvasDashboard';
import CanvasSources from '../components/CanvasSources';
import { usePlugin } from '../context/PluginContext';
import '../styles/Workspace.css';

// ── View catalogue ────────────────────────────────────────────────────────────
const VIEWS = {
  chat:      { label: 'Chat'      },
  map:       { label: 'Map'       },
  chart:     { label: 'Chart'     },
  dashboard: { label: 'Dashboard' },
  sources:   { label: 'Sources'   },
};

// ── Global conversation history (localStorage-backed) ─────────────────────────
const LS_CONVS_KEY   = 'ws_conv_history';
const HISTORY_VISIBLE = 5;
const loadGlobalConvs  = () => { try { return JSON.parse(localStorage.getItem(LS_CONVS_KEY)) || []; } catch { return []; } };
const persistConvs     = (c) => { try { localStorage.setItem(LS_CONVS_KEY, JSON.stringify(c.slice(0, 100))); } catch {} };

// ── Per-pane data ─────────────────────────────────────────────────────────────
const defaultPaneState = () => ({
  // Active session
  chatHistory:   [],
  highlightData: [],
  chartData:     null,
  chartType:     'bar',
  mapTitle:      '',
  liveBuses:     null,
  heatStat:      '',
  // Which global conversation is currently loaded in this pane
  activeConvId:     null,
  // Whether the canvas sidebar is collapsed to icon-only mode
  sidebarCollapsed: false,
  // Floating Buffi bubble visible in map/chart views
  bubbleOpen:       false,
});

// ── ID generator — timestamp+random prevents collisions on HMR/hot-reload ─────
const uid = (p = 'n') =>
  `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── Derive a display title from a chat history array ──────────────────────────
function convTitle(chatHistory) {
  const firstUser = chatHistory.find(m => m.from === 'user' && m.text);
  if (!firstUser) return 'New conversation';
  const t = firstUser.text.trim();
  return t.length > 44 ? t.slice(0, 44) + '…' : t;
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
function mapPane(tree, id, fn) {
  if (tree.kind === 'pane') return tree.id === id ? fn(tree) : tree;
  const a = mapPane(tree.a, id, fn);
  const b = mapPane(tree.b, id, fn);
  return (a === tree.a && b === tree.b) ? tree : { ...tree, a, b };
}

function mapSplit(tree, id, fn) {
  if (tree.kind === 'pane') return tree;
  if (tree.id === id) return fn(tree);
  const a = mapSplit(tree.a, id, fn);
  const b = mapSplit(tree.b, id, fn);
  return (a === tree.a && b === tree.b) ? tree : { ...tree, a, b };
}

function removePane(tree, id) {
  if (tree.kind === 'pane') return tree;
  if (tree.a.kind === 'pane' && tree.a.id === id) return tree.b;
  if (tree.b.kind === 'pane' && tree.b.id === id) return tree.a;
  const a = removePane(tree.a, id);
  const b = removePane(tree.b, id);
  return (a === tree.a && b === tree.b) ? tree : { ...tree, a, b };
}

function countPanes(tree) {
  if (tree.kind === 'pane') return 1;
  return countPanes(tree.a) + countPanes(tree.b);
}

function collectPaneNodes(tree, out = []) {
  if (tree.kind === 'pane') { out.push(tree); return out; }
  collectPaneNodes(tree.a, out);
  collectPaneNodes(tree.b, out);
  return out;
}

function swapViewsInTree(tree, idA, idB) {
  const nodes = collectPaneNodes(tree);
  const nA = nodes.find(n => n.id === idA);
  const nB = nodes.find(n => n.id === idB);
  if (!nA || !nB) return tree;
  const va = nA.activeView, vb = nB.activeView;
  let result = mapPane(tree, idA, n => ({ ...n, activeView: vb }));
  result     = mapPane(result, idB, n => ({ ...n, activeView: va }));
  return result;
}

// ── Workspace layout persistence (survives navigation away) ──────────────────
const LS_LAYOUT_KEY = 'ws_layout';
const LS_STATES_KEY = 'ws_pane_states';
const _loadLayout = () => { try { const v = localStorage.getItem(LS_LAYOUT_KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const _loadStates = () => { try { const v = localStorage.getItem(LS_STATES_KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const _saveLayout = (l) => { try { localStorage.setItem(LS_LAYOUT_KEY, JSON.stringify(l)); } catch {} };
const _saveStates = (s) => { try { localStorage.setItem(LS_STATES_KEY, JSON.stringify(s)); } catch {} };

// Ensure every pane node in the layout has a corresponding pane state
function ensurePaneStates(layout, states) {
  const result = { ...states };
  const fill = (node) => {
    if (node.kind === 'pane') {
      if (!result[node.id]) result[node.id] = defaultPaneState();
    } else {
      fill(node.a);
      fill(node.b);
    }
  };
  fill(layout);
  return result;
}

// ── Root component ────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  // Lazy initializer — runs fresh on EVERY mount so navigating to /sources
  // or /admin and back always restores tiles from localStorage.
  const [initData] = useState(() => {
    const freshId     = uid('p');
    const freshLayout = { kind: 'pane', id: freshId, activeView: 'chat' };
    const layout      = _loadLayout() ?? freshLayout;
    const states      = ensurePaneStates(
      layout,
      _loadStates() ?? { [freshId]: defaultPaneState() },
    );
    const findFirst = (n) => n.kind === 'pane' ? n.id : findFirst(n.a);
    return { layout, states, focusedId: findFirst(layout) };
  });

  const [layout,     setLayout]     = useState(initData.layout);
  const [paneStates, setPaneStates] = useState(initData.states);
  const [focusedId,  setFocusedId]  = useState(initData.focusedId);
  const [drag,       setDrag]       = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  // dragRef: tracks drag source without stale-closure issues in event handlers
  const dragRef    = useRef(null);
  // Global conversation history — shared across all chat canvases, persisted to localStorage
  const [savedConvs, setSavedConvs] = useState(loadGlobalConvs);

  // Persist workspace structure so navigating to /sources or /admin doesn't reset it
  useEffect(() => { _saveLayout(layout); }, [layout]);
  useEffect(() => { _saveStates(paneStates); }, [paneStates]);

  // ── Per-pane state patch ──────────────────────────────────────────────────
  const patchState = useCallback((paneId, updates) => {
    setPaneStates(prev => ({
      ...prev,
      [paneId]: { ...prev[paneId], ...updates },
    }));
  }, []);

  // ── Conversation management ───────────────────────────────────────────────
  /**
   * Save current session to the GLOBAL history pool (localStorage),
   * then clear this pane for a fresh chat.
   */
  const newChat = useCallback((paneId, curState) => {
    // curState is passed from the render so we can call setSavedConvs at
    // the top level of the event handler — NOT inside a setPaneStates updater.
    // React Strict Mode double-invokes functional updaters, which causes the
    // nested setSavedConvs to run twice and duplicate history entries.
    const cur = curState ?? defaultPaneState();
    if (!cur.chatHistory.length) return;

    if (cur.activeConvId === null) {
      const conv = {
        id:            uid('c'),
        title:         convTitle(cur.chatHistory),
        chatHistory:   cur.chatHistory,
        highlightData: cur.highlightData,
        chartData:     cur.chartData,
        chartType:     cur.chartType,
      };
      // Top-level call — never double-invoked by Strict Mode.
      // The id guard is a safety net against any remaining race.
      setSavedConvs(prev => {
        if (prev.some(c => c.id === conv.id)) return prev;
        const next = [conv, ...prev];
        persistConvs(next);
        return next;
      });
    }

    // Side-effect-free updater — safe to double-invoke
    setPaneStates(prev => ({ ...prev, [paneId]: defaultPaneState() }));
  }, []);

  /**
   * Load a conversation from the global pool into this pane.
   * Auto-saves the pane's current in-progress session first.
   */
  const loadConv = useCallback((paneId, convId, curState) => {
    const conv = savedConvs.find(c => c.id === convId);
    if (!conv) return;

    const cur = curState ?? defaultPaneState();
    // Auto-save if this is a FRESH unsaved session
    if (cur.chatHistory.length && cur.activeConvId === null) {
      const snap = {
        id:            uid('c'),
        title:         convTitle(cur.chatHistory),
        chatHistory:   cur.chatHistory,
        highlightData: cur.highlightData,
        chartData:     cur.chartData,
        chartType:     cur.chartType,
      };
      setSavedConvs(prev => {
        if (prev.some(c => c.id === snap.id)) return prev;
        const next = [snap, ...prev];
        persistConvs(next);
        return next;
      });
    }

    // Side-effect-free updater
    setPaneStates(prev => ({
      ...prev,
      [paneId]: {
        ...defaultPaneState(),
        chatHistory:   conv.chatHistory,
        highlightData: conv.highlightData ?? [],
        chartData:     conv.chartData ?? null,
        chartType:     conv.chartType ?? 'bar',
        activeConvId:  convId,
      },
    }));
  }, [savedConvs]);

  // ── Delete a single conversation from the global pool ────────────────────────
  const deleteConv = useCallback((convId) => {
    setSavedConvs(prev => {
      const next = prev.filter(c => c.id !== convId);
      persistConvs(next);
      return next;
    });
    // Clear activeConvId on any pane that had this conv loaded
    setPaneStates(prev => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].activeConvId === convId)
          next[id] = { ...next[id], activeConvId: null };
      }
      return next;
    });
  }, []);

  // ── Clear all conversations ────────────────────────────────────────────────
  const clearAllConvs = useCallback(() => {
    setSavedConvs([]);
    persistConvs([]);
    setPaneStates(prev => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].activeConvId)
          next[id] = { ...next[id], activeConvId: null };
      }
      return next;
    });
  }, []);

  // ── Toggle canvas sidebar collapse ────────────────────────────────────────
  const toggleSidebar = useCallback((paneId) => {
    setPaneStates(prev => ({
      ...prev,
      [paneId]: {
        ...prev[paneId],
        sidebarCollapsed: !(prev[paneId]?.sidebarCollapsed ?? false),
      },
    }));
  }, []);

  // ── FeedbackBubble props ──────────────────────────────────────────────────
  const makeChatProps = useCallback((paneId) => ({
    setChatHistory: (fn) => setPaneStates(prev => {
      const cur = prev[paneId]?.chatHistory ?? [];
      return {
        ...prev,
        [paneId]: {
          ...prev[paneId],
          chatHistory: typeof fn === 'function' ? fn(cur) : fn,
        },
      };
    }),
    setHighlightData: (v) => {
      const switching = v && (Array.isArray(v) ? v.length > 0 : true);
      // Open bubble when switching to map so user can continue chatting
      patchState(paneId, { highlightData: v, ...(switching ? { bubbleOpen: true } : {}) });
      if (switching) {
        setLayout(prev => mapPane(prev, paneId, pane =>
          pane.activeView === 'chat' ? { ...pane, activeView: 'map' } : pane
        ));
      }
    },
    setChartData: (v) => {
      if (v) {
        // Merge into single patchState to avoid double renders
        patchState(paneId, { chartData: v, chartType: 'bar', bubbleOpen: true });
        setLayout(prev => mapPane(prev, paneId, pane =>
          pane.activeView === 'chat' ? { ...pane, activeView: 'chart' } : pane
        ));
      } else {
        patchState(paneId, { chartData: null });
      }
    },
    restoreChartData:   (v) => patchState(paneId, { chartData: v }),
    setLiveBuses:       (v) => patchState(paneId, { liveBuses: v }),
    setHeatStat:        (v) => patchState(paneId, { heatStat: v }),
    setMapTitle:        (v) => patchState(paneId, { mapTitle: v }),
    setChartType:       (v) => patchState(paneId, { chartType: v }),
    setIsLoading:       () => {},
    setLastQuery:       () => {},
    setLastBotResponse: () => {},
    // No-op: routing is handled directly in setHighlightData / setChartData above
    openVisualizationPanel: () => {},
    initialQuery: '',
  }), [patchState]);

  // ── Layout mutations ──────────────────────────────────────────────────────
  const splitPane = useCallback((paneId, dir) => {
    const newPaneId  = uid('p');
    const newSplitId = uid('s');
    setPaneStates(prev => ({
      ...prev,
      [newPaneId]: {
        ...defaultPaneState(),
        // Inherit sidebar collapse state from parent — don't surprise the user
        sidebarCollapsed: prev[paneId]?.sidebarCollapsed ?? false,
      },
    }));
    setFocusedId(newPaneId);
    setLayout(prev => mapPane(prev, paneId, pane => ({
      kind: 'split', id: newSplitId, dir, ratio: 0.5,
      a: pane,
      b: { kind: 'pane', id: newPaneId, activeView: 'chat' },
    })));
  }, []);

  // Duplicate: clone current pane state and open side-by-side in the same view
  const duplicatePane = useCallback((paneId) => {
    const newPaneId  = uid('p');
    const newSplitId = uid('s');
    setPaneStates(prev => {
      const src = prev[paneId] ?? defaultPaneState();
      // JSON round-trip deep-clone — all pane state is JSON-serializable
      const cloned = JSON.parse(JSON.stringify(src));
      return {
        ...prev,
        [newPaneId]: {
          ...cloned,
          bubbleOpen:   false,  // start closed in the duplicate
          activeConvId: null,   // don't share the conv reference
        },
      };
    });
    setFocusedId(newPaneId);
    setLayout(prev => mapPane(prev, paneId, pane => ({
      kind: 'split', id: newSplitId, dir: 'row', ratio: 0.5,
      a: pane,
      b: { kind: 'pane', id: newPaneId, activeView: pane.activeView },
    })));
  }, []);


  const closePane = useCallback((paneId) => {
    setLayout(prev => {
      if (countPanes(prev) <= 1) return prev;
      return removePane(prev, paneId);
    });
    setPaneStates(prev => { const n = { ...prev }; delete n[paneId]; return n; });
  }, []);

  const setActiveView = useCallback((paneId, viewId) => {
    setLayout(prev => mapPane(prev, paneId, pane => ({ ...pane, activeView: viewId })));
  }, []);

  const updateRatio = useCallback((splitId, ratio) => {
    setLayout(prev => mapSplit(prev, splitId, s => ({
      ...s, ratio: Math.max(0.15, Math.min(0.85, ratio)),
    })));
  }, []);

  // ── Pane swap DnD ─────────────────────────────────────────────────────────
  const swapPanes = useCallback((paneIdA, paneIdB) => {
    if (paneIdA === paneIdB) return;
    setLayout(prev => swapViewsInTree(prev, paneIdA, paneIdB));
    setPaneStates(prev => ({
      ...prev,
      [paneIdA]: prev[paneIdB] ?? defaultPaneState(),
      [paneIdB]: prev[paneIdA] ?? defaultPaneState(),
    }));
  }, []);

  const handlePaneDragStart = useCallback((fromPaneId, e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('ws/pane', fromPaneId);
    dragRef.current = { fromPaneId };
    setTimeout(() => setDrag({ fromPaneId }), 0);
  }, []);

  const handleDragOver = useCallback((paneId, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Don't highlight as drop target if hovering over the source pane
    if (dragRef.current?.fromPaneId !== paneId) {
      setDropTarget(paneId);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    // Only clear when the pointer truly leaves the pane boundary
    if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
  }, []);

  const handleDrop = useCallback((targetPaneId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const fromPaneId = e.dataTransfer.getData('ws/pane');
    dragRef.current = null;
    setDropTarget(null);
    setDrag(null);
    if (fromPaneId && fromPaneId !== targetPaneId) {
      swapPanes(fromPaneId, targetPaneId);
    }
  }, [swapPanes]);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setDropTarget(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const total = countPanes(layout);
  const { activePlugin } = usePlugin();

  function renderTree(node) {
    if (node.kind === 'split') {
      return (
        <WorkspaceSplit
          key={node.id}
          dir={node.dir}
          ratio={node.ratio}
          onRatioChange={(r) => updateRatio(node.id, r)}
        >
          {renderTree(node.a)}
          {renderTree(node.b)}
        </WorkspaceSplit>
      );
    }

    const state     = paneStates[node.id] ?? defaultPaneState();
    const chatProps = {
      ...makeChatProps(node.id),
      chatHistory: state.chatHistory,
      chartType:   state.chartType,
    };

    // Build a context string describing the current tile for the Buffi tile editor
    const tileCtx = (() => {
      if (node.activeView === 'map') {
        const pts   = state.highlightData?.length ?? 0;
        const title = state.mapTitle || 'map';
        const heat  = state.heatStat ? `; heatmap: ${state.heatStat}` : '';
        const live  = state.liveBuses ? '; live buses active' : '';
        return `User is viewing a MAP tile titled "${title}" showing ${pts} geographic points${heat}${live}.`;
      }
      if (node.activeView === 'chart') {
        const chart = state.chartData;
        const type  = state.chartType || 'bar';
        const rows  = chart?.data?.length ?? 0;
        const title = chart?.title || 'chart';
        return `User is viewing a CHART tile titled "${title}" (${type} chart, ${rows} data points).`;
      }
      return '';
    })();

    return (
      <WorkspacePane
        key={node.id}
        pane={node}
        state={state}
        chatProps={chatProps}
        savedConvs={savedConvs}
        setHeatStat={(v) => patchState(node.id, { heatStat: v })}
        isFocused={focusedId === node.id}
        isDropTarget={dropTarget === node.id && !!drag}
        isLastPane={total === 1}
        onFocus={() => setFocusedId(node.id)}
        onSetView={(v) => setActiveView(node.id, v)}
        onSplitH={() => splitPane(node.id, 'row')}
        onSplitV={() => splitPane(node.id, 'col')}
        onDuplicate={() => duplicatePane(node.id)}
        onClose={() => closePane(node.id)}
        onNewChat={() => newChat(node.id, paneStates[node.id])}
        onLoadConv={(id) => loadConv(node.id, id, paneStates[node.id])}
        onDeleteConv={deleteConv}
        onClearAllConvs={clearAllConvs}
        onToggleSidebar={() => toggleSidebar(node.id)}
        onToggleBubble={(open) => patchState(node.id, { bubbleOpen: open })}
        tileContext={tileCtx}
        pluginContext={activePlugin?.buffi?.context ?? ''}
        pluginSuggestions={activePlugin?.buffi?.suggestions}
        pluginMapSuggestions={activePlugin?.buffi?.mapSuggestions}
        pluginChartSuggestions={activePlugin?.buffi?.chartSuggestions}
        onPaneDragStart={(e) => handlePaneDragStart(node.id, e)}
        onDragOver={(e) => handleDragOver(node.id, e)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(node.id, e)}
        onDragEnd={handleDragEnd}
      />
    );
  }

  return (
    <div className="ws-page">
      <GlobalNav />
      <div className="ws-root">
        {renderTree(layout)}
      </div>
    </div>
  );
}

// ── Split container with drag-to-resize ───────────────────────────────────────
function WorkspaceSplit({ dir, ratio, onRatioChange, children }) {
  const splitRef = useRef(null);
  const dragging = useRef(false);

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;

    const onMove = (ev) => {
      if (!dragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const r = dir === 'row'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top)  / rect.height;
      onRatioChange(r);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor     = dir === 'row' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [dir, onRatioChange]);

  const [childA, childB] = React.Children.toArray(children);

  return (
    <div ref={splitRef} className={`ws-split ws-split--${dir}`}>
      <div className="ws-split-child" style={{ flex: ratio }}>
        {childA}
      </div>
      <div
        className={`ws-divider ws-divider--${dir}`}
        onMouseDown={handleDividerMouseDown}
      />
      <div className="ws-split-child" style={{ flex: 1 - ratio }}>
        {childB}
      </div>
    </div>
  );
}

// ── Individual pane ───────────────────────────────────────────────────────────
function WorkspacePane({
  pane, state, chatProps, savedConvs, setHeatStat,
  isFocused, isDropTarget, isLastPane,
  onFocus, onSetView,
  onSplitH, onSplitV, onDuplicate, onClose,
  onNewChat, onLoadConv, onDeleteConv, onClearAllConvs, onToggleSidebar, onToggleBubble,
  tileContext,
  pluginContext, pluginSuggestions, pluginMapSuggestions, pluginChartSuggestions,
  onPaneDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const collapsed = state.sidebarCollapsed ?? false;
  const view = VIEWS[pane.activeView] ?? VIEWS.chat;

  const classes = ['ws-pane'];
  if (isFocused)    classes.push('ws-pane--focused');
  if (isDropTarget) classes.push('ws-pane--drop');

  return (
    <div
      className={classes.join(' ')}
      onMouseDown={onFocus}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ── Header bar: drag · split buttons · view title · close ── */}
      <div className="ws-header">
        {/* ⠿ Drag handle */}
        <div
          className="ws-grab"
          title="Drag to swap pane"
          draggable
          onDragStart={onPaneDragStart}
          onDragEnd={onDragEnd}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/>
            <circle cx="3" cy="6" r="1.2"/><circle cx="9" cy="6" r="1.2"/>
            <circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/>
          </svg>
        </div>

        {/* Split right */}
        <button className="ws-header-btn" title="Split right"
          onClick={(e) => { e.stopPropagation(); onSplitH(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="8" height="18" rx="1"/>
            <rect x="14" y="3" width="8" height="18" rx="1"/>
          </svg>
        </button>

        {/* Split down */}
        <button className="ws-header-btn" title="Split down"
          onClick={(e) => { e.stopPropagation(); onSplitV(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="2" width="18" height="8" rx="1"/>
            <rect x="3" y="14" width="18" height="8" rx="1"/>
          </svg>
        </button>

        {/* Duplicate pane — clones current tile with same view & data */}
        <button className="ws-header-btn" title="Duplicate tile"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="13" height="13" rx="2"/>
            <path d="M4 16V4a2 2 0 0 1 2-2h12"/>
          </svg>
        </button>

        {/* View name — fills remaining space */}
        <span className="ws-pane-title">{view.label}</span>

        {/* Close pane — far right, only when more than one pane exists */}
        {!isLastPane && (
          <button className="ws-header-btn ws-header-close" title="Close pane"
            onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6"  x2="6"  y2="18"/>
              <line x1="6"  y1="6"  x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Body: canvas sidebar + content ── */}
      <div className="ws-body">
        {/* Canvas sidebar — uses exact same classes as AppSidebar */}
        <div
          className={`ws-canvas-nav col-sidebar col-sidebar--expanded${
            collapsed ? ' ws-canvas-nav--collapsed' : ''
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Edge tab to collapse/expand — sticks out to the right */}
          <button
            className="ws-sidebar-tab"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={(e) => { e.stopPropagation(); onToggleSidebar(); }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="9 18 15 12 9 6"/>
                : <polyline points="15 18 9 12 15 6"/>
              }
            </svg>
          </button>
          <div className="left-icon-strip">

            {/* ──── TOP: All view switcher buttons — Chat pinned last ──── */}
            <button
              className={`icon-strip-btn${pane.activeView === 'map' ? ' icon-strip-btn--active' : ''}`}
              title="Map" onClick={() => onSetView('map')}
            >
              <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <span className="strip-label">Map</span>
            </button>

            <button
              className={`icon-strip-btn${pane.activeView === 'chart' ? ' icon-strip-btn--active' : ''}`}
              title="Chart" onClick={() => onSetView('chart')}
            >
              <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6"  y1="20" x2="6"  y2="14"/>
                <line x1="2"  y1="20" x2="22" y2="20"/>
              </svg>
              <span className="strip-label">Chart</span>
            </button>

            <button
              className={`icon-strip-btn${pane.activeView === 'dashboard' ? ' icon-strip-btn--active' : ''}`}
              title="Dashboard" onClick={() => onSetView('dashboard')}
            >
              <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1"/>
                <rect x="14" y="3" width="7" height="5" rx="1"/>
                <rect x="14" y="12" width="7" height="9" rx="1"/>
                <rect x="3" y="16" width="7" height="5" rx="1"/>
              </svg>
              <span className="strip-label">Dashboard</span>
            </button>

            <button
              className={`icon-strip-btn${pane.activeView === 'sources' ? ' icon-strip-btn--active' : ''}`}
              title="Sources" onClick={() => onSetView('sources')}
            >
              <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <span className="strip-label">Sources</span>
            </button>

            {/* Chat last in the view group */}
            <button
              className={`icon-strip-btn${pane.activeView === 'chat' ? ' icon-strip-btn--active' : ''}`}
              title="Chat" onClick={() => onSetView('chat')}
            >
              <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="strip-label">Chat</span>
            </button>

            {/* ──── BELOW view tabs: New Chat + history (chat mode only) ── */}
            {pane.activeView === 'chat' && (
              <>
                <div className="ws-nav-sep" />
                <button className="icon-strip-btn" title="New Chat" onClick={onNewChat}>
                  <svg className="strip-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.7"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  <span className="strip-label">New Chat</span>
                </button>

                <div className="sidebar-history ws-canvas-history">
                  {savedConvs.length === 0 ? (
                    <p className="ws-no-history">Start a conversation — it will appear here.</p>
                  ) : (
                    <>
                      {/* History header with Clear-all action */}
                      <div className="ws-history-header">
                        <span className="ws-history-label">History</span>
                        <button
                          className="ws-history-clear"
                          onClick={() => {
                            if (window.confirm('Clear all conversation history?')) onClearAllConvs();
                          }}
                        >Clear all</button>
                      </div>

                      {(historyExpanded
                        ? savedConvs
                        : savedConvs.slice(0, HISTORY_VISIBLE)
                      ).map(conv => (
                        <div
                          key={conv.id}
                          className={`sidebar-history-item ws-conv-row${
                            state.activeConvId === conv.id ? ' sidebar-history-item--active' : ''
                          }`}
                        >
                          <button
                            className="sidebar-history-title"
                            onClick={() => onLoadConv(conv.id)}
                            title={conv.title}
                          >
                            <span className="sidebar-history-title-text">{conv.title}</span>
                          </button>
                          {/* Per-item delete button — visible on hover */}
                          <button
                            className="ws-conv-delete"
                            title="Delete conversation"
                            onClick={(e) => { e.stopPropagation(); onDeleteConv(conv.id); }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                      {savedConvs.length > HISTORY_VISIBLE && (
                        <button
                          className="ws-history-more"
                          onClick={() => setHistoryExpanded(e => !e)}
                        >
                          {historyExpanded
                            ? '↑ Show less'
                            : `▼ ${savedConvs.length - HISTORY_VISIBLE} more`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

          </div>
        </div>

        {/* ── Content area ── */}
        <div className="ws-content" onMouseDown={(e) => e.stopPropagation()}>

          {pane.activeView === 'chat' && (
            <div className="chat-panel ws-chat-fill">
              <FeedbackBubble
                key={`fb-${pane.id}`}
                {...chatProps}
                pluginContext={pluginContext}
                suggestions={pluginSuggestions}
              />
            </div>
          )}

          {pane.activeView === 'map' && (
            <MapView
              highlightData={state.highlightData ?? []}
              viewMode="circle"
              liveBuses={state.liveBuses}
              heatStat={state.heatStat}
              setHeatStat={setHeatStat}
            />
          )}

          {pane.activeView === 'chart' && (
            state.chartData
              ? <div className="ws-chart-wrap">
                  <ChartView chartData={state.chartData} chartType={state.chartType} />
                </div>
              : <ChartEmpty />
          )}

          {pane.activeView === 'dashboard' && (
            <CanvasDashboard />
          )}

          {pane.activeView === 'sources' && (
            <div className="ws-embed-wrap">
              <CanvasSources />
            </div>
          )}

          {/* ── Floating Buffi tile editor (map + chart views only) ── */}
          {(pane.activeView === 'map' || pane.activeView === 'chart') && (
            <div
              className={`ws-bubble-wrap${
                state.bubbleOpen ? ' ws-bubble-wrap--open' : ''
              }`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {state.bubbleOpen ? (
                <>
                  <div className="ws-bubble-header">
                    <div className="ws-bubble-title-group">
                      <span className="ws-bubble-title">✦ buffi</span>
                      <span className="ws-bubble-subtitle">
                        {pane.activeView === 'map' ? 'map editor' : 'chart editor'}
                      </span>
                    </div>
                    <button
                      className="ws-bubble-close"
                      onClick={(e) => { e.stopPropagation(); onToggleBubble(false); }}
                    >✕</button>
                  </div>
                  <div className="ws-bubble-body">
                    <FeedbackBubble
                      key={`fb-bubble-${pane.id}`}
                      {...chatProps}
                      tileMode={true}
                      tileView={pane.activeView}
                      tileContext={tileContext}
                      pluginContext={pluginContext}
                      suggestions={
                        pane.activeView === 'map'
                          ? (pluginMapSuggestions ?? undefined)
                          : (pluginChartSuggestions ?? undefined)
                      }
                    />
                  </div>
                </>
              ) : (
                <button
                  className="ws-bubble-trigger"
                  title="Open Buffi tile editor"
                  onClick={(e) => { e.stopPropagation(); onToggleBubble(true); }}
                >
                  <span className="ws-bubble-icon">✦</span>
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Chart empty state ─────────────────────────────────────────────────────────
function ChartEmpty() {
  return (
    <div className="ws-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: 0.25, color: 'var(--Grey-500)' }}>
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6"  y1="20" x2="6"  y2="14"/>
        <line x1="2"  y1="20" x2="22" y2="20"/>
      </svg>
      <p className="ws-empty-title">No chart data yet</p>
      <p className="ws-empty-sub">
        Switch to Chat, ask Buffi to chart something, then come back here.
      </p>
    </div>
  );
}
