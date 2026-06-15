import React from 'react';
import { useRole } from '../hooks/useRole';

/**
 * RoleGuard component — conditionally renders children based on user role
 * @param {string|string[]} role - Required role(s)
 * @param {React.ReactNode} children - Content to show if user has the role
 * @param {React.ReactNode} fallback - Optional fallback content if user doesn't have the role
 */
export function RoleGuard({ role, children, fallback = null }) {
    const hasRole = useRole(role);
    return hasRole ? children : fallback;
}

/**
 * AdminOnly component — shows content only to admins
 */
export function AdminOnly({ children, fallback = null }) {
    return <RoleGuard role="admin" fallback={fallback}>{children}</RoleGuard>;
}

/**
 * EditorOnly component — shows content to admins and editors
 */
export function EditorOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'editor']} fallback={fallback}>{children}</RoleGuard>;
}

/**
 * AnalyzerOnly component — shows content to admins, editors, and analyzers
 */
export function AnalyzerOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'analyzer', 'editor']} fallback={fallback}>{children}</RoleGuard>;
}

/**
 * NotViewerOnly component — shows content to anyone except viewers
 */
export function NotViewerOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'editor', 'analyzer']} fallback={fallback}>{children}</RoleGuard>;
}
