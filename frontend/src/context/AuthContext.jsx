import React, { createContext, useState, useContext, useEffect } from 'react';

export const AuthContext = createContext();

// Namespaced localStorage key so different users never share chat history.
export const userKey = (base) => {
    try {
        const u = localStorage.getItem('buffi_current_user') || 'anon';
        return `buffi_${encodeURIComponent(u)}_${base}`;
    } catch { return `buffi_anon_${base}`; }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // One-time migration: remove legacy via_token from localStorage.
    useEffect(() => {
        localStorage.removeItem('via_token');
    }, []);

    // Restore session from the HttpOnly cookie on page load.
    // Retries up to 3 times with backoff to handle the Docker startup race
    // where the frontend container is healthy before the backend container is.
    useEffect(() => {
        let cancelled = false;
        const restore = async (attempt = 0) => {
            try {
                const r = await fetch('/api/me', { credentials: 'include' });
                if (cancelled) return;
                if (r.ok) {
                    const data = await r.json();
                    if (data?.username) {
                        localStorage.setItem('buffi_current_user', data.username);
                        setUser({ username: data.username, role: data.role });
                    }
                }
                setLoading(false);
            } catch {
                if (cancelled) return;
                if (attempt < 3) {
                    // Backend isn't ready yet — retry with backoff
                    setTimeout(() => restore(attempt + 1), 1500 * (attempt + 1));
                } else {
                    setLoading(false);
                }
            }
        };
        restore();
        return () => { cancelled = true; };
    }, []);

    // Called by Login after successful POST /api/login.
    // Namespaces chat history by username — different users get separate history.
    const login = (username, role) => {
        localStorage.setItem('buffi_current_user', username);
        setUser({ username, role });
    };

    // Called on explicit logout. Clears session cookie via backend.
    // Chat history stays in localStorage under the user's namespaced key
    // so it's restored when the same user logs back in.
    const logout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch (_) { }
        localStorage.removeItem('buffi_current_user');
        setUser(null);
    };

    // Show nothing while waiting for cookie restore — avoids login-page flash.
    if (loading) return null;

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
