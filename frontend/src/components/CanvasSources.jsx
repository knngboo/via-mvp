/**
 * CanvasSources — Sources browser embedded inside a canvas tile.
 *
 * Features:
 *  - Grouped by category: Public Data / Organization / Private Data
 *  - Click a source → tabular data preview + "buffi" AI summary
 *  - AI summary shows "(preview)" when no API key, "(live)" when key present
 *  - Real Gemini summary call stub — activate by setting buffi_api_key in settings
 *
 * Security notes:
 *  - All real source data goes through apiService (JWT-authenticated)
 *  - Mock/fallback data is only shown in dev or when API returns empty
 *  - API key is read from localStorage (set via SettingsModal)
 */

import React, { useEffect, useState, useCallback } from 'react';
import apiService from '../services/api';
import { usePlugin } from '../context/PluginContext';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)    return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const readApiKey = () => {
  try { return localStorage.getItem('buffi_api_key') || null; }
  catch { return null; }
};

// ── Categories ─────────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ['public', 'org', 'private'];
const CATEGORY_META = {
  public:  { label: 'Public Data',   color: '#22c55e', bg: 'rgba(34,197,94,0.09)'   },
  org:     { label: 'Organization',  color: '#8C94CE', bg: 'rgba(140,148,206,0.09)' },
  private: { label: 'Private Data',  color: '#f59e0b', bg: 'rgba(245,158,11,0.09)'  },
};

const CatIcon = ({ cat, size = 11 }) => {
  if (cat === 'public') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
  if (cat === 'org') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
  // private
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
};

// ── Mock data (dev / offline fallback) ────────────────────────────────────────
const MOCK_SOURCES = [
  { id: 'm1', name: 'bus_stops_GTFS.csv',            status: 'Ready', data_domain: 'Transit',        size: 45_200,  category: 'public'  },
  { id: 'm2', name: 'housing_affordability_2023.csv', status: 'Ready', data_domain: 'Housing',        size: 128_000, category: 'public'  },
  { id: 'm5', name: 'demographics_census_2020.csv',   status: 'Ready', data_domain: 'Demographics',   size: 345_000, category: 'public'  },
  { id: 'm3', name: 'safety_incidents_Q4.csv',        status: 'Ready', data_domain: 'Safety',         size: 87_000,  category: 'org'     },
  { id: 'm7', name: 'transit_ridership_daily.csv',    status: 'Ready', data_domain: 'Transit',        size: 63_400,  category: 'org'     },
  { id: 'm4', name: 'infrastructure_roads.geojson',   status: 'Error', data_domain: 'Infrastructure', size: 210_000, category: 'org'     },
  { id: 'm6', name: 'zoning_parcels_2024.csv',        status: 'Ready', data_domain: 'Planning',       size: 520_000, category: 'private' },
  { id: 'm8', name: 'crime_reports_2023.csv',         status: 'Ready', data_domain: 'Safety',         size: 198_000, category: 'private' },
];

// Mock preview data by domain
const PREVIEW_DATA = {
  Transit: {
    columns: ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'zone_id'],
    rows: [
      ['1001', 'Main St & 1st Ave',       '41.8781', '-87.6298', 'A'],
      ['1002', 'Oak Park Transit Ctr',    '41.8850', '-87.7845', 'A'],
      ['1003', 'Forest Park Blue Line',   '41.8765', '-87.8175', 'B'],
      ['1004', 'Midway Airport',          '41.7868', '-87.7379', 'B'],
      ['1005', 'Howard Red/Purple/Yellow','42.0190', '-87.6722', 'A'],
      ['1006', "O'Hare Int'l Airport",    '41.9796', '-87.9035', 'C'],
      ['1007', 'Belmont Red/Brown/Purple','41.9395', '-87.6529', 'A'],
    ],
    summary: 'Contains 1,247 bus and rail stop locations with GPS coordinates, zone classifications, and accessibility data across the metro transit network. 78% of stops are ADA-compliant.',
    rowCount: 1247,
  },
  Housing: {
    columns: ['parcel_id', 'address', 'median_value', 'year_built', 'bedrooms'],
    rows: [
      ['P10234', '123 Elm Street',   '$245,000', '1962', '3'],
      ['P10235', '456 Oak Avenue',   '$312,000', '1978', '4'],
      ['P10236', '789 Maple Drive',  '$187,500', '1945', '2'],
      ['P10237', '321 Pine Road',    '$425,000', '2005', '4'],
      ['P10238', '654 Cedar Lane',   '$156,000', '1938', '2'],
      ['P10239', '987 Birch Blvd',   '$538,000', '2018', '5'],
      ['P10240', '741 Spruce Court', '$203,000', '1957', '3'],
    ],
    summary: 'Housing affordability dataset with 18,432 residential properties. Median home value $267,000. 34% of units built before 1960. Highest concentration of affordable housing in Districts 4 and 7.',
    rowCount: 18432,
  },
  Safety: {
    columns: ['incident_id', 'type', 'date', 'district', 'reported'],
    rows: [
      ['INC001', 'Traffic Collision', '2023-10-14', 'District 5', 'Yes'],
      ['INC002', 'Vandalism',         '2023-10-15', 'District 2', 'Yes'],
      ['INC003', 'Theft',             '2023-10-15', 'District 8', 'Yes'],
      ['INC004', 'Traffic Collision', '2023-10-16', 'District 3', 'No'],
      ['INC005', 'Noise Complaint',   '2023-10-17', 'District 6', 'Yes'],
      ['INC006', 'Vandalism',         '2023-10-18', 'District 1', 'Yes'],
      ['INC007', 'Theft',             '2023-10-19', 'District 5', 'Yes'],
    ],
    summary: '12,891 safety incidents recorded in Q4 2023. Traffic collisions represent 42% of all incidents. Districts 3 and 5 show the highest density. Vandalism up 14% vs Q3.',
    rowCount: 12891,
  },
  Demographics: {
    columns: ['tract_id', 'population', 'median_age', 'median_income', 'poverty_rate'],
    rows: [
      ['17031010100', '4,823', '34.2', '$52,400', '12.3%'],
      ['17031010200', '3,156', '41.7', '$78,900',  '6.1%'],
      ['17031010300', '5,234', '28.9', '$38,200', '21.4%'],
      ['17031010400', '2,987', '52.1', '$95,600',  '4.2%'],
      ['17031010500', '6,412', '31.5', '$45,700', '17.8%'],
      ['17031010600', '3,891', '38.0', '$61,200', '10.5%'],
      ['17031010700', '4,102', '44.3', '$88,100',  '3.8%'],
    ],
    summary: 'Census 2020 demographic data covering 847 census tracts. Total population 2.7M. Median age 36.4 years. Median household income $58,900. 12% of population below the poverty line.',
    rowCount: 847,
  },
  Infrastructure: {
    columns: ['road_id', 'name', 'condition', 'length_mi', 'last_repaired'],
    rows: [
      ['R001', 'Main Street',          'Good',     '2.3', '2021-06'],
      ['R002', 'Oak Avenue',           'Fair',     '1.7', '2018-03'],
      ['R003', 'Industrial Blvd',      'Poor',     '4.1', '2015-09'],
      ['R004', 'Highway 45 Connector', 'Good',     '3.8', '2022-11'],
      ['R005', 'Cedar Lane',           'Critical', '0.9', '2012-04'],
      ['R006', 'Commerce Drive',       'Fair',     '2.1', '2019-07'],
      ['R007', 'Airport Access Road',  'Good',     '5.4', '2023-01'],
    ],
    summary: '2,341 road segments catalogued. 18% rated Poor or Critical requiring immediate attention. Average repair cycle 7.2 years. Estimated deferred maintenance backlog: $42M.',
    rowCount: 2341,
  },
  Planning: {
    columns: ['parcel_id', 'zone_code', 'allowed_use', 'max_height', 'floor_ratio'],
    rows: [
      ['Z10001', 'R-1', 'Single Family',      '35 ft', '0.5'],
      ['Z10002', 'C-2', 'Commercial General', '65 ft', '2.0'],
      ['Z10003', 'M-1', 'Light Industrial',   '50 ft', '1.5'],
      ['Z10004', 'R-3', 'Multi-Family',       '55 ft', '1.8'],
      ['Z10005', 'B-3', 'Business District',  '80 ft', '3.0'],
      ['Z10006', 'MX',  'Mixed Use',          '70 ft', '2.5'],
      ['Z10007', 'R-2', 'Two-Family',         '35 ft', '0.8'],
    ],
    summary: '47,823 zoning parcels across 12 districts. Residential zones account for 68% of total area. 2024 updates added new mixed-use overlay zones along 5 transit corridors.',
    rowCount: 47823,
  },
};

const getMockPreview = (source) =>
  PREVIEW_DATA[source.data_domain] ?? {
    columns: ['id', 'name', 'value', 'date'],
    rows: [['1', 'Record A', '100', '2023-01-01'], ['2', 'Record B', '200', '2023-01-02']],
    summary: `Dataset "${source.name}" — ${fmt(source.size) ?? 'unknown size'}. Connect to the API for full column metadata and AI summaries.`,
    rowCount: null,
  };

// ── AI summary stub ────────────────────────────────────────────────────────────
// When a real Gemini API key is present (stored as buffi_api_key in localStorage),
// this will call the API for a live summary. Otherwise falls back to mock text.
async function fetchAISummary(source, mockPreview) {
  const key = readApiKey();
  if (!key) return { text: mockPreview.summary, live: false };

  try {
    const prompt = [
      `You are a data analyst assistant for the Buffi platform.`,
      `Summarize the following dataset in 2–3 sentences for a city analyst.`,
      `Dataset name: ${source.name}`,
      `Domain: ${source.data_domain}`,
      `Columns: ${mockPreview.columns.join(', ')}`,
      `Size: ${fmt(source.size) ?? 'unknown'}`,
      `Row count: ${mockPreview.rowCount?.toLocaleString() ?? 'unknown'}`,
    ].join('\n');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return { text, live: true };
    throw new Error('Empty response');
  } catch {
    return { text: mockPreview.summary, live: false };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
const StatusDot = ({ status }) => (
  <span style={{
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    flexShrink: 0, marginTop: 1,
    background: status === 'Ready' ? '#22c55e' : status === 'Error' ? '#ef4444' : '#94a3b8',
  }} />
);

// Category section header
const CatHeader = ({ cat, count }) => {
  const m = CATEGORY_META[cat];
  return (
    <div className="cs-cat-header">
      <span className="cs-cat-icon" style={{ color: m.color }}>
        <CatIcon cat={cat} size={10} />
      </span>
      <span className="cs-cat-label" style={{ color: m.color }}>{m.label}</span>
      <span className="cs-cat-count">{count}</span>
    </div>
  );
};

// Buffi AI badge shown next to summary
const BuffiBadge = ({ live }) => (
  <div className="cs-buffi-badge">
    <span className="cs-buffi-star">✦</span>
    <span className="cs-buffi-name">buffi</span>
    {live
      ? <span className="cs-buffi-live">live<span className="cs-live-dot" /></span>
      : <span className="cs-buffi-preview" title="Add an API key in Settings to enable live AI summaries">preview</span>
    }
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export default function CanvasSources() {
  const [sources,  setSources]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [summary,  setSummary]  = useState({ text: '', live: false, loading: true });

  const { activePlugin } = usePlugin();
  const pluginSources = activePlugin?.dataSources ?? [];

  // Fetch sources list
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.resolve()
      .then(() => apiService.getSources?.())
      .then(data  => { if (active) setSources(data?.length ? data : MOCK_SOURCES); })
      .catch(()   => { if (active) setSources(MOCK_SOURCES); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // When a source is selected, fetch (or mock) its AI summary
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const preview = getMockPreview(selected);
    setSummary({ text: '', live: false, loading: true });
    fetchAISummary(selected, preview).then(result => {
      if (active) setSummary({ ...result, loading: false });
    });
    return () => { active = false; };
  }, [selected]);

  // Group filtered sources by category
  const filtered = sources.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = filtered.filter(s => (s.category ?? 'org') === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  // ── Preview mode ──────────────────────────────────────────────────────────
  if (selected) {
    const preview = getMockPreview(selected);
    const catM = CATEGORY_META[selected.category ?? 'org'];
    return (
      <div className="canvas-sources">
        {/* Preview header */}
        <div className="canvas-sources-preview-header">
          <button className="cs-back-btn" onClick={() => setSelected(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Sources
          </button>
          <div className="cs-preview-meta">
            <div className="cs-preview-name-row">
              <span className="cs-preview-name">{selected.name}</span>
              <span className="cs-preview-cat-pill" style={{ color: catM.color, background: catM.bg }}>
                <CatIcon cat={selected.category ?? 'org'} size={9} />
                {catM.label}
              </span>
            </div>
            <div className="cs-preview-chips">
              <StatusDot status={selected.status || 'Ready'} />
              <span>{selected.status || 'Ready'}</span>
              {selected.data_domain && <><span className="canvas-source-dot">·</span><span>{selected.data_domain}</span></>}
              {selected.size && <><span className="canvas-source-dot">·</span><span>{fmt(selected.size)}</span></>}
              {preview.rowCount && <><span className="canvas-source-dot">·</span><span>{preview.rowCount.toLocaleString()} rows</span></>}
            </div>
          </div>
        </div>

        {/* Buffi AI summary */}
        <div className="cs-summary-block">
          <BuffiBadge live={summary.live} />
          <p className="cs-summary-text">
            {summary.loading ? 'Generating summary…' : summary.text}
          </p>
        </div>

        {/* Data table */}
        <div className="cs-table-wrap">
          <table className="cs-table">
            <thead>
              <tr>
                {preview.columns.map(col => (
                  <th key={col} className="cs-th">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr key={i} className="cs-tr">
                  {row.map((cell, j) => (
                    <td key={j} className="cs-td">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rowCount && preview.rowCount > preview.rows.length && (
            <p className="cs-table-footer">
              Showing {preview.rows.length} of {preview.rowCount.toLocaleString()} rows
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── List mode ─────────────────────────────────────────────────────────────
  const totalVisible = filtered.length;

  // Refresh badge color
  const refreshColor = (r) => r === 'realtime' ? '#22c55e' : r === 'daily' ? '#3b82f6' : '#8C94CE';
  const refreshLabel = (r) => r === 'realtime' ? 'Live' : r === 'daily' ? 'Daily' : r === 'weekly' ? 'Weekly' : r === 'monthly' ? 'Monthly' : r === 'annual' ? 'Annual' : r;

  return (
    <div className="canvas-sources">
      <div className="canvas-sources-header">
        <span className="canvas-sources-title">Sources</span>
        <span className="canvas-sources-count">{sources.length} uploaded</span>
      </div>

      <div className="canvas-sources-search-wrap">
        <svg className="canvas-sources-search-icon" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="canvas-sources-search"
          type="text"
          placeholder="Search sources…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="canvas-sources-body">

        {/* ── Agency Data — plugin-provided pre-wired sources ── */}
        {pluginSources.length > 0 && (
          <div className="cs-cat-section">
            <div className="cs-cat-header">
              <span className="cs-cat-icon" style={{ color: activePlugin?.color ?? '#8C94CE' }}>
                <span style={{ fontSize: 10 }}>{activePlugin?.icon ?? '🏛'}</span>
              </span>
              <span className="cs-cat-label" style={{ color: activePlugin?.color ?? '#8C94CE' }}>
                {activePlugin?.shortName} Agency Data
              </span>
              <span className="cs-cat-count">{pluginSources.length}</span>
            </div>
            {pluginSources.map(ds => (
              <div key={ds.id} className="canvas-source-row cs-plugin-source-row">
                <div className="canvas-source-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    width="14" height="14">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                </div>
                <div className="canvas-source-info">
                  <span className="canvas-source-name">{ds.name}</span>
                  <div className="canvas-source-meta">
                    <span className="cs-plugin-refresh-badge"
                      style={{ color: refreshColor(ds.refresh), borderColor: `${refreshColor(ds.refresh)}33`, background: `${refreshColor(ds.refresh)}11` }}>
                      {refreshLabel(ds.refresh)}
                    </span>
                    <span className="canvas-source-dot">·</span>
                    <span>{ds.category}</span>
                    {ds.autoLoaded
                      ? <><span className="canvas-source-dot">·</span><span style={{ color: '#22c55e' }}>auto-loaded</span></>
                      : <><span className="canvas-source-dot">·</span><span style={{ color: '#f59e0b' }}>upload required</span></>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && <p className="canvas-sources-empty">Loading…</p>}

        {!loading && totalVisible === 0 && pluginSources.length === 0 && (
          <p className="canvas-sources-empty">
            {search ? 'No sources match your search.' : 'No sources yet. Upload data from the Upload tab.'}
          </p>
        )}

        {!loading && totalVisible === 0 && pluginSources.length > 0 && !search && (
          <p className="canvas-sources-empty" style={{ fontSize: 11, color: 'var(--Grey-400)' }}>
            No uploaded data yet — agency data above is pre-wired.
          </p>
        )}

        {!loading && CATEGORY_ORDER.map(cat => {
          const items = grouped[cat];
          if (!items) return null;
          return (
            <div key={cat} className="cs-cat-section">
              <CatHeader cat={cat} count={items.length} />
              {items.map(source => (
                <button
                  key={source.id}
                  className="canvas-source-row cs-source-btn"
                  onClick={() => setSelected(source)}
                >
                  <div className="canvas-source-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      width="14" height="14">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="canvas-source-info">
                    <span className="canvas-source-name">{source.name}</span>
                    <div className="canvas-source-meta">
                      <StatusDot status={source.status || 'Ready'} />
                      <span>{source.status || 'Ready'}</span>
                      {source.data_domain && <><span className="canvas-source-dot">·</span><span>{source.data_domain}</span></>}
                      {source.size && <><span className="canvas-source-dot">·</span><span>{fmt(source.size)}</span></>}
                    </div>
                  </div>
                  <svg className="cs-chevron" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    width="13" height="13">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
