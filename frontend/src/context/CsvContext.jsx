// src/context/CsvContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

const CsvContext = createContext();

const STORAGE_KEY = 'buffi_csv_batches';

// Label of the demo batch that used to ship with the app — stripped out of
// any localStorage that still has it.
const LEGACY_SEED_LABEL = 'April 2nd 2025 3:51 PM Queue';

const loadBatches = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b) => b && b.label !== LEGACY_SEED_LABEL);
  } catch {
    return [];
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
    const batches = raw ? JSON.parse(raw) : [];
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
