/**
 * Default — Plugin Manifest
 *
 * A blank-slate template shown when no agency plugin is active, or for
 * new organizations that haven't configured a plugin yet.
 *
 * All data comes from user uploads. No pre-wired feeds or agency context.
 * Only the core Buffi tools are enabled (no live buses, no heatmaps, etc.)
 */

const DefaultPlugin = {
  // ── Identity ─────────────────────────────────────────────────────────────
  id:          'default',
  name:        'General Workspace',
  shortName:   'General',
  description: 'No agency configured. Upload your own data to get started.',
  color:       '#6B7280',
  textColor:   '#ffffff',
  icon:        '○',
  order:       99,

  // ── No custom views or pre-wired sources ─────────────────────────────────
  customViews: [],
  dataSources: [],

  // ── Buffi AI configuration ────────────────────────────────────────────────
  buffi: {
    // Only core tools — no agency-specific feeds
    tools: [
      'run_query',
      'list_data_sources',
      'make_chart',
      'plot_on_map',
    ],

    // Generic context — no agency specifics
    context:
      'AGENCY: Not configured.\n' +
      'The user is working with their own uploaded data.\n' +
      'Use list_data_sources to see what tables are available before attempting any query.\n' +
      'Be helpful and generic — do not assume any specific domain or geography.',

    // Chat landing page suggestions
    suggestions: [
      { text: 'What data do I have available?',        icon: 'data'  },
      { text: 'Show me the columns in my dataset',     icon: 'data'  },
      { text: 'Chart the top values in my data',       icon: 'chart' },
      { text: 'Plot my data on a map if it has coordinates', icon: 'map' },
    ],

    // Map tile bubble suggestions
    mapSuggestions: [
      { text: 'Plot all rows that have lat/lon columns' },
      { text: 'Filter points to a specific area' },
      { text: 'Show only the top 100 results on the map' },
      { text: 'Color points by a category column' },
    ],

    // Chart tile bubble suggestions
    chartSuggestions: [
      { text: 'Change to a pie chart' },
      { text: 'Show only the top 10 results' },
      { text: 'Sort by value descending' },
      { text: 'Group by category and count' },
    ],
  },
};

export default DefaultPlugin;
