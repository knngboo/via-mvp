import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import apiService from '../services/api';

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
            const data = await apiService.login(username, password);

            // securely save the token and auto-redirect to dashboard
            //
            login(data.username, data.role);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <style>{`
                @media (max-width: 768px) {
                    .login-wrapper { flex-direction: column !important; }
                    .login-hero { display: none !important; }
                    .login-form-col { flex: unset !important; width: 100% !important; min-height: 100vh; }
                }
            `}</style>
            <div className="login-wrapper" style={{ display: 'flex', height: '100vh', width: '100vw' }}>

                {/* left column: the brand hero section */}
                <div className="login-hero" style={{
                    flex: 1,
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
                <div className="login-form-col" style={{
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
                            <div role="alert" style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)', fontSize: '14px', textAlign: 'center' }}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="login-username" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--grey-700)' }}>
                                    Username
                                </label>
                                <input
                                    id="login-username"
                                    type="text"
                                    placeholder="admin@bfinstitute.org"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="login-password" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--grey-700)' }}>
                                    Password
                                </label>
                                <input
                                    id="login-password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                aria-label={isLoading ? 'Authenticating, please wait' : 'Continue to dashboard'}
                                style={{
                                    marginTop: '10px', padding: '14px', backgroundColor: 'var(--primary-600)', color: 'white', border: 'none', borderRadius: 'var(--radius-pill)', fontSize: '16px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s'
                                }}
                            >
                                {isLoading ? 'Authenticating...' : 'Continue'}
                            </button>
                        </form>

                        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: 'var(--grey-600)' }}>
                            Admin? <Link to="/register" style={{ color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 'bold' }}>Register a new user</Link>
                        </div>

                    </div>
                </div>

            </div>
        </>
    );
};

export default Login;
