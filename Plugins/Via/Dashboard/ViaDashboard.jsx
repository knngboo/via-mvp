import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import './ViaDashboard.css';

// Via dashboard — all of Via's visualization UI lives in this folder.
//
// Props (the plugin contract):
//   data  — output of Via's ParseLogic parse(files); null until that's built.
//   files — the raw uploaded CSV files, if the dashboard needs them directly.
//
// This dashboard ignores `files` and instead reads live VIA transit data from
// the MongoDB backend (GTFS collections imported by backend/import-gtfs.js).
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const VIA_RED = '#CB2128';

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

// GTFS dates are YYYYMMDD strings.
const fmtFeedDate = (s) =>
  s && s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : s || '';

const hourLabel = (h) => {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

function RouteTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const r = payload[0].payload;
  return (
    <div className="via-tooltip">
      <div className="via-tooltip-title">{r.route_short_name} — {r.route_long_name}</div>
      <div>{fmt(r.trips)} scheduled trips</div>
    </div>
  );
}

function HourTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="via-tooltip">
      <div className="via-tooltip-title">{hourLabel(d.hour)}</div>
      <div>{fmt(d.departures)} departures</div>
    </div>
  );
}

export default function ViaDashboard({ data = null, files = [] }) {
  const [stats, setStats] = useState(null);
  const [topRoutes, setTopRoutes] = useState([]);
  const [byHour, setByHour] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson('/api/stats'),
      getJson('/api/stats/trips-per-route?limit=10'),
      getJson('/api/stats/departures-by-hour'),
    ])
      .then(([s, routes, hours]) => {
        if (cancelled) return;
        setStats(s);
        setTopRoutes(routes);
        setByHour(hours);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="via-dashboard">
        <div className="via-dashboard-placeholder">Loading VIA transit data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="via-dashboard">
        <div className="via-dashboard-placeholder">
          Couldn&rsquo;t reach the VIA database — {error}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Bus Routes', value: stats.routes },
    { label: 'Stops', value: stats.stops },
    { label: 'Scheduled Trips', value: stats.trips },
    { label: 'Stop Departures', value: stats.stop_times },
    { label: 'Uploaded Sources', value: stats.sources },
  ];

  return (
    <div className="via-dash">
      <div className="via-dash-header">
        <h2 className="via-dash-title">VIA Metropolitan Transit</h2>
        {stats.feed && (
          <span className="via-dash-feed">
            Feed {stats.feed.feed_version} · valid {fmtFeedDate(stats.feed.feed_start_date)} – {fmtFeedDate(stats.feed.feed_end_date)}
          </span>
        )}
      </div>

      <div className="via-kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="via-kpi-card">
            <span className="via-kpi-value">{fmt(k.value)}</span>
            <span className="via-kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      <div className="via-chart-grid">
        <div className="via-chart-card">
          <h3 className="via-chart-title">Busiest Routes by Scheduled Trips</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topRoutes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="route_short_name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={48} />
              <Tooltip content={<RouteTooltip />} />
              <Bar dataKey="trips" radius={[4, 4, 0, 0]}>
                {topRoutes.map((r) => (
                  <Cell
                    key={r.route_id}
                    fill={r.route_color ? `#${r.route_color}` : VIA_RED}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="via-chart-card">
          <h3 className="via-chart-title">System Departures by Hour</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={byHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={hourLabel}
                tick={{ fontSize: 12 }}
                interval={3}
              />
              <YAxis tick={{ fontSize: 12 }} width={56} />
              <Tooltip content={<HourTooltip />} />
              <Area
                type="monotone"
                dataKey="departures"
                stroke={VIA_RED}
                fill={VIA_RED}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
