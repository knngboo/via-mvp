import React, { createContext, useState, useContext } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    // check if the user already has a token saved from a previous visit
    //
    const [token, setToken] = useState(localStorage.getItem('via_token') || null);

    // securely log the user in and save their badge
    //
    const login = (newToken, username) => {
        localStorage.setItem('via_token', newToken);
        setToken(newToken);
        setUser({ username });
    };

    // wipe the session completely on logout
    //
    const logout = () => {
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
