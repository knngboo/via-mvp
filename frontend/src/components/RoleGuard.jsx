import React from 'react';
import { useRole } from '../hooks/useRole';

export function RoleGuard({ role, children, fallback = null }) {
    const hasRole = useRole(role);
    return hasRole ? children : fallback;
}

export function AdminOnly({ children, fallback = null }) {
    return <RoleGuard role="admin" fallback={fallback}>{children}</RoleGuard>;
}

export function EditorOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'editor']} fallback={fallback}>{children}</RoleGuard>;
}

export function AnalyzerOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'analyzer', 'editor']} fallback={fallback}>{children}</RoleGuard>;
}

export function NotViewerOnly({ children, fallback = null }) {
    return <RoleGuard role={['admin', 'editor', 'analyzer']} fallback={fallback}>{children}</RoleGuard>;
}
