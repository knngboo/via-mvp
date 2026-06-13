import ViaDashboard from './Dashboard/ViaDashboard';

const ViaPlugin = {
    id: 'via',
    name: 'Via Transit',
    description: 'VIA MVP Transit Map and Overview.',
    Dashboard: ViaDashboard,
    parse: (files) => files, // We will use this later when we upload CSVs!
};

export default ViaPlugin;
