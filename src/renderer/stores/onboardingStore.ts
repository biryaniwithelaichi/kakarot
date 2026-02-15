import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  isCompleted: boolean;
  completedAt: Date | null;
  userData: {
    name: string;
    email: string;
    avatar?: string;
    provider?: 'google' | 'microsoft' | 'apple';
  } | null;

  completeOnboarding: () => void;
  setUserData: (data: NonNullable<OnboardingState['userData']>) => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      isCompleted: false,
      completedAt: null,
      userData: null,

      completeOnboarding: () =>
        set({
          isCompleted: true,
          completedAt: new Date(),
        }),

      setUserData: (data) =>
        set({
          userData: data,
        }),

      resetOnboarding: () =>
        set({
          isCompleted: false,
          completedAt: null,
          userData: null,
        }),
    }),
    {
      name: 'kakarot-onboarding',
    }
  )
);
