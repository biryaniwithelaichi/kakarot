import React, { useState, useEffect } from 'react';
import { Mic, Monitor, Check, AlertCircle } from 'lucide-react';

interface AudioPermissionsStepProps {
  onSuccess: () => void;
}

type PermissionStatus = 'pending' | 'granted' | 'denied' | 'checking';

export default function AudioPermissionsStep({ onSuccess }: AudioPermissionsStepProps) {
  const [micStatus, setMicStatus] = useState<PermissionStatus>('pending');
  const [systemStatus, setSystemStatus] = useState<PermissionStatus>('pending');

  useEffect(() => {
    // Check initial permissions
    checkPermissions();
  }, []);

  useEffect(() => {
    if (micStatus === 'granted' && systemStatus === 'granted') {
      // Auto-advance after both granted
      setTimeout(() => {
        onSuccess();
      }, 1000);
    }
  }, [micStatus, systemStatus, onSuccess]);

  const checkPermissions = async () => {
    try {
      // Check microphone
      const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicStatus(micResult.state === 'granted' ? 'granted' : 'pending');

      // System audio permissions are OS-level on macOS
      // For now, we'll assume it needs to be checked separately
      setSystemStatus('pending');
    } catch (err) {
      console.error('Error checking permissions:', err);
    }
  };

  const requestMicPermission = async () => {
    setMicStatus('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
    }
  };

  const requestSystemPermission = async () => {
    setSystemStatus('checking');
    // System audio on macOS requires app-level permissions
    // User needs to grant in System Settings manually
    // For this demo, we'll simulate it
    setTimeout(() => {
      setSystemStatus('granted');
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-white">Audio permissions</h2>
        <p className="text-gray-400">
          Grant access to capture and transcribe your meetings
        </p>
      </div>

      <div className="space-y-3 pt-4">
        {/* Microphone Permission */}
        <div className="flex items-center justify-between p-4 bg-[#161616] rounded-lg border border-[#2A2A2A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center">
              <Mic className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Microphone</p>
              <p className="text-xs text-gray-500">Required for your audio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {micStatus === 'granted' && (
              <div className="flex items-center gap-2 text-[#F0EBE3]">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Granted</span>
              </div>
            )}
            {micStatus === 'denied' && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Denied</span>
              </div>
            )}
            {micStatus === 'pending' && (
              <button
                onClick={requestMicPermission}
                className="px-4 py-1.5 bg-[#4ea8dd] hover:bg-[#3d96cb] text-white rounded text-sm font-medium transition-colors"
              >
                Enable
              </button>
            )}
            {micStatus === 'checking' && (
              <span className="text-sm text-gray-400">Checking...</span>
            )}
          </div>
        </div>

        {/* System Audio Permission */}
        <div className="flex items-center justify-between p-4 bg-[#161616] rounded-lg border border-[#2A2A2A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center">
              <Monitor className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">System Audio</p>
              <p className="text-xs text-gray-500">Required for others' audio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {systemStatus === 'granted' && (
              <div className="flex items-center gap-2 text-[#F0EBE3]">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Granted</span>
              </div>
            )}
            {systemStatus === 'denied' && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Denied</span>
              </div>
            )}
            {systemStatus === 'pending' && (
              <button
                onClick={requestSystemPermission}
                className="px-4 py-1.5 bg-[#4ea8dd] hover:bg-[#3d96cb] text-white rounded text-sm font-medium transition-colors"
              >
                Enable
              </button>
            )}
            {systemStatus === 'checking' && (
              <span className="text-sm text-gray-400">Checking...</span>
            )}
          </div>
        </div>
      </div>

      {(micStatus === 'denied' || systemStatus === 'denied') && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">
            <p className="font-medium">Permission denied</p>
            <p className="text-xs text-red-400 mt-1">
              Please enable permissions in System Settings → Privacy & Security
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
