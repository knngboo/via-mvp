import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

// import all the legacy icons you copied over earlier!
//
import bfiIconDark from '../assets/images/BFI_LogoIcon_Dark.svg';
import iconSearch from '../assets/images/Icons=Search.svg';
import iconSources from '../assets/images/Icons=Sources.svg';
import iconBookmark from '../assets/images/Icons=Bookmark.svg';

const Sidebar = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const { pathname } = useLocation();

    // make the sidebar collapsible, just like the old bfi project!
    //
    const [expanded, setExpanded] = useState(
        () => localStorage.getItem('via_sidebar_expanded') !== 'false'
    );

    const toggleSidebar = () => {
        setExpanded(!expanded);
        localStorage.setItem('via_sidebar_expanded', !expanded);
    };

    return (
        <div style={{
            width: expanded ? '200px' : '70px',
            backgroundColor: 'var(--grey-50)',
            borderRight: '1px solid var(--grey-200)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.2s ease',
            padding: expanded ? '20px' : '20px 10px',
            overflow: 'hidden'
        }}>

            {/* collapsible header with clickable logo */}
            {/* */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', marginBottom: '40px', gap: '10px' }}>
                <img
                    src={bfiIconDark}
                    alt="BFI"
                    style={{ width: '28px', height: '28px', cursor: 'pointer' }}
                    onClick={toggleSidebar}
                    title="Toggle Sidebar"
                />
                {expanded && <span style={{ fontWeight: 'bold', color: 'var(--primary-600)', whiteSpace: 'nowrap' }}>VIA MVP</span>}
            </div>

            {/* dynamic navigation with active routing states */}
            {/* */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                        backgroundColor: pathname === '/dashboard' ? 'var(--grey-200)' : 'transparent',
                        border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        color: pathname === '/dashboard' ? 'var(--primary-500)' : 'var(--grey-700)',
                        fontWeight: pathname === '/dashboard' ? 'bold' : 'normal',
                        justifyContent: expanded ? 'flex-start' : 'center'
                    }}
                    title="Overview"
                >
                    <img src={iconSearch} alt="Overview" style={{ width: '20px', opacity: pathname === '/dashboard' ? 1 : 0.6 }} />
                    {expanded && <span>Overview</span>}
                </button>

                <button
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                        backgroundColor: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--grey-700)',
                        justifyContent: expanded ? 'flex-start' : 'center'
                    }}
                    title="Route Details"
                >
                    <img src={iconSources} alt="Details" style={{ width: '20px', opacity: 0.6 }} />
                    {expanded && <span style={{ whiteSpace: 'nowrap' }}>Route Details</span>}
                </button>

                <button
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                        backgroundColor: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--grey-700)',
                        justifyContent: expanded ? 'flex-start' : 'center'
                    }}
                    title="Comparison"
                >
                    <img src={iconBookmark} alt="Compare" style={{ width: '20px', opacity: 0.6 }} />
                    {expanded && <span style={{ whiteSpace: 'nowrap' }}>Comparison</span>}
                </button>
            </nav>

            {/* user profile and logout */}
            {/* */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: expanded ? 'flex-start' : 'center' }}>
                {expanded && (
                    <div style={{ fontSize: '12px', color: 'var(--grey-700)', whiteSpace: 'nowrap' }}>
                        User: <br /><strong>{user?.username}</strong>
                    </div>
                )}

                <button
                    onClick={logout}
                    style={{
                        padding: '8px',
                        backgroundColor: 'var(--grey-200)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        width: '100%',
                        color: 'var(--grey-900)'
                    }}
                    title="Sign Out"
                >
                    {expanded ? 'Sign Out' : 'Out'}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
