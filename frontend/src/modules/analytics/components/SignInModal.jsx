import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './SignInModal.css'

/**
 * Sign In Modal Component
 * Handles user login with email and password in a modal
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Function to close the modal
 * @param {function} onLogin - Login callback handler
 */
function SignInModal({ isOpen, onClose, onLogin, onSwitchToSignUp, shouldNavigate = true, message = null }) {
    const navigate = useNavigate()
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    })
    const [errors, setErrors] = useState({})
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    if (!isOpen) return null

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

            if (onClose) onClose()
            if (onLogin) onLogin(name, id)
            if (shouldNavigate) {
                navigate('/')
            }
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

    // Close on overlay click
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return (
        <div className="signin-modal-overlay" onClick={handleOverlayClick}>
            <div className="signin-modal-container">
                <button className="signin-modal-close" onClick={onClose} aria-label="Close modal">
                    ×
                </button>

                <div className="signin-modal-header">
                    <h2 className="signin-modal-title">Welcome Back</h2>
                    <p className="signin-modal-subtitle">{message || 'Sign in to continue to your dashboard'}</p>
                </div>

                <div className="signin-modal-body">
                    <form onSubmit={handleSubmit} className="auth-form">
                        {/* Email Field */}
                        <div className="form-group">
                            <label htmlFor="modal-email" className="form-label">
                                Email
                            </label>
                            <input
                                type="email"
                                id="modal-email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className={`form-input ${errors.email ? 'error' : ''}`}
                                placeholder="you@example.com"
                                disabled={isLoading}
                                autoFocus
                            />
                            {errors.email && (
                                <span className="error-message">{errors.email}</span>
                            )}
                        </div>

                        {/* Password Field */}
                        <div className="form-group">
                            <label htmlFor="modal-password" className="form-label">
                                Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="modal-password"
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
                                'Signing In...'
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Toggle to Create Account */}
                    <div className="auth-toggle">
                        <p className="toggle-text">
                            Don't have an account?{' '}
                            <button className="toggle-link" onClick={() => {
                                if (onClose) onClose()
                                if (onSwitchToSignUp) onSwitchToSignUp()
                            }}>
                                Create Account
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default SignInModal
