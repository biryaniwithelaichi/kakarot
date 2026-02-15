import React from 'react';
import logoImage from '../../assets/logo transparent copy.png';

interface WelcomeStepProps {
  onContinue: () => void;
}

export default function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      {/* Treeto Logo */}
      <div className="flex justify-center mb-8">
        <div className="flex flex-col items-center">
          <div className="w-48 h-48">
            <img
              src={logoImage}
              alt="Treeto"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-lg font-medium tracking-wide uppercase text-slate-300 -mt-16">Treeto.</span>
        </div>
      </div>

      <div className="space-y-3">
        <h1 className="text-4xl font-display text-[#F0EBE3]">
          Never blank out in a meeting again.
        </h1>
        <p className="text-lg text-[#5C5750] max-w-xl mx-auto leading-relaxed">
          Finally a meeting copilot that stays out of the participant list and surfaces relevant context exactly when you need it.
        </p>
      </div>

      <div className="pt-8">
        <button
          onClick={onContinue}
          className="w-full py-3 px-6 bg-[#C17F3E] hover:bg-[#D4923F] text-[#0C0C0C] rounded-xl font-medium transition-colors shadow-copper-soft"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
