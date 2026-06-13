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

const ProtectedRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    return context.token ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    if (!context.token) return <Navigate to="/login" />;
    if (context.user?.role !== 'admin') return <Navigate to="/chat" />;
    return children;
};

const App = () => {
    return (
        <CsvProvider>
            <Router>
                <Routes>
                    <Route path="/login"     element={<Login />} />
                    <Route path="/register"  element={<Register />} />
                    <Route path="/chat"      element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><PluginDashboardPage /></ProtectedRoute>} />
                    {/* All data hub paths unified at /sources */}
                    <Route path="/sources"   element={<AdminRoute><UploadPage /></AdminRoute>} />
                    <Route path="/queue"     element={<Navigate to="/sources" replace />} />
                    <Route path="/upload"    element={<Navigate to="/sources" replace />} />
                    <Route path="/"          element={<Navigate to="/chat" />} />
                </Routes>
            </Router>
        </CsvProvider>
    );
};

export default App;
