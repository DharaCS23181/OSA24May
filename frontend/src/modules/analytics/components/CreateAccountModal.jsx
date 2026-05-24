import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './CreateAccountModal.css'

/**
 * Create Account Modal Component
 * Handles user registration with name, email and password in a modal
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Function to close the modal
 * @param {function} onLogin - Login callback handler to automatically log in after signup
 */
function CreateAccountModal({ isOpen, onClose, onLogin, onSwitchToSignIn, shouldNavigate = true, message = null }) {
    const navigate = useNavigate()
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
    })
    const [errors, setErrors] = useState({})
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    if (!isOpen) return null

    /**
     * Validate form inputs
     */
    const validateForm = () => {
        const newErrors = {}

        if (!formData.fullName.trim()) {
            newErrors.fullName = 'Full Name is required'
        }

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

        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    /**
     * Handle form submission for registration
     */
    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!validateForm()) {
            return
        }

        setIsLoading(true)
        setErrors({})

        try {
            const name = formData.fullName || formData.email.split('@')[0] || 'Demo User'
            const id = '1'

            onClose()
            if (onLogin) {
                onLogin(name, id)
            }
            if (shouldNavigate) {
                navigate('/')
            }
        } catch (err) {
            setErrors({ submit: err.message || 'Could not create account' })
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
        // Clear error for this field
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
        <div className="create-account-modal-overlay" onClick={handleOverlayClick}>
            <div className="create-account-modal-container">
                <button className="create-account-modal-close" onClick={onClose} aria-label="Close modal">
                    ×
                </button>

                <div className="create-account-modal-header">
                    <h2 className="create-account-modal-title">Create Account</h2>
                    <p className="create-account-modal-subtitle">{message || 'Join us to start visualizing your data'}</p>
                </div>

                <div className="create-account-modal-body">
                    <form onSubmit={handleSubmit} className="auth-form">
                        {/* Name Field */}
                        <div className="form-group">
                            <label htmlFor="modal-name" className="form-label">
                                Full Name
                            </label>
                            <input
                                type="text"
                                id="modal-name"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                className={`form-input ${errors.fullName ? 'error' : ''}`}
                                placeholder="John Doe"
                                disabled={isLoading}
                                autoFocus
                            />
                            {errors.fullName && (
                                <span className="error-message">{errors.fullName}</span>
                            )}
                        </div>

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

                        {/* Confirm Password Field */}
                        <div className="form-group">
                            <label htmlFor="modal-confirm-password" className="form-label">
                                Confirm Password
                            </label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    id="modal-confirm-password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleInputChange}
                                    className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                                    placeholder="••••••••"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    aria-label="Toggle confirm password visibility"
                                >
                                    {showConfirmPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                            {errors.confirmPassword && (
                                <span className="error-message">{errors.confirmPassword}</span>
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
                                'Creating Account...'
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>

                    {/* Toggle to Sign In */}
                    <div className="auth-toggle">
                        <p className="toggle-text">
                            Already have an account?{' '}
                            <button className="toggle-link" onClick={() => {
                                onClose()
                                if (onSwitchToSignIn) onSwitchToSignIn()
                            }}>
                                Sign In
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CreateAccountModal
