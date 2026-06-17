/**
 * VIA Metropolitan Transit — Plugin Manifest
 *
 * Defines the full Buffi plugin configuration for VIA, San Antonio's primary
 * public transit agency. Includes identity, data sources, Buffi AI tools,
 * agency context, and all three suggestion sets (chat / map tile / chart tile).
 */

const ViaPlugin = {
  // ── Identity ─────────────────────────────────────────────────────────────
  id:          'via',
  name:        'VIA Metropolitan Transit',
  shortName:   'VIA',
  description: 'San Antonio\'s primary public transit agency — 90+ routes, 40M+ annual riders.',
  color:       '#CB2128',
  textColor:   '#ffffff',
  icon:        '🚌',
  order:       1,

  // ── Additional workspace views beyond the globals ─────────────────────────
  // Globals always present: map, chart, dashboard, sources, chat
  customViews: [],

  // ── Pre-wired data sources ────────────────────────────────────────────────
  dataSources: [
    {
      id:          'via-gtfs-static',
      name:        'VIA GTFS Static Schedules',
      description: 'Fixed-route bus schedules: stops, routes, trips, stop_times, shapes, and calendar.',
      type:        'gtfs_static',
      category:    'Transit',
      refresh:     'weekly',
      autoLoaded:  true,
      tables:      ['stops', 'routes', 'trips', 'stop_times', 'calendar', 'shapes'],
    },
    {
      id:          'via-gtfs-rt',
      name:        'VIA Live Vehicle Feed',
      description: 'Real-time GTFS-RT: live bus positions, service alerts, and per-trip delays.',
      type:        'gtfs_rt',
      category:    'Realtime',
      refresh:     'realtime',
      autoLoaded:  true,
    },
    {
      id:          'via-census',
      name:        'Census ACS — San Antonio ZIPs',
      description: 'US Census ACS demographics for San Antonio ZIP codes: income, poverty, population, home values.',
      type:        'census_acs',
      category:    'Demographics',
      refresh:     'annual',
      autoLoaded:  true,
    },
  ],

  // ── Buffi AI configuration ────────────────────────────────────────────────
  buffi: {
    // Backend tools enabled for this plugin
    tools: [
      'run_query',
      'list_data_sources',
      'make_chart',
      'plot_on_map',
      'show_live_buses',
      'show_heatmap',
      'get_service_alerts',
      'get_trip_updates',
      'predict_route_ridership',
    ],

    // Agency context injected into the system prompt on every request
    context:
      'AGENCY: VIA Metropolitan Transit — San Antonio, Texas.\n' +
      'VIA operates 90+ fixed-route bus lines serving Bexar County with 40M+ annual boardings.\n' +
      'Key GTFS tables: public.stops, public.routes, public.trips, public.stop_times, public.shapes.\n' +
      'Real-time data available via show_live_buses (vehicle positions), get_service_alerts, get_trip_updates.\n' +
      'Census ACS heatmap covers San Antonio ZIP codes via show_heatmap.',

    // Chat landing page suggestions
    suggestions: [
      { text: 'What are the 10 busiest bus stops by trip count?', icon: 'data' },
      { text: 'Show all stops within 1 mile of downtown San Antonio', icon: 'map' },
      { text: 'Chart the routes with the most trips scheduled today', icon: 'chart' },
      { text: 'What service alerts are active right now?', icon: 'data' },
    ],

    // Map tile bubble suggestions
    mapSuggestions: [
      { text: 'Filter stops within 2 miles of downtown SA' },
      { text: 'Show all live bus locations' },
      { text: 'Overlay median income heatmap by ZIP' },
      { text: 'Map all stops for route 100' },
    ],

    // Chart tile bubble suggestions
    chartSuggestions: [
      { text: 'Change to a pie chart' },
      { text: 'Show only the top 10 results' },
      { text: 'Chart ridership by route for all routes' },
      { text: 'Compare on-time performance across routes' },
    ],
  },
};

export default ViaPlugin;
