import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import { getActivePlugin } from 'Plugins';
import { useCsv } from '../context/CsvContext';
import { useAuth } from '../context/AuthContext';
import bfiIcon from '../assets/images/BFI_LogoIcon.svg';
import viaLogo from '../assets/images/Via.png';
import afLogo from '../assets/images/OIP.webp';
import apiService from '../services/api';
import '../App.css';

const TENANT_LOGOS = {
    via: { src: viaLogo, alt: 'VIA Metropolitan Transit' },
    areafoundation: { src: afLogo, alt: 'San Antonio Area Foundation' },
};

export default function PluginDashboardPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const tenantLogo = TENANT_LOGOS[user?.tenant];
    const [plugin, setPlugin] = useState(getActivePlugin);
    const [stats, setStats] = useState(null);

    // We use our MVP's useCsv context to safely pass uploaded data to the plugin!
    const { csvData, fileName } = useCsv();
    const files = useMemo(() => {
        return csvData ? [{ name: fileName, data: csvData }] : [];
    }, [csvData, fileName]);

    useEffect(() => {
        const refresh = () => setPlugin(getActivePlugin());
        window.addEventListener('buffi:plugin-change', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            window.removeEventListener('buffi:plugin-change', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, []);

    useEffect(() => {
        apiService.getStats()
            .then(data => setStats(data))
            .catch(err => console.error("Failed to load stats:", err));
    }, []);

    // If there's no active plugin, redirect to the Data Hub (Sources page)
    useEffect(() => {
        if (!plugin) navigate('/sources', { replace: true });
    }, [plugin, navigate]);

    // Pass the CSV files through the plugin's custom ParseLogic
    const data = useMemo(() => {
        try {
            return typeof plugin?.parse === 'function' ? plugin.parse(files) : null;
        } catch (err) {
            console.error(`[plugin:${plugin?.id}] parse failed:`, err);
            return null;
        }
    }, [plugin, files]);

    if (!plugin) return null;

    const Dashboard = plugin.Dashboard;

    return (
        <div className="app-wrapper">
            {/* We will build AppSidebar in the very next step! */}
            <AppSidebar />
            <div className="col-chat">
                <div className="col-header col-header--chat" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {tenantLogo ? (
                            <span className="top-bar-tenant-logo-wrap">
                                <img src={tenantLogo.src} alt={tenantLogo.alt} className="top-bar-tenant-logo" />
                                <span className="top-bar-powered-by">Powered by BFI</span>
                            </span>
                        ) : (
                            <img src={bfiIcon} alt="Buffi" className="chat-header-logo" />
                        )}
                        <span className="top-bar-brand">{plugin.name} Dashboard</span>
                    </div>
                    {stats && (
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--Grey-600)', fontWeight: 570 }}>
                            <span title="Uploaded Datasets" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '16px' }}>📂</span> {stats.sources || 0} Datasets
                            </span>
                            <span title="Transit Routes" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '16px' }}>🚌</span> {stats.routes || 0} Routes
                            </span>
                            <span title="Transit Stops" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '16px' }}>🚏</span> {stats.stops || 0} Stops
                            </span>
                            <span title="Scheduled Trips" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '16px' }}>⏱️</span> {(stats.trips || 0).toLocaleString()} Trips
                            </span>
                        </div>
                    )}
                </div>
                <div className="plugin-dashboard-panel" style={{ flex: 1, overflow: 'hidden' }}>
                    <Dashboard data={data} files={files} />
                </div>
            </div>
        </div>
    );
}
