import React, { useState } from 'react';
import { AlertCircle, ChevronLeft } from 'lucide-react';

interface SignInStepProps {
  onSuccess: (data: {
    name: string;
    email: string;
    avatar?: string;
    provider: 'google' | 'microsoft' | 'apple';
  }) => void;
  onBack?: () => void;
}

export default function SignInStep({ onSuccess, onBack }: SignInStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'microsoft' | 'apple' | null>(null);
  const [error, setError] = useState('');

  const handleConnect = async (provider: 'google' | 'microsoft' | 'apple') => {
    setIsConnecting(true);
    setConnectingProvider(provider);
    setError('');

    try {
      if (provider === 'google' || provider === 'microsoft') {
        const calendarProvider = provider === 'microsoft' ? 'outlook' : 'google';
        
        // This will open system browser via shell.openExternal()
        // and handle OAuth callback automatically
        const connections = await window.kakarot.calendar.connect(calendarProvider);
        
        // Extract user info from connection (OAuth provides this)
        const connection = connections[calendarProvider];
        onSuccess({
          name: connection?.email?.split('@')[0] || 'User',
          email: connection?.email || 'user@example.com',
          provider,
        });
      } else if (provider === 'apple') {
        // Apple uses local EventKit calendar access, not OAuth
        await window.kakarot.calendar.connect('icloud', {
          appleId: 'local',
          appPassword: 'eventkit',
        });
        
        onSuccess({
          name: 'User',
          email: 'user@icloud.com',
          provider: 'apple',
        });
      }
    } catch (err) {
      // Provide user-friendly error messages
      let errorMessage = 'Connection failed. Please try again.';
      
      if (err instanceof Error) {
        if (err.message.includes('CLIENT_ID') || err.message.includes('CLIENT_SECRET')) {
          errorMessage = `${provider === 'microsoft' ? 'Microsoft' : 'Google'} Calendar is not configured yet. Please contact support.`;
        } else if (err.message.includes('OAuth callback')) {
          errorMessage = 'Authentication was cancelled or failed. Please try again.';
        } else if (err.message.includes('offline')) {
          errorMessage = 'Unable to connect. Please check your internet connection.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setIsConnecting(false);
      setConnectingProvider(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-white">Sign in to get started</h2>
        <p className="text-gray-400">
          Sign in to sync your calendar and upcoming meetings
        </p>
      </div>

      <div className="space-y-3 pt-4">
        <button
          onClick={() => handleConnect('google')}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {connectingProvider === 'google' ? (
            <span className="flex items-center gap-2">
              <span className="animate-pulse">Connecting...</span>
            </span>
          ) : (
            'Continue with Google'
          )}
        </button>

        <button
          onClick={() => handleConnect('microsoft')}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 23 23">
            <path fill="#f35325" d="M0 0h11v11H0z" />
            <path fill="#81bc06" d="M12 0h11v11H12z" />
            <path fill="#05a6f0" d="M0 12h11v11H0z" />
            <path fill="#ffba08" d="M12 12h11v11H12z" />
          </svg>
          {connectingProvider === 'microsoft' ? (
            <span className="flex items-center gap-2">
              <span className="animate-pulse">Connecting...</span>
            </span>
          ) : (
            'Continue with Microsoft'
          )}
        </button>

        {/* Apple Sign-In Button - Hidden */}
        {/* <button
          onClick={() => handleConnect('apple')}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          {connectingProvider === 'apple' ? (
            <span className="flex items-center gap-2">
              <span className="animate-pulse">Connecting...</span>
            </span>
          ) : (
            'Continue with Apple'
          )}
        </button> */}
      </div>

      {error && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setError('');
              setIsConnecting(false);
              setConnectingProvider(null);
            }}
            className="w-full py-2 px-4 bg-white/5 hover:bg-white/10 text-white rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Back button */}
      {onBack && (
        <div className="pt-4 border-t border-gray-700">
          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      )}
    </div>
  );
}
