import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * Hook to check if the current user has a specific role or one of multiple roles
 * @param {string|string[]} role - Role(s) to check for
 * @returns {boolean} True if the user has one of the specified roles
 */
export function useRole(role) {
    const context = useContext(AuthContext);
    if (!context?.user) return false;
    const rolesArray = Array.isArray(role) ? role : [role];
    return rolesArray.includes(context.user.role);
}

export function useIsAdmin()   { return useRole('admin'); }
export function useCanEdit()   { return useRole(['admin', 'editor']); }
export function useCanAnalyze(){ return useRole(['admin', 'analyzer', 'editor']); }
export function useCanView()   { return useRole(['admin', 'viewer', 'editor', 'analyzer']); }
export function useUserRole()  {
    const context = useContext(AuthContext);
    return context?.user?.role || null;
}
