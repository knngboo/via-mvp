import './ViaDashboard.css';

// Via dashboard — all of Via's visualization UI lives in this folder.
//
// Props (the plugin contract):
//   data  — output of Via's ParseLogic parse(files); null until that's built.
//   files — the raw uploaded CSV files, if the dashboard needs them directly.
//
// PLACEHOLDER — no visualization yet, just shows a placeholder.
export default function ViaDashboard({ data = null, files = [] }) {
  return (
    <div className="via-dashboard">
      <div className="via-dashboard-placeholder">Placeholder</div>
    </div>
  );
}
