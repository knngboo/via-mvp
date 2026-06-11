import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

const readStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('authUser')) || null; } catch { return null; }
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('authToken') || null);
  const [signedIn, setSignedIn] = useState(() => !!localStorage.getItem('authToken'));
  const [user, setUser] = useState(readStoredUser);

  useEffect(() => {
    if (token) {
      setSignedIn(true);
    }
  }, [token]);

  const login = (authToken, userData) => {
    // Always start a fresh chat session on login so one user's
    // conversation doesn't carry over to another user/device session.
    try {
      localStorage.removeItem('buffi_active_conv');
      localStorage.removeItem('buffi_saved_convs');
    } catch {}
    setToken(authToken);
    setUser(userData);
    setSignedIn(true);
    localStorage.setItem('authToken', authToken);
    try { localStorage.setItem('authUser', JSON.stringify(userData || null)); } catch {}
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setSignedIn(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    // Clear user-scoped UI state so next login starts fresh
    localStorage.removeItem('buffi_active_conv');
    localStorage.removeItem('buffi_saved_convs');
  };

  return (
    <AuthContext.Provider value={{ 
      signedIn, 
      setSignedIn, 
      token, 
      user, 
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
