import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import { CsvProvider } from './context/CsvContext';
import './App.css';
import PluginDashboardPage from './components/PluginDashboardPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ChatPage from './pages/ChatPage';
import UploadPage from './pages/hub/UploadPage';
import AdminPage from './pages/AdminPage';

// Any logged-in user
const ProtectedRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    return context.user ? children : <Navigate to="/login" />;
};

// Admin only → non-admins redirected to /chat
const AdminRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (context.user?.role !== 'admin') return <Navigate to="/chat" />;
    return children;
};

// Admin or editor → others redirected to /chat
const EditorRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (!['admin', 'editor'].includes(context.user?.role)) return <Navigate to="/chat" />;
    return children;
};

// Admin, editor, or analyzer → viewers redirected to /dashboard (not /chat — avoids infinite loop)
const AnalyzerRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.user) return <Navigate to="/login" />;
    if (!['admin', 'analyzer', 'editor'].includes(context.user?.role)) return <Navigate to="/dashboard" replace />;
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
            <Router>
                <Routes>
                    <Route path="/login"     element={<Login />} />
                    <Route path="/register"  element={<Register />} />
                    <Route path="/chat"      element={<AnalyzerRoute><ChatPage /></AnalyzerRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><PluginDashboardPage /></ProtectedRoute>} />
                    {/* Upload restricted to editors and admins */}
                    <Route path="/sources"   element={<EditorRoute><UploadPage /></EditorRoute>} />
                    {/* Admin panel for managing users */}
                    <Route path="/admin"     element={<AdminRoute><AdminPage /></AdminRoute>} />
                    <Route path="/queue"     element={<Navigate to="/sources" replace />} />
                    <Route path="/upload"    element={<Navigate to="/sources" replace />} />
                    <Route path="/"          element={<Navigate to="/chat" />} />
                </Routes>
            </Router>
        </CsvProvider>
    );
};

export { ProtectedRoute, AdminRoute, EditorRoute, AnalyzerRoute, ViewerRoute };
export default App;
