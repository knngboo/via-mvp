// src/context/CsvContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

const CsvContext = createContext();

// ── Sample data for each seed file so clicking shows real contents ──

const ZONING_ROWS = Array.from({ length: 14 }, (_, i) => ({
  request_id: `311-${String(i + 1).padStart(4, '0')}`,
  date_filled: '2025-07-02',
  zip_code: ['78221', '78207', '78211', '78228'][i % 4],
  geo_ref: i === 0 || i === 1 ? 'RES_UNKNWN' : `GR-${8800 + i}-TX`,
  category: 'Land Use & Zoning',
  src_depart: 'Public Works',
  hasError: i === 0 || i === 1,
}));

const HOUSING_SHORTFALL_ROWS = [
  { district: 'D1', total_units_needed: 4200, units_built: 1800, gap: 2400, year: 2025, geo_ref: 'RES_UNKNWN', hasError: true },
  { district: 'D2', total_units_needed: 3600, units_built: 2100, gap: 1500, year: 2025, geo_ref: 'GR-8810-TX' },
  { district: 'D3', total_units_needed: 5100, units_built: 1400, gap: 3700, year: 2025, geo_ref: 'RES_UNKNWN', hasError: true },
  { district: 'D4', total_units_needed: 2800, units_built: 2200, gap: 600,  year: 2025, geo_ref: 'GR-8811-TX' },
  { district: 'D5', total_units_needed: 4500, units_built: 1900, gap: 2600, year: 2025, geo_ref: 'GR-8812-TX' },
  { district: 'D6', total_units_needed: 3900, units_built: 2400, gap: 1500, year: 2025, geo_ref: 'GR-8813-TX' },
  { district: 'D7', total_units_needed: 3300, units_built: 2700, gap: 600,  year: 2025, geo_ref: 'GR-8814-TX' },
  { district: 'D8', total_units_needed: 4700, units_built: 1600, gap: 3100, year: 2025, geo_ref: 'GR-8815-TX' },
];

const HOUSING_GAP_ROWS = [
  { district: 'D1', supply: 1800, demand: 4200, gap_pct: 57.1, tier: 'High',   updated: '2025-06-01' },
  { district: 'D2', supply: 2100, demand: 3600, gap_pct: 41.7, tier: 'Medium', updated: '2025-06-01' },
  { district: 'D3', supply: 1400, demand: 5100, gap_pct: 72.5, tier: 'High',   updated: '2025-06-01' },
  { district: 'D4', supply: 2200, demand: 2800, gap_pct: 21.4, tier: 'Low',    updated: '2025-06-01' },
  { district: 'D5', supply: 1900, demand: 4500, gap_pct: 57.8, tier: 'High',   updated: '2025-06-01' },
  { district: 'D6', supply: 2400, demand: 3900, gap_pct: 38.5, tier: 'Medium', updated: '2025-06-01' },
  { district: 'D7', supply: 2700, demand: 3300, gap_pct: 18.2, tier: 'Low',    updated: '2025-06-01' },
  { district: 'D8', supply: 1600, demand: 4700, gap_pct: 66.0, tier: 'High',   updated: '2025-06-01' },
];

const PERMIT_ACTIVITY_ROWS = [
  { month: '2025-01', permits_issued: 142, demand_index: 0.78, district: 'D1' },
  { month: '2025-01', permits_issued: 98,  demand_index: 0.65, district: 'D2' },
  { month: '2025-02', permits_issued: 167, demand_index: 0.81, district: 'D1' },
  { month: '2025-02', permits_issued: 110, demand_index: 0.70, district: 'D2' },
  { month: '2025-03', permits_issued: 189, demand_index: 0.84, district: 'D1' },
  { month: '2025-03', permits_issued: 124, demand_index: 0.72, district: 'D2' },
  { month: '2025-04', permits_issued: 156, demand_index: 0.79, district: 'D1' },
  { month: '2025-04', permits_issued: 102, demand_index: 0.68, district: 'D2' },
  { month: '2025-05', permits_issued: 174, demand_index: 0.82, district: 'D1' },
  { month: '2025-05', permits_issued: 118, demand_index: 0.71, district: 'D2' },
];

const LANDUSE_ZONING_ROWS = [
  { parcel_id: 'P-10001', current_zone: 'R-4', proposed_zone: 'R-6', area_acres: 0.32, owner: 'City of SA' },
  { parcel_id: 'P-10002', current_zone: 'R-4', proposed_zone: 'MU-2', area_acres: 0.48, owner: 'Private LLC' },
  { parcel_id: 'P-10003', current_zone: 'C-2', proposed_zone: 'C-3', area_acres: 1.10, owner: 'City of SA' },
  { parcel_id: 'P-10004', current_zone: 'R-6', proposed_zone: 'R-6', area_acres: 0.27, owner: 'Private LLC' },
  { parcel_id: 'P-10005', current_zone: 'MU-1', proposed_zone: 'MU-2', area_acres: 0.55, owner: 'County' },
  { parcel_id: 'P-10006', current_zone: 'R-4', proposed_zone: 'R-6', area_acres: 0.30, owner: 'Private LLC' },
  { parcel_id: 'P-10007', current_zone: 'I-1', proposed_zone: 'I-2', area_acres: 2.40, owner: 'Industrial Co.' },
  { parcel_id: 'P-10008', current_zone: 'R-6', proposed_zone: 'R-8', area_acres: 0.42, owner: 'Private LLC' },
];

const INITIAL_BATCH_FILES = [
  { id: 1, name: 'zoning_classification_map.csv',     folder: 'Housing',        status: 'Error',  tier: 'Tier 1: Public',               size: '1.2 MB', confidence: 'Low',  issue: 'Row values unclear — the field "geo_ref" could not be interpreted. Please clarify what this column represents.', csvData: ZONING_ROWS },
  { id: 2, name: 'housing_shortfall_by_district.csv', folder: 'Housing',        status: 'Error',  tier: 'Tier 1: Public',               size: '1.2 MB', confidence: 'Low',  issue: 'The field "geo_ref" could not be interpreted. Please clarify what this column represents.',                      csvData: HOUSING_SHORTFALL_ROWS },
  { id: 3, name: 'sa_housing_gap_analysis.csv',       folder: 'Housing',        status: 'Ready',  tier: 'Tier 2: Internal Operational', size: '1.2 MB', confidence: 'High', issue: '',                                                                                                              csvData: HOUSING_GAP_ROWS },
  { id: 4, name: 'permit_activity_vs_demand.csv',     folder: 'Safety',         status: 'Ready',  tier: 'Tier 3: Restricted',           size: '1.2 MB', confidence: 'High', issue: '',                                                                                                              csvData: PERMIT_ACTIVITY_ROWS },
  { id: 5, name: 'sa_landuse_zoning2026.csv',         folder: 'Infrastructure', status: 'Ready',  tier: 'Tier 3: Restricted',           size: '1.2 MB', confidence: 'High', issue: '',                                                                                                              csvData: LANDUSE_ZONING_ROWS },
];

export const INITIAL_BATCHES = [
  { id: 1, label: 'April 2nd 2025 3:51 PM Queue', files: INITIAL_BATCH_FILES },
];

const STORAGE_KEY = 'buffi_csv_batches';

const loadBatches = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_BATCHES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return INITIAL_BATCHES;
  } catch {
    return INITIAL_BATCHES;
  }
};

export function CsvProvider({ children }) {
  const [csvData, setCsvData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [csvStats, setCsvStats] = useState(null);
  const [csvAnalysis, setCsvAnalysis] = useState(null);
  const [columnDescriptions, setColumnDescriptions] = useState({});
  const [batches, setBatches] = useState(loadBatches);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
    } catch {
      // Likely QuotaExceededError — silently ignore so the UI still works.
    }
  }, [batches]);

  return (
    <CsvContext.Provider value={{
      csvData,
      setCsvData,
      fileName,
      setFileName,
      csvStats,
      setCsvStats,
      csvAnalysis,
      setCsvAnalysis,
      columnDescriptions,
      setColumnDescriptions,
      batches,
      setBatches,
    }}>
      {children}
    </CsvContext.Provider>
  );
}

// Convenience: flat list of every uploaded file across all batches.
export function getAllUploadedFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const batches = raw ? JSON.parse(raw) : INITIAL_BATCHES;
    if (!Array.isArray(batches)) return [];
    return batches.flatMap((b) => (Array.isArray(b.files) ? b.files : []));
  } catch {
    return [];
  }
}

// Custom hook for convenience
export function useCsv() {
  return useContext(CsvContext);
}
