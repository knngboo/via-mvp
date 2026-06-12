import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// import the real legacy full-width logos and the hero image!
//
import bfiLogoWhite from '../assets/images/BFI_Logo(White).svg';
import bfiLogoDark from '../assets/images/BFI_Logo.svg';
import homeImage from '../assets/images/HomeImageBFI.svg';

const Login = () => {
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // handle secure login submission
    //
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('http://localhost:5001/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'login failed');
            }

            // securely save the token and auto-redirect to dashboard
            //
            login(data.token, data.username);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>

            {/* left column: the brand hero section */}
            {/* */}
            <div style={{
                flex: 1,
                // corrected the angle to 165deg to slope up to the right, and matched the exact hex colors
                background: 'linear-gradient(-135deg, #020C6B 55%, #1734EB 55%)',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ zIndex: 10 }}>
                    {/* full white logo lockup */}
                    <img src={bfiLogoWhite} alt="Better Futures Institute" style={{ height: '32px' }} />
                </div>

                <div style={{ margin: 'auto', zIndex: 10, width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'center' }}>
                    {/* the exact floating graphics image */}
                    <img src={homeImage} alt="Platform Elements" style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }} />
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.6)', zIndex: 10 }}>
                    <span>www.bfinstitute.org</span>
                    <span>© 2026 Better Futures Institute. All rights reserved.</span>
                </div>
            </div>

            {/* right column: the minimal login form */}
            {/* */}
            <div style={{
                flex: 1,
                backgroundColor: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px'
            }}>
                <div style={{ width: '100%', maxWidth: '360px' }}>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
                        {/* full dark logo lockup */}
                        <img src={bfiLogoDark} alt="Better Futures Institute" style={{ height: '40px' }} />
                    </div>

                    <h2 style={{ textAlign: 'center', color: 'var(--grey-1000)', marginBottom: '40px', fontSize: '24px' }}>Log in to your account</h2>

                    {error && (
                        <div style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)', fontSize: '14px', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <input
                            type="text"
                            placeholder="admin@bfinstitute.org"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px' }}
                        />

                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px' }}
                        />

                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                marginTop: '10px', padding: '14px', backgroundColor: 'var(--primary-600)', color: 'white', border: 'none', borderRadius: 'var(--radius-pill)', fontSize: '16px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s'
                            }}
                        >
                            {isLoading ? 'Authenticating...' : 'Continue'}
                        </button>
                    </form>
                </div>
            </div>

        </div>
    );
};

export default Login;
