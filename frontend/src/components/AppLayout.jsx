import GlobalNav from './GlobalNav';

export default function AppLayout({ children }) {
  return (
    <div className="ws-page">
      <GlobalNav />
      <main className="app-main" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}
