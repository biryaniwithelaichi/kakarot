import React from 'react';
import { Check } from 'lucide-react';

interface CompletionStepProps {
  userName?: string;
  onFinish: () => void;
}

export default function CompletionStep({ userName, onFinish }: CompletionStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center mb-4">
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
          <Check className="w-10 h-10 text-green-500" />
        </div>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-white">
          {userName ? `You're all set, ${userName.split(' ')[0]}!` : "You're all set!"}
        </h1>
        <p className="text-lg text-gray-400 max-w-md mx-auto">
          Your meetings will now be automatically transcribed, analyzed, and prepared for you.
        </p>
      </div>

      <div className="pt-8">
        <button
          onClick={onFinish}
          className="w-full py-3 px-6 bg-[#4ea8dd] hover:bg-[#3d96cb] text-white rounded-lg font-medium transition-colors"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
