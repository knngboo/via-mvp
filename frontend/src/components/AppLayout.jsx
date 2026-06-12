import Sidebar from './Sidebar';
import '../styles/AppLayout.css';

export default function AppLayout({ children }) {
  return (
    <div className="app-wrapper">
      <Sidebar />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
