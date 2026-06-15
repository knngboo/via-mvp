import ViaDashboard from './Dashboard/ViaDashboard';
import { parse } from './ParseLogic';

const ViaPlugin = {
    id: 'via',
    name: 'Via Transit',
    description: 'VIA Metropolitan Transit — dashboard backed by live PostgreSQL GTFS data.',
    Dashboard: ViaDashboard,
    parse,
};

export default ViaPlugin;
