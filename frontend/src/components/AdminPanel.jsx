import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AdminPanel.css';

const ROLE_DESCRIPTIONS = {
    admin: 'Full access to all features and user management',
    editor: 'Can upload and manage their own data sources',
    analyzer: 'Can run queries and analyze data',
    viewer: 'Read-only access to shared data'
};

export default function AdminPanel() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatingUserId, setUpdatingUserId] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/users', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
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
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to update role');
            const updated = await res.json();
            // Bug 6 fix: use functional update to avoid stale closure
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_role: updated.user_role } : u));
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingUserId(null);
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
                        <th>Current Role</th>
                        <th>Actions</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => {
                        const isSelf = user.username === currentUser?.username;
                        return (
                        <tr key={user.id} className={`admin-user-row${isSelf ? ' admin-self-row' : ''}`}>
                            <td className="admin-username">
                                {user.username}
                                {isSelf && <span className="admin-self-badge"> (you)</span>}
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
