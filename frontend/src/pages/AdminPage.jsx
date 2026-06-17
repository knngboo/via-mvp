import React from 'react';
import GlobalNav from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import '../App.css';
import '../styles/AdminPage.css';

export default function AdminPage() {
    return (
        <div className="ws-page">
            <GlobalNav />
            <div className="admin-page" style={{ flex: 1, overflow: 'auto' }}>
                <div className="admin-header">
                    <h1>Administration</h1>
                    <p>Manage users and their roles</p>
                </div>
                <AdminPanel />
            </div>
        </div>
    );
}
