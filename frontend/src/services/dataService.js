// Safe data fetching that won't crash if the mock files are missing
import axios from 'axios';

export async function fetchGeoData() {
  try {
    const res = await axios.get('/geo.json');
    return res.data;
  } catch (error) {
    return { type: 'FeatureCollection', features: [] }; // Fallback Map
  }
}

export async function fetchIndicators() {
  try {
    const res = await axios.get('/indicators.json');
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    return []; // Fallback Data Array
  }
}

export async function fetchProfile(areaId) {
  try {
    const res = await axios.get(`/profiles/${areaId}.json`);
    return res.data;
  } catch (error) {
    return {};
  }
}
