// MapView.jsx
import React, { useEffect, useState, useRef } from "react";
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

export default function ZipMap({ highlightData = EMPTY_ARRAY, viewMode = 'district' }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const geoJsonLayer = useRef(null);
  const circleLayers = useRef(L.layerGroup());
  
  const [zipData, setZipData] = useState(null);
  const [zipCounts, setZipCounts] = useState({});

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

  // Render Circles
  useEffect(() => {
    if (!mapInstance.current) return;
    
    circleLayers.current.clearLayers();

    if (viewMode === 'circle' && highlightData && Array.isArray(highlightData)) {
      highlightData.forEach(d => {
        if (d.Latitude && d.Longitude) {
          const color = d.color || '#FF0000';
          const radius = d.marker_radius || 12;
          const label = d.count || d.Count || d.complaint_count || d.value || 1;
          
          const circle = L.circle([parseFloat(d.Latitude), parseFloat(d.Longitude)], {
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
    }
  }, [highlightData, viewMode]);

  return <div ref={mapRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}></div>;
}
