// Via plugin — ParseLogic
//
// parse(files) is called by PluginDashboardPage with the raw uploaded CSV data.
// It returns a structured object the ViaDashboard component can consume.
//
// For the VIA plugin, the dashboard reads live data directly from the PostgreSQL
// API (/api/stats, /api/stats/trips-per-route, /api/stats/departures-by-hour).
// ParseLogic is therefore lightweight: it just normalises the uploaded file list
// so the dashboard has a clean inventory of what the user has uploaded.
//
// When a second plugin (e.g. CapMetro) is added, its ParseLogic can do heavier
// work — e.g. validating that the uploaded CSV matches an expected schema,
// extracting specific columns, or pre-computing summary statistics.

/**
 * @param {Array<{ name: string, data: any[] }>} files — uploaded CSV files from CsvContext
 * @returns {{ sources: Array<{ name: string, rowCount: number, columns: string[] }> }}
 */
export function parse(files) {
    const sources = (files || []).map((f) => {
        const rows = Array.isArray(f.data) ? f.data : [];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
            name: f.name || 'Unnamed',
            rowCount: rows.length,
            columns,
        };
    });

    return { sources };
}
