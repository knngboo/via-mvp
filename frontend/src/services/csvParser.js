import Papa from 'papaparse';

// Parse a File object into { filename, data, columns, stats, sample }.
// Mirrors the shape the old backend `/api/upload` returned so callers don't
// have to change much.
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        if (results.errors && results.errors.length) {
          const fatal = results.errors.find((e) => e.type !== 'FieldMismatch');
          if (fatal) {
            reject(new Error(fatal.message || 'Failed to parse CSV'));
            return;
          }
        }
        const data = (results.data || []).filter(
          (row) => row && Object.keys(row).length > 0,
        );
        const columns = results.meta?.fields || (data[0] ? Object.keys(data[0]) : []);
        const stats = {
          filename: file.name,
          num_rows: data.length,
          num_columns: columns.length,
          columns,
          sample: data.slice(0, 5),
        };
        resolve({
          filename: file.name,
          data,
          columns,
          stats,
          sample: data.slice(0, 5),
        });
      },
      error: (err) => reject(err),
    });
  });
}
