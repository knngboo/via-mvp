// MapView.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from '@turf/turf';
import "../styles/MapView.css"

// H-2: Escape all dynamic values inserted into Leaflet bindPopup() innerHTML.
// Leaflet renders popup content as raw HTML, so unescaped AI-derived strings
// (MSAG_Name, name, etc.) could execute injected scripts.
const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const targetZips = [
  "78201", "78202", "78203", "78204", "78205", "78206", "78207", "78208",
  "78209", "78210", "78211", "78212", "78213", "78214", "78215", "78216",
  "78217", "78218", "78219", "78220", "78221", "78222", "78223", "78224",
  "78225", "78226", "78227", "78228", "78229", "78230", "78231", "78232",
  "78233", "78234", "78235", "78236", "78237", "78238", "78239", "78240",
  "78241", "78242", "78243", "78244", "78245", "78246", "78247", "78248",
  "78249", "78250", "78251", "78252", "78253", "78254", "78255", "78256",
  "78257", "78258", "78259", "78260", "78261", "78262", "78263", "78264",
  "78265", "78266", "78268", "78269", "78270", "78275", "78278", "78279",
  "78280", "78283", "78284", "78285", "78286", "78287", "78288", "78289",
  "78291", "78292", "78293", "78294", "78295", "78296", "78297", "78298", "78299"
];

const mapCenter = [29.4252, -98.4946]; // Downtown San Antonio
const EMPTY_ARRAY = [];
const LIVE_REFRESH_MS = 12000; // how often to re-poll the live vehicle feed

// Small bus icon used for vehicle markers (live or kind:'bus' points).
const busIcon = L.divIcon({
  className: 'bus-marker',
  html: '<div style="font-size:18px;line-height:22px;text-align:center;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45));">🚌</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
});

// ── Census heat map ──────────────────────────────────────────────────────────
// Statistic options (mirrors backend census.STATS) so the dropdown is available
// before the census payload loads.
const STAT_OPTIONS = [
  { id: 'population',        label: 'Total Population' },
  { id: 'median_income',     label: 'Median Household Income' },
  { id: 'per_capita_income', label: 'Per Capita Income' },
  { id: 'median_home_value', label: 'Median Home Value' },
  { id: 'median_age',        label: 'Median Age' },
  { id: 'poverty_rate',      label: 'Poverty Rate' },
  { id: 'unemployment_rate', label: 'Unemployment Rate' },
];

// Sequential YlOrRd color ramp for the choropleth.
const HEAT_STOPS = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];

const _hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const _rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');

// Map t in [0,1] to a color along the ramp.
function heatColor(t) {
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const n = HEAT_STOPS.length - 1;
  const seg = Math.min(n - 1, Math.floor(c * n));
  const f = c * n - seg;
  const a = _hexToRgb(HEAT_STOPS[seg]);
  const b = _hexToRgb(HEAT_STOPS[seg + 1]);
  return _rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

function fmtStat(v, format) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  if (format === 'currency') return '$' + Math.round(v).toLocaleString();
  if (format === 'percent') return `${v.toFixed(1)}%`;
  if (format === 'decimal') return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

export default function ZipMap({ highlightData = EMPTY_ARRAY, viewMode = 'district', liveBuses = null, heatStat = '', setHeatStat = null }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const geoJsonLayer = useRef(null);
  const heatLayer = useRef(null);
  const circleLayers = useRef(L.layerGroup());

  const [zipData, setZipData] = useState(null);
  const [zipCounts, setZipCounts] = useState({});
  const [livePoints, setLivePoints] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [censusData, setCensusData] = useState(null); // { year, stats: [...] }
  const [censusError, setCensusError] = useState('');

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    
    mapInstance.current = L.map(mapRef.current, {
      center: mapCenter,
      zoom: 11,
      scrollWheelZoom: false,
      zoomControl: false, // default control sits top-left under the heat-map panel
    });

    // Explicit zoom in/out buttons, bottom-right so they don't collide with overlays.
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance.current);

    circleLayers.current.addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // Fetch GeoJSON
  useEffect(() => {
    fetch("/data/tx_zips.geojson")
      .then((res) => res.json())
      .then((data) => {
        const filtered = {
          type: "FeatureCollection",
          features: data.features.filter((f) =>
            targetZips.includes(f.properties.ZCTA5CE10 || f.properties.ZIP || f.properties.zip)
          ),
        };
        setZipData(filtered);
      })
      .catch(err => console.error("Failed to load map data", err));
  }, []);

  // Fetch census ACS data lazily the first time a heat-map stat is selected.
  useEffect(() => {
    if (!heatStat || censusData) return;
    let cancelled = false;
    fetch('/api/census/heatmap', { credentials: 'include' })
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || !body.stats || body.stats.length === 0) {
          setCensusError(body.error || 'Census data unavailable.');
        } else {
          setCensusData(body);
          setCensusError('');
        }
      })
      .catch(() => { if (!cancelled) setCensusError('Census data unavailable.'); });
    return () => { cancelled = true; };
  }, [heatStat, censusData]);

  // Aggregate Data
  useEffect(() => {
    if (viewMode === 'district' && zipData && highlightData && Array.isArray(highlightData)) {
      const counts = {};
      highlightData.forEach((d) => {
        if (d.Latitude && d.Longitude) {
          const pt = turf.point([parseFloat(d.Longitude), parseFloat(d.Latitude)]);
          for (const feature of zipData.features) {
            if (turf.booleanPointInPolygon(pt, feature)) {
              const zip = feature.properties.ZCTA5CE10 || feature.properties.ZIP || feature.properties.zip;
              if (zip) {
                counts[zip] = (counts[zip] || 0) + (d.count || 1);
              }
              break;
            }
          }
        }
      });
      setZipCounts(counts);
    } else {
      setZipCounts({});
    }
  }, [highlightData, zipData, viewMode]);

  // Render ZIP district choropleth (point-in-polygon counts) — district mode only.
  useEffect(() => {
    if (!mapInstance.current || !zipData) return;

    if (geoJsonLayer.current) {
      geoJsonLayer.current.remove();
      geoJsonLayer.current = null;
    }

    if (viewMode !== 'district') return;

    const zipOf = (f) => f.properties.ZCTA5CE10 || f.properties.ZIP || f.properties.zip;
    const highlightedZips = new Set(Object.keys(zipCounts));

    const style = (feature) => {
      const zip = zipOf(feature);
      return highlightedZips.has(String(zip))
        ? { color: '#FF4500', weight: 3, fillOpacity: 0.7 }
        : { color: '#1E90FF', weight: 1.5, fillOpacity: 0.3 };
    };

    const onEachFeature = (feature, layer) => {
      const zip = zipOf(feature);
      let zipHTML = `<div class="popup-zip">ZIP Code: <strong>${escapeHtml(zip)}</strong></div>`;
      let countHTML = '';
      let streetsHTML = '';

      if (zipCounts[zip]) {
        countHTML = `<div class="popup-count">Total Count: <strong>${escapeHtml(zipCounts[zip])}</strong></div>`;

        if (highlightData && Array.isArray(highlightData)) {
          const pointsInZip = highlightData.filter((d) => {
            if (d.Latitude && d.Longitude) {
              const pt = turf.point([parseFloat(d.Longitude), parseFloat(d.Latitude)]);
              return turf.booleanPointInPolygon(pt, feature);
            }
            return false;
          });

          const streetCounts = {};
          pointsInZip.forEach((d) => {
            const street = d.MSAG_Name || d.name || d.Sensitive || 'Unknown';
            streetCounts[street] = (streetCounts[street] || 0) + (d.count || 1);
          });

          streetsHTML = `<div class="popup-streets"><strong>Street Breakdown:</strong><ul>`;
          Object.entries(streetCounts).forEach(([street, count]) => {
            streetsHTML += `<li>${escapeHtml(street)}: ${escapeHtml(count)}</li>`;
          });
          streetsHTML += `</ul></div>`;
        }
      }

      layer.bindPopup(`
        <div class="custom-popup">
          ${zipHTML}
          ${countHTML}
          ${streetsHTML}
        </div>
      `, { className: "my-custom-popup" });

      layer.on({
        mouseover: (e) => { e.target.setStyle({ weight: 3, color: "#FFD700", fillOpacity: 0.6 }); },
        mouseout: (e) => { geoJsonLayer.current.resetStyle(e.target); },
      });
    };

    geoJsonLayer.current = L.geoJSON(zipData, { style, onEachFeature }).addTo(mapInstance.current);
  }, [zipData, zipCounts, viewMode, highlightData]);

  // Render the census heat map as a TRACT choropleth (separate layer, colored by
  // the selected ACS statistic keyed on GEOID). Uses geometry from the backend.
  useEffect(() => {
    if (!mapInstance.current) return;

    if (heatLayer.current) {
      heatLayer.current.remove();
      heatLayer.current = null;
    }

    const stat = (heatStat && censusData)
      ? censusData.stats.find((s) => s.id === heatStat)
      : null;
    if (!stat || !censusData || !censusData.geojson) return;

    const span = (stat.max - stat.min) || 1;

    const style = (feature) => {
      const v = stat.values[feature.properties.GEOID];
      if (v === undefined || v === null) {
        return { color: '#cccccc', weight: 0.5, fillColor: '#eeeeee', fillOpacity: 0.35 };
      }
      return {
        color: '#ffffff',
        weight: 0.5,
        fillColor: heatColor((v - stat.min) / span),
        fillOpacity: 0.78,
      };
    };

    const onEachFeature = (feature, layer) => {
      const p = feature.properties || {};
      const v = stat.values[p.GEOID];
      layer.bindPopup(`
        <div class="custom-popup">
          <div class="popup-zip">Tract <strong>${escapeHtml(p.name || p.GEOID)}</strong></div>
          <div>${escapeHtml(stat.label)}: <strong>${escapeHtml(fmtStat(v, stat.format))}</strong></div>
        </div>
      `, { className: "my-custom-popup" });
      layer.on({
        mouseover: (e) => { e.target.setStyle({ weight: 2, color: '#333333' }); },
        mouseout: (e) => { if (heatLayer.current) heatLayer.current.resetStyle(e.target); },
      });
    };

    heatLayer.current = L.geoJSON(censusData.geojson, { style, onEachFeature }).addTo(mapInstance.current);

    // Frame the county the first time a heat map is shown.
    try {
      mapInstance.current.fitBounds(heatLayer.current.getBounds(), { padding: [20, 20] });
    } catch (_) { /* ignore if bounds unavailable */ }
  }, [heatStat, censusData]);

  // Fetch the live vehicle feed once. Shared by the poll timer and the manual
  // refresh button. Stamps the "last updated" time on success.
  const fetchBuses = useCallback(() => {
    if (!liveBuses || !liveBuses.active) return Promise.resolve();
    const qs = liveBuses.routeId ? `?route_id=${encodeURIComponent(liveBuses.routeId)}` : '';
    return fetch(`/api/realtime/vehicles${qs}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : { points: [] }))
      .then(data => { setLivePoints(data.points || []); setLastUpdated(new Date()); })
      .catch(() => { /* keep last known positions on a transient failure */ });
  }, [liveBuses]);

  // Live bus feed — poll the realtime endpoint while live mode is active.
  useEffect(() => {
    if (!liveBuses || !liveBuses.active) {
      setLivePoints([]);
      return;
    }
    fetchBuses();
    const id = setInterval(fetchBuses, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [liveBuses, fetchBuses]);

  // Stamp "last updated" when static (non-live) map points change.
  useEffect(() => {
    const isLive = liveBuses && liveBuses.active;
    if (!isLive && Array.isArray(highlightData) && highlightData.length > 0) {
      setLastUpdated(new Date());
    }
  }, [highlightData, liveBuses]);

  // Manual refresh: re-poll the live feed, or just re-stamp the time for static maps.
  const handleRefresh = useCallback(() => {
    if (liveBuses && liveBuses.active) fetchBuses();
    else setLastUpdated(new Date());
  }, [liveBuses, fetchBuses]);

  // Render markers — bus icons for vehicle/live points, circles for everything else.
  useEffect(() => {
    if (!mapInstance.current) return;

    circleLayers.current.clearLayers();

    const usingLive = Boolean(liveBuses && liveBuses.active);
    // In district mode (and not live), the choropleth handles highlightData.
    if (!usingLive && viewMode !== 'circle') return;

    const points = usingLive
      ? livePoints
      : (Array.isArray(highlightData) ? highlightData : []);

    points.forEach(d => {
      if (d.Latitude == null || d.Longitude == null) return;
      const lat = parseFloat(d.Latitude);
      const lon = parseFloat(d.Longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return;

      if (usingLive || d.kind === 'bus') {
        const marker = L.marker([lat, lon], { icon: busIcon });
        marker.bindPopup(`
          <div class="my-custom-popup">
            <div><strong>${escapeHtml(d.name || 'Bus')}</strong></div>
            ${d.route_id ? `<div>Route ${escapeHtml(d.route_id)}</div>` : ''}
          </div>
        `);
        circleLayers.current.addLayer(marker);
      } else {
        const color = d.color || '#FF0000';
        const radius = d.marker_radius || 12;
        const label = d.count || d.Count || d.complaint_count || d.value || 1;

        const circle = L.circle([lat, lon], {
          radius: radius * 10,
          color,
          fillColor: color,
          fillOpacity: 0.7
        });

        circle.bindPopup(`
          <div class="my-custom-popup">
            <div><strong>${escapeHtml(d.MSAG_Name || d.name || d.Sensitive || 'Highlighted Location')}</strong></div>
            <div>Count: <strong>${escapeHtml(label)}</strong></div>
          </div>
        `);

        circleLayers.current.addLayer(circle);
      }
    });
  }, [highlightData, viewMode, liveBuses, livePoints]);

  const hasContent =
    (liveBuses && liveBuses.active) ||
    (Array.isArray(highlightData) && highlightData.length > 0);

  const selectedStat = (heatStat && censusData)
    ? censusData.stats.find((s) => s.id === heatStat)
    : null;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={mapRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}></div>

      {/* Census heat-map control: statistic selector + legend */}
      {setHeatStat && (
        <div className="map-heatmap-control" style={{
          position: "absolute", top: 10, left: 10, zIndex: 500, maxWidth: 220,
          background: "rgba(255,255,255,0.96)", borderRadius: 8, padding: "8px 10px",
          boxShadow: "0 2px 8px rgba(16,24,40,0.18)", fontSize: 12, color: "#3F3F46",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Census Heat Map</div>
          <select
            value={heatStat || ''}
            onChange={(e) => setHeatStat(e.target.value)}
            aria-label="Census statistic"
            style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, background: "#fff", cursor: "pointer" }}
          >
            <option value="">None</option>
            {STAT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>

          {heatStat && censusError && (
            <div style={{ marginTop: 6, color: "#b00020" }}>{censusError}</div>
          )}
          {heatStat && !censusError && !censusData && (
            <div style={{ marginTop: 6, color: "#666" }}>Loading census data…</div>
          )}

          {selectedStat && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 10, borderRadius: 4, background: `linear-gradient(to right, ${HEAT_STOPS.join(',')})` }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11, color: "#666" }}>
                <span>{fmtStat(selectedStat.min, selectedStat.format)}</span>
                <span>{fmtStat(selectedStat.max, selectedStat.format)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>ACS {censusData.year} 5-yr · by tract</div>
            </div>
          )}
        </div>
      )}
      {hasContent && (
        <div className="map-refresh-bar" style={{
          position: "absolute", top: 10, right: 10, zIndex: 500,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.95)", borderRadius: 8,
          padding: "5px 8px 5px 10px", boxShadow: "0 2px 8px rgba(16,24,40,0.18)",
          fontSize: 12, color: "#3F3F46", fontWeight: 560,
        }}>
          <span>
            Updated{' '}
            {lastUpdated
              ? `${lastUpdated.toLocaleDateString()} ${lastUpdated.toLocaleTimeString()}`
              : '—'}
            {liveBuses && liveBuses.active ? ' · live' : ''}
          </span>
          <button
            onClick={handleRefresh}
            title="Refresh"
            aria-label="Refresh map data"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "#CB2128", color: "#fff", borderRadius: 6,
              width: 26, height: 24, cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
          >
            ↻
          </button>
        </div>
      )}
    </div>
  );
}
