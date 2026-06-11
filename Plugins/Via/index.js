// Via plugin manifest.
//
// A plugin manifest describes the plugin and points at its Dashboard component
// and (eventually) its parse function. The registry in ../index.js imports this.
import ViaDashboard from './Dashboard/ViaDashboard';
import { parse } from './ParseLogic';

const ViaPlugin = {
  id: 'via',
  name: 'Via',
  description: 'Placeholder Via plugin — dashboard only, no parse logic yet.',
  Dashboard: ViaDashboard,
  // parse(files) → visualization-ready data. Null until ParseLogic is built.
  parse,
};

export default ViaPlugin;
