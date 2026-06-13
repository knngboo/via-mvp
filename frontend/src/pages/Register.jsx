import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiService from '../services/api';

// import the real legacy full-width logos and the hero image!
import bfiLogoWhite from '../assets/images/BFI_Logo(White).svg';
import bfiLogoDark from '../assets/images/BFI_Logo.svg';
import homeImage from '../assets/images/HomeImageBFI.svg';

const Register = () => {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [adminSecret, setAdminSecret] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // handle secure registration submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await apiService.register(username, password, adminSecret);
            setSuccessMsg('Registration successful! You can now log in.');
            // Automatically clear fields so they can go to login
            setUsername('');
            setPassword('');
            setAdminSecret('');
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
                    .register-wrapper { flex-direction: column !important; }
                    .register-hero { display: none !important; }
                    .register-form-col { flex: unset !important; width: 100% !important; min-height: 100vh; }
                }
            `}</style>
            <div className="register-wrapper" style={{ display: 'flex', height: '100vh', width: '100vw' }}>

                {/* left column: the brand hero section */}
                <div className="register-hero" style={{
                    flex: 1,
                    background: 'linear-gradient(-135deg, #020C6B 55%, #1734EB 55%)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '60px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ zIndex: 10 }}>
                        <img src={bfiLogoWhite} alt="Better Futures Institute" style={{ height: '32px' }} />
                    </div>

                    <div style={{ margin: 'auto', zIndex: 10, width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'center' }}>
                        <img src={homeImage} alt="Platform Elements" style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }} />
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.6)', zIndex: 10 }}>
                        <span>www.bfinstitute.org</span>
                        <span>© 2026 Better Futures Institute. All rights reserved.</span>
                    </div>
                </div>

                {/* right column: the registration form */}
                <div className="register-form-col" style={{
                    flex: 1,
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px'
                }}>
                    <div style={{ width: '100%', maxWidth: '360px' }}>

                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
                            <img src={bfiLogoDark} alt="Better Futures Institute" style={{ height: '40px' }} />
                        </div>

                        <h2 style={{ textAlign: 'center', color: 'var(--grey-1000)', marginBottom: '40px', fontSize: '24px' }}>Register an Admin</h2>

                        {error && (
                            <div role="alert" style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 'var(--radius-sm)', fontSize: '14px', textAlign: 'center' }}>
                                {error}
                            </div>
                        )}
                        {successMsg && (
                            <div role="status" style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 'var(--radius-sm)', fontSize: '14px', textAlign: 'center' }}>
                                {successMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="reg-username" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--grey-700)' }}>
                                    Username
                                </label>
                                <input
                                    id="reg-username"
                                    type="text"
                                    placeholder="New Username (e.g. admin@bfinstitute.org)"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="reg-password" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--grey-700)' }}>
                                    Password <span style={{ color: 'var(--grey-500)', fontWeight: 400 }}>(min 8 characters)</span>
                                </label>
                                <input
                                    id="reg-password"
                                    type="password"
                                    placeholder="New Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    minLength={8}
                                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="reg-admin-secret" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--grey-700)' }}>
                                    Master Admin Secret
                                </label>
                                <input
                                    id="reg-admin-secret"
                                    type="password"
                                    placeholder="Master Admin Secret"
                                    value={adminSecret}
                                    onChange={(e) => setAdminSecret(e.target.value)}
                                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--grey-200)', backgroundColor: 'var(--grey-50)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                aria-label={isLoading ? 'Registering account, please wait' : 'Register Account'}
                                style={{
                                    marginTop: '10px', padding: '14px', backgroundColor: 'var(--primary-600)', color: 'white', border: 'none', borderRadius: 'var(--radius-pill)', fontSize: '16px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s'
                                }}
                            >
                                {isLoading ? 'Registering...' : 'Register Account'}
                            </button>
                        </form>

                        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: 'var(--grey-600)' }}>
                            Already have an account? <Link to="/login" style={{ color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 'bold' }}>Log in</Link>
                        </div>

                    </div>
                </div>

            </div>
        </>
    );
};

export default Register;
