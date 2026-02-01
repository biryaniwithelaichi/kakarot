import React, { useState } from 'react';
import WelcomeStep from './WelcomeStep';
import SignInStep from './SignInStep';
import AudioPermissionsStep from './AudioPermissionsStep';

export type OnboardingStep = 'welcome' | 'signin' | 'audio';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [, setUserData] = useState<{
    name: string;
    email: string;
    avatar?: string;
    provider?: 'google' | 'microsoft' | 'apple';
  } | null>(null);

  const steps: OnboardingStep[] = ['welcome', 'signin', 'audio'];
  const currentStepIndex = steps.indexOf(currentStep);

  const _goToStep = (step: OnboardingStep) => {
    setCurrentStep(step);
  };
  void _goToStep; // Reserved for step navigation

  const previousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      // Reset user data when going back to allow OAuth to start fresh
      setUserData(null);
      setCurrentStep(steps[prevIndex]);
    }
  };

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
      <div className="w-full max-w-2xl mx-auto px-6">
        {/* Progress indicator */}
        {currentStep !== 'welcome' && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.slice(1).map((step, _index) => (
              <div
                key={step}
                className={`h-2 rounded-full transition-all ${
                  steps.indexOf(step) <= currentStepIndex
                    ? 'w-8 bg-[#4ea8dd]'
                    : 'w-2 bg-gray-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
          {currentStep === 'welcome' && (
            <WelcomeStep onContinue={nextStep} />
          )}
          {currentStep === 'signin' && (
            <SignInStep
              onSuccess={(data) => {
                setUserData(data);
                nextStep();
              }}
              onBack={previousStep}
            />
          )}
          {currentStep === 'audio' && (
            <AudioPermissionsStep onSuccess={onComplete} />
          )}
        </div>
      </div>
    </div>
  );
}
