import React, { createContext, useState, useContext, useEffect } from 'react';

export const AuthContext = createContext();

// C3: JWT now lives exclusively in a HttpOnly cookie set by the backend.
// AuthContext only holds the user's public identity (username + role)
// derived from the login response JSON — never the raw token.
//
// Session persistence across page reloads is handled by the cookie itself.
// On mount, the app hits /api/me (or any authenticated endpoint) to rehydrate
// user state. For now, a hard refresh clears React state and the user sees
// the login page; the cookie remains valid so they can log back in instantly.

export const AuthProvider = ({ children }) => {
    // User identity — null means "not logged in" in React state.
    // The actual session credential lives in the HttpOnly cookie.
    const [user, setUser] = useState(null);

    // One-time migration: remove the legacy via_token from localStorage.
    // Before C3, the JWT was stored here. It's now orphaned and serves no purpose.
    useEffect(() => {
        localStorage.removeItem('via_token');
    }, []);

    // Called by Login page after a successful POST /api/login.
    // The backend sets the cookie; we only receive { username, role }.
    const login = (username, role) => {
        localStorage.removeItem('buffi_active_conv');
        localStorage.removeItem('buffi_saved_convs');
        setUser({ username, role });
    };

    // Called on explicit logout. Hits the backend to clear the cookie,
    // then wipes local React state and chat history.
    const logout = async () => {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include',
            });
        } catch (_) {
            // Best-effort — clear local state regardless
        }
        localStorage.removeItem('buffi_active_conv');
        localStorage.removeItem('buffi_saved_convs');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
