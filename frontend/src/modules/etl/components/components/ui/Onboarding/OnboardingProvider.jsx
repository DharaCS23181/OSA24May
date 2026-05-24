import React, { createContext, useContext, useState, useEffect } from 'react';
import { ONBOARDING_STEPS } from './OnboardingSteps';

const OnboardingContext = createContext(null);

export const OnboardingProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    return localStorage.getItem('arithwise_onboarding_seen') === 'true';
  });

  const startTour = () => {
    setIsOpen(true);
    setCurrentStep(0);
  };

  const skipTour = () => {
    setIsOpen(false);
    setHasSeenTour(true);
    localStorage.setItem('arithwise_onboarding_seen', 'true');
  };

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      skipTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Automatically start tour for new users after a short delay
  useEffect(() => {
    if (!hasSeenTour) {
      const timer = setTimeout(() => {
        // Start if we're on a valid app route (dashboard, connectors, etc.)
        const hash = window.location.hash;
        if (hash === '' || hash === '#' || hash.startsWith('#/dashboard') || hash.startsWith('#/connectors')) {
          setIsOpen(true);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTour]);

  const value = {
    isOpen,
    currentStep,
    steps: ONBOARDING_STEPS,
    nextStep,
    prevStep,
    skipTour,
    startTour,
    hasSeenTour
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
