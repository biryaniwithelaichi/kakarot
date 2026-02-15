import { useEffect, useRef, useState } from 'react';

interface UseThinkingTimerOptions {
  /** Auto-start timer on mount */
  autoStart?: boolean;
}

/**
 * Custom hook for tracking thinking/reasoning duration
 * Measures elapsed time from when thinking starts until first answer token arrives
 */
export function useThinkingTimer(options: UseThinkingTimerOptions = {}) {
  const { autoStart = false } = options;

  const [isRunning, setIsRunning] = useState(autoStart);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start the timer
  const start = () => {
    if (isRunning) return;

    startTimeRef.current = Date.now();
    setIsRunning(true);
    setElapsedMs(0);

    // Update every 100ms for smooth display
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
    }, 100);
  };

  // Stop the timer and return final duration
  const stop = (): number => {
    if (!isRunning || !startTimeRef.current) return elapsedMs;

    const finalDuration = Date.now() - startTimeRef.current;
    setElapsedMs(finalDuration);
    setIsRunning(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return finalDuration;
  };

  // Reset the timer
  const reset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
    setIsRunning(false);
    setElapsedMs(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    elapsedMs,
    isRunning,
    start,
    stop,
    reset,
  };
}
