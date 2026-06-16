import React from 'react';
import AdminPanel from '../components/AdminPanel';
import '../styles/AdminPage.css';

export default function AdminPage() {
    return (
        <div className="admin-page">
            <div className="admin-header">
                <h1>Administration</h1>
                <p>Manage users and their roles</p>
            </div>
            <AdminPanel />
        </div>
    );
}
