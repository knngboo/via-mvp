/**
 * CanvasDashboard — the plugin dashboard content without the page chrome.
 * Renders directly inside a workspace canvas content area.
 */

import { useEffect, useMemo, useState } from 'react';
import { getActivePlugin } from 'Plugins';
import { useCsv } from '../context/CsvContext';
import apiService from '../services/api';

export default function CanvasDashboard() {
  const [plugin, setPlugin] = useState(getActivePlugin);
  const [stats,  setStats]  = useState(null);

  const { csvData, fileName } = useCsv();
  const files = useMemo(
    () => (csvData ? [{ name: fileName, data: csvData }] : []),
    [csvData, fileName],
  );

  // Stay in sync when the active plugin changes via Settings
  useEffect(() => {
    const refresh = () => setPlugin(getActivePlugin());
    window.addEventListener('buffi:plugin-change', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('buffi:plugin-change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Fetch summary stats from backend
  useEffect(() => {
    apiService.getStats()
      .then(d => setStats(d))
      .catch(err => console.error('[CanvasDashboard] stats error:', err));
  }, []);

  const data = useMemo(() => {
    try {
      return typeof plugin?.parse === 'function' ? plugin.parse(files) : null;
    } catch (err) {
      console.error(`[plugin:${plugin?.id}] parse failed:`, err);
      return null;
    }
  }, [plugin, files]);

  if (!plugin) {
    return (
      <div className="ws-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.25, color: 'var(--Grey-500)' }}>
          <rect x="3" y="3" width="7" height="9" rx="1"/>
          <rect x="14" y="3" width="7" height="5" rx="1"/>
          <rect x="14" y="12" width="7" height="9" rx="1"/>
          <rect x="3" y="16" width="7" height="5" rx="1"/>
        </svg>
        <p className="ws-empty-title">No active agency</p>
        <p className="ws-empty-sub">
          Open Settings (⚙) to configure an active agency plugin.
        </p>
      </div>
    );
  }

  const Dashboard = plugin.Dashboard;

  return (
    <div className="ws-embed-wrap">
      {/* Compact stats bar */}
      {stats && (
        <div className="canvas-dash-stats">
          <span title="Uploaded Datasets">📂 {stats.sources || 0} Datasets</span>
          <span title="Transit Routes">🚌 {stats.routes  || 0} Routes</span>
          <span title="Transit Stops">🚏 {stats.stops   || 0} Stops</span>
          <span title="Scheduled Trips">⏱️ {(stats.trips || 0).toLocaleString()} Trips</span>
        </div>
      )}

      {/* Plugin dashboard content */}
      <div className="canvas-dash-content">
        <Dashboard data={data} files={files} />
      </div>
    </div>
  );
}
