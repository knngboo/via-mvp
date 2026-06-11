import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import { getActivePlugin } from 'Plugins';
import { getAllUploadedFiles } from '../context/CsvContext';
import bfiIcon from '../assets/images/BFI_LogoIcon.svg';
import '../App.css';
import '../styles/PluginDashboard.css';

// Host page for the active plugin's dashboard. It owns the page chrome (sidebar
// + header) and a "visualization layer" container, then renders whichever
// plugin is active, passing in the uploaded CSV files.
export default function PluginDashboardPage() {
  const navigate = useNavigate();
  const [plugin, setPlugin] = useState(getActivePlugin);
  const [files, setFiles] = useState(getAllUploadedFiles);

  useEffect(() => {
    const refresh = () => {
      setPlugin(getActivePlugin());
      setFiles(getAllUploadedFiles());
    };
    window.addEventListener('buffi:plugin-change', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('buffi:plugin-change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // No plugin active → there's nothing to show. Send the user back. (The sidebar
  // only surfaces this route when a plugin is active, but guard direct nav too.)
  useEffect(() => {
    if (!plugin) navigate('/upload', { replace: true });
  }, [plugin, navigate]);

  // Run the plugin's own parse logic over the uploaded files. The plugin owns
  // this transform (in its ParseLogic/ folder); the host just calls it and hands
  // the result to the dashboard. A plugin with no parse logic yields `null`.
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
      <AppSidebar />
      <div className="col-chat">
        <div className="col-header col-header--chat">
          <img src={bfiIcon} alt="Buffi" className="chat-header-logo" />
          <span className="top-bar-brand">{plugin.name} Dashboard</span>
        </div>
        <div className="plugin-dashboard-panel">
          {/* Visualization layer — the plugin's dashboard renders the parsed
              data (and the raw files, if it needs them). */}
          <div className="plugin-viz-layer">
            <Dashboard data={data} files={files} />
          </div>
        </div>
      </div>
    </div>
  );
}
