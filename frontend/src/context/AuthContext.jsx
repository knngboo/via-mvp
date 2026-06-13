import React, { createContext, useState, useContext, useEffect } from 'react';

export const AuthContext = createContext();

function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    // check if the user already has a token saved from a previous visit
    //
    const [token, setToken] = useState(localStorage.getItem('via_token') || null);

    useEffect(() => {
        if (token) {
            const decoded = parseJwt(token);
            if (decoded) {
                setUser({ username: decoded.username, role: decoded.role });
            }
        }
    }, [token]);

    // Sync logout across tabs: if another tab removes the token, clear state here too
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'via_token' && !e.newValue) {
                setToken(null);
                setUser(null);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // securely log the user in and save their badge
    //
    const login = (newToken, username, role) => {
        localStorage.removeItem('buffi_active_conv');
        localStorage.removeItem('buffi_saved_convs');
        localStorage.setItem('via_token', newToken);
        setToken(newToken);
        setUser({ username, role });
    };

    // wipe the session completely on logout
    //
    const logout = () => {
        localStorage.removeItem('buffi_active_conv');
        localStorage.removeItem('buffi_saved_convs');
        localStorage.removeItem('via_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
