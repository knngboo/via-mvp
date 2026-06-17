/**
 * City of San Antonio — Plugin Manifest
 *
 * Defines the Buffi plugin configuration for the City of San Antonio (COSA).
 * Shows the platform's versatility beyond transit — city government analytics,
 * equity analysis, service delivery, and urban planning.
 *
 * Data pulled from the San Antonio Open Data Portal (data.sanantonio.gov).
 */

const CosaPlugin = {
  // ── Identity ─────────────────────────────────────────────────────────────
  id:          'cosa',
  name:        'City of San Antonio',
  shortName:   'COSA',
  description: 'San Antonio city government — open data for 311 requests, permits, budget, parks, and public safety.',
  color:       '#00549F',
  textColor:   '#ffffff',
  icon:        '🏛️',
  order:       2,
  status:      'preview',   // shows "Preview" badge in the agency switcher

  // ── Additional workspace views beyond the globals ─────────────────────────
  customViews: [],

  // ── Pre-wired data sources ────────────────────────────────────────────────
  dataSources: [
    {
      id:          'cosa-311',
      name:        'SA 311 Service Requests',
      description: 'All resident service requests submitted to 311 — potholes, code violations, tree trimming, graffiti, and more.',
      type:        'open_data',
      category:    'City Services',
      url:         'https://data.sanantonio.gov/dataset/service-calls',
      refresh:     'daily',
      autoLoaded:  false,
      tables:      ['service_requests'],
    },
    {
      id:          'cosa-budget',
      name:        'City of SA — Annual Budget',
      description: 'Adopted city budget by department, fund, and program. Covers General Fund, enterprise funds, and capital projects.',
      type:        'open_data',
      category:    'Finance',
      url:         'https://data.sanantonio.gov/dataset/city-budget',
      refresh:     'annual',
      autoLoaded:  false,
      tables:      ['budget'],
    },
    {
      id:          'cosa-permits',
      name:        'Building Permits',
      description: 'Commercial and residential building permits issued by the Development Services Department.',
      type:        'open_data',
      category:    'Development',
      url:         'https://data.sanantonio.gov/dataset/building-permits',
      refresh:     'weekly',
      autoLoaded:  false,
      tables:      ['permits'],
    },
    {
      id:          'cosa-crime',
      name:        'SAPD Crime Incidents',
      description: 'San Antonio Police Department crime incident reports by type, district, and date.',
      type:        'open_data',
      category:    'Public Safety',
      url:         'https://data.sanantonio.gov/dataset/sapd-crime-incidents',
      refresh:     'weekly',
      autoLoaded:  false,
      tables:      ['crime_incidents'],
    },
    {
      id:          'cosa-parks',
      name:        'Parks & Recreation Facilities',
      description: 'All city-owned parks, recreation centers, pools, and trails with locations and amenities.',
      type:        'open_data',
      category:    'Parks',
      url:         'https://data.sanantonio.gov/dataset/parks',
      refresh:     'monthly',
      autoLoaded:  false,
      tables:      ['parks'],
    },
    {
      id:          'cosa-census',
      name:        'Census ACS — San Antonio ZIPs',
      description: 'US Census ACS demographics: income, poverty rate, population, and home values by ZIP code.',
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
      'show_heatmap',
    ],

    // Agency context injected into the system prompt on every request
    context:
      'AGENCY: City of San Antonio (COSA), Texas.\n' +
      'COSA serves ~1.4M residents across 10 city council districts.\n' +
      'Available datasets (upload via Sources): 311 service requests, city budget, building permits, ' +
      'SAPD crime incidents, and parks & recreation facilities.\n' +
      'Census ACS heatmap available for San Antonio ZIP codes via show_heatmap.\n' +
      'Focus areas: equitable service delivery, urban planning, public safety, fiscal transparency.',

    // Chat landing page suggestions
    suggestions: [
      { text: 'Which council districts have the most 311 service requests?', icon: 'data' },
      { text: 'Chart city budget spending by department', icon: 'chart' },
      { text: 'Map all parks and recreation centers across San Antonio', icon: 'map' },
      { text: 'Show building permit activity by ZIP code', icon: 'data' },
    ],

    // Map tile bubble suggestions
    mapSuggestions: [
      { text: 'Map all parks in District 4' },
      { text: 'Show 311 hotspots by neighborhood' },
      { text: 'Overlay poverty rate heatmap by ZIP' },
      { text: 'Map recent building permits downtown' },
    ],

    // Chart tile bubble suggestions
    chartSuggestions: [
      { text: 'Change to a bar chart' },
      { text: 'Break down by council district' },
      { text: 'Show year-over-year comparison' },
      { text: 'Chart top 10 most common 311 request types' },
    ],
  },
};

export default CosaPlugin;
