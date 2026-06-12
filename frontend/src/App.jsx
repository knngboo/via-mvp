import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, AuthProvider } from './context/AuthContext';
import { CsvProvider } from './context/CsvContext';

import Login from './pages/Login';
import ChatPage from './pages/ChatPage';
import SourcesPage from './pages/hub/SourcesPage';
import QueuePage from './pages/hub/QueuePage';
import ClarificationPage from './pages/hub/ClarificationPage';
import SuccessPage from './pages/hub/SuccessPage';

const ProtectedRoute = ({ children }) => {
    const context = useContext(AuthContext);
    if (!context) return <Navigate to="/login" />;
    return context.token ? children : <Navigate to="/login" />;
};

const App = () => {
    return (
        <AuthProvider>
            <CsvProvider>
                <Router>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/dashboard" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                        <Route path="/sources" element={<ProtectedRoute><SourcesPage /></ProtectedRoute>} />
                        <Route path="/queue" element={<ProtectedRoute><QueuePage /></ProtectedRoute>} />
                        <Route path="/clarification" element={<ProtectedRoute><ClarificationPage /></ProtectedRoute>} />
                        <Route path="/success" element={<ProtectedRoute><SuccessPage /></ProtectedRoute>} />
                        <Route path="/" element={<Navigate to="/dashboard" />} />
                    </Routes>
                </Router>
            </CsvProvider>
        </AuthProvider>
    );
};

export default App;
