'use client';

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './AuthPage.css'

/**
 * Sign In Page Component
 * Handles user login with email and password
 * @param {boolean} isAuthenticated - Current auth status
 * @param {function} onLogin - Login callback handler
 */
function SignIn({ isAuthenticated, onLogin }) {
    const navigate = useNavigate()
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    })
    const [errors, setErrors] = useState({})
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        if (!isAuthenticated && onLogin) {
            onLogin('Demo User', '1')
            navigate('/')
        }
    }, [isAuthenticated, onLogin, navigate])

    // Redirect if already authenticated
    if (isAuthenticated) {
        navigate('/')
        return null
    }

    /**
     * Validate form inputs
     */
    const validateForm = () => {
        const newErrors = {}

        if (!formData.email) {
            newErrors.email = 'Email is required'
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address'
        }

        if (!formData.password) {
            newErrors.password = 'Password is required'
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    /**
     * Handle form submission for login
     */
    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!validateForm()) {
            return
        }

        setIsLoading(true)
        setErrors({})

        try {
            const name = formData.email ? formData.email.split('@')[0] : 'Demo User'
            const id = '1'

            if (onLogin) onLogin(name, id)
            navigate('/')
        } catch (err) {
            setErrors({ submit: err.message || 'Could not sign in' })
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle input field changes
     */
    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }))
        // Clear error for this field when user starts typing
        if (errors[name]) {
            setErrors((prev) => ({
                ...prev,
                [name]: '',
            }))
        }
    }

    return (
        <main className="auth-page">
            <div className="auth-container">
                {/* Left Brand Section */}
                <div className="auth-brand">
                    <div className="brand-content">
                        <h1 className="brand-title">
                            Start Visualizing<br />
                            Your Data Smarter
                        </h1>
                        <p className="brand-subtitle">
                            Sign in to explore advanced analytics<br />
                            and intuitive data visualizations.
                        </p>
                    </div>
                </div>

                {/* Right Form Section */}
                <div className="auth-form-section">
                    <h2 className="form-title">Sign In</h2>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {/* Email Field */}
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">
                                Email
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className={`form-input ${errors.email ? 'error' : ''}`}
                                placeholder="you@example.com"
                                disabled={isLoading}
                            />
                            {errors.email && (
                                <span className="error-message">{errors.email}</span>
                            )}
                        </div>

                        {/* Password Field */}
                        <div className="form-group">
                            <label htmlFor="password" className="form-label">
                                Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className={`form-input ${errors.password ? 'error' : ''}`}
                                    placeholder="••••••••"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                            {errors.password && (
                                <span className="error-message">{errors.password}</span>
                            )}
                        </div>

                        {/* Submit Error Message */}
                        {errors.submit && (
                            <div className="error-message submit-error">{errors.submit}</div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="btn-submit"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    Processing...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Toggle to Create Account */}
                    <div className="auth-toggle">
                        <p className="toggle-text">
                            Don't have an account?{' '}
                            <Link to="/create-account" className="toggle-link">
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}

export default SignIn
