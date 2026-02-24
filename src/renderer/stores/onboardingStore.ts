import { create } from 'zustand';

interface OnboardingState {
  isCompleted: boolean;
  isLoading: boolean;

  loadFromSettings: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  isCompleted: false,
  isLoading: true,

  loadFromSettings: async () => {
    try {
      const settings = await window.kakarot.settings.get();
      set({ isCompleted: !!settings.onboardingCompleted, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  completeOnboarding: async () => {
    set({ isCompleted: true });
    await window.kakarot.settings.update({ onboardingCompleted: true });
  },

  resetOnboarding: async () => {
    set({ isCompleted: false });
    await window.kakarot.settings.update({ onboardingCompleted: false });
  },
}));
