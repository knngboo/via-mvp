import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import { CsvProvider } from './context/CsvContext';
import { PluginProvider } from './context/PluginContext';
import './App.css';
import Login from './pages/Login';
import Register from './pages/Register';
import WorkspacePage from './pages/WorkspacePage';
import UploadPage from './pages/hub/UploadPage';
import AdminPage from './pages/AdminPage';

//Any logged-in user
const ProtectedRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    return context.user ? children : <Navigate to="/login" />;
};

//Admin only - non-admins redirected to /workspace
const AdminRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (context.user?.role !== 'admin') return <Navigate to="/workspace" />;
    return children;
};
// Admin or editor → others redirected to /workspace
const EditorRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (!['admin', 'editor'].includes(context.user?.role)) return <Navigate to="/workspace" />;
    return children;
};

// Admin, editor, or analyzer → viewers redirected to /workspace
const AnalyzerRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (!['admin', 'analyzer', 'editor'].includes(context.user?.role)) return <Navigate to="/workspace" replace />;
    return children;
};

// All authenticated roles
const ViewerRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (!['admin', 'viewer', 'editor', 'analyzer'].includes(context.user?.role)) return <Navigate to="/login" />;
    return children;
};

const App = () => {
    return (
        <CsvProvider>
            <PluginProvider>
                <Router>
                    <Routes>
                        <Route path="/login"     element={<Login />} />
                        <Route path="/register"  element={<Register />} />
                        {/* Workspace is the primary interface */}
                        <Route path="/workspace" element={<AnalyzerRoute><WorkspacePage /></AnalyzerRoute>} />
                        {/* Legacy routes redirect into workspace */}
                        <Route path="/chat"      element={<Navigate to="/workspace" replace />} />
                        <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
                        {/* Upload restricted to editors and admins */}
                        <Route path="/sources"   element={<EditorRoute><UploadPage /></EditorRoute>} />
                        {/* Admin panel for managing users */}
                        <Route path="/admin"     element={<AdminRoute><AdminPage /></AdminRoute>} />
                        <Route path="/queue"     element={<Navigate to="/sources" replace />} />
                        <Route path="/upload"    element={<Navigate to="/sources" replace />} />
                        {/* Root → workspace */}
                        <Route path="/"          element={<Navigate to="/workspace" />} />
                    </Routes>
                </Router>
            </PluginProvider>
        </CsvProvider>
    );
};
export { ProtectedRoute, AdminRoute, EditorRoute, AnalyzerRoute, ViewerRoute };
export default App;
