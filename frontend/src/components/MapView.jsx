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

export default function ZipMap({ highlightData = EMPTY_ARRAY, viewMode = 'district', liveBuses = null }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const geoJsonLayer = useRef(null);
  const circleLayers = useRef(L.layerGroup());

  const [zipData, setZipData] = useState(null);
  const [zipCounts, setZipCounts] = useState({});
  const [livePoints, setLivePoints] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    
    mapInstance.current = L.map(mapRef.current, {
      center: mapCenter,
      zoom: 9,
      scrollWheelZoom: false
    });

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

  // Render GeoJSON
  useEffect(() => {
    if (!mapInstance.current || !zipData) return;

    if (geoJsonLayer.current) {
      geoJsonLayer.current.remove();
      geoJsonLayer.current = null;
    }

    if (viewMode === 'district') {
      const highlightedZips = new Set(Object.keys(zipCounts));

      const style = (feature) => {
        const zip = feature.properties.ZCTA5CE10 || feature.properties.ZIP || feature.properties.zip;
        if (highlightedZips.has(String(zip))) {
          return { color: "#FF4500", weight: 3, fillOpacity: 0.7 };
        }
        return { color: "#1E90FF", weight: 1.5, fillOpacity: 0.3 };
      };

      const onEachFeature = (feature, layer) => {
        const zip = feature.properties.ZCTA5CE10 || feature.properties.ZIP || feature.properties.zip;
      
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
          mouseover: (e) => {
            e.target.setStyle({ weight: 3, color: "#FFD700", fillOpacity: 0.6 });
          },
          mouseout: (e) => {
            geoJsonLayer.current.resetStyle(e.target);
          },
        });
      };

      geoJsonLayer.current = L.geoJSON(zipData, { style, onEachFeature }).addTo(mapInstance.current);
    }
  }, [zipData, zipCounts, viewMode, highlightData]);

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

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={mapRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}></div>
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
