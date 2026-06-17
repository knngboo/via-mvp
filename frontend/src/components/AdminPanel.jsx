import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AdminPanel.css';

const ROLE_DESCRIPTIONS = {
    admin: 'Full access to all features and user management',
    editor: 'Can upload and manage their own data sources',
    analyzer: 'Can run queries and analyze data',
    viewer: 'Read-only access to shared data',
};

const TENANT_LABELS = {
    bfi: 'BFI',
    via: 'VIA',
    areafoundation: 'Area Foundation',
};

const ALL_TENANT_OPTIONS = [
    { value: 'bfi',            label: 'BFI' },
    { value: 'via',            label: 'VIA' },
    { value: 'areafoundation', label: 'Area Foundation' },
];

export default function AdminPanel() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatingUserId, setUpdatingUserId] = useState(null);
    const [updatingTenantUserId, setUpdatingTenantUserId] = useState(null);
    const [deletingUserId, setDeletingUserId] = useState(null);

    // BFI admins can assign any tenant; others can only assign their own.
    const allowedTenants = currentUser?.tenant === 'bfi'
        ? ALL_TENANT_OPTIONS
        : ALL_TENANT_OPTIONS.filter(t => t.value === currentUser?.tenant);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/users', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch users');
            setUsers(await res.json());
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateUserRole = async (userId, newRole) => {
        try {
            setUpdatingUserId(userId);
            const res = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
                credentials: 'include',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to update role');
            }
            const updated = await res.json();
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_role: updated.user_role } : u));
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const updateUserTenant = async (userId, newTenant) => {
        try {
            setUpdatingTenantUserId(userId);
            const res = await fetch(`/api/admin/users/${userId}/tenant`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_schema: newTenant }),
                credentials: 'include',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to update organization');
            }
            const updated = await res.json();
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, tenant_schema: updated.tenant_schema } : u));
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingTenantUserId(null);
        }
    };

    const deleteUser = async (userId, username) => {
        if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
        try {
            setDeletingUserId(userId);
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to delete user');
            }
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err) {
            setError(err.message);
        } finally {
            setDeletingUserId(null);
        }
    };

    if (loading) return <div className="admin-panel"><p>Loading users...</p></div>;

    return (
        <div className="admin-panel">
            <h2>User Management</h2>
            {error && <div className="admin-error">{error}</div>}
            <table className="admin-users-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Organization</th>
                        <th>Current Role</th>
                        <th>Change Role</th>
                        <th>Change Org</th>
                        <th>Actions</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => {
                        const isSelf = user.username === currentUser?.username;
                        const tenantKey = user.tenant_schema || 'bfi';
                        return (
                            <tr key={user.id} className={`admin-user-row${isSelf ? ' admin-self-row' : ''}`}>
                                <td className="admin-username">
                                    {user.username}
                                    {isSelf && <span className="admin-self-badge"> (you)</span>}
                                </td>
                                <td className="admin-tenant">
                                    <span className={`tenant-badge tenant-${tenantKey}`}>
                                        {TENANT_LABELS[tenantKey] || tenantKey}
                                    </span>
                                </td>
                                <td className="admin-role">
                                    <span className={`role-badge role-${user.user_role}`}>
                                        {user.user_role}
                                    </span>
                                </td>
                                <td className="admin-actions">
                                    <select
                                        value={user.user_role}
                                        onChange={(e) => updateUserRole(user.id, e.target.value)}
                                        disabled={updatingUserId === user.id || isSelf}
                                        className="admin-role-select"
                                        title={isSelf ? 'You cannot change your own role' : ROLE_DESCRIPTIONS[user.user_role]}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="editor">Editor</option>
                                        <option value="analyzer">Analyzer</option>
                                        <option value="viewer">Viewer</option>
                                    </select>
                                </td>
                                <td className="admin-actions">
                                    <select
                                        value={tenantKey}
                                        onChange={(e) => updateUserTenant(user.id, e.target.value)}
                                        disabled={updatingTenantUserId === user.id || isSelf}
                                        className="admin-role-select"
                                        title={isSelf ? 'You cannot change your own organization' : undefined}
                                    >
                                        {allowedTenants.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="admin-actions">
                                    {!isSelf && (
                                        <button
                                            onClick={() => deleteUser(user.id, user.username)}
                                            disabled={deletingUserId === user.id}
                                            className="admin-delete-btn"
                                            title="Delete user"
                                        >
                                            {deletingUserId === user.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                    )}
                                </td>
                                <td className="admin-created">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div className="role-reference">
                <h3>Role Definitions</h3>
                <ul>
                    {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
                        <li key={role}><strong>{role}:</strong> {desc}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
