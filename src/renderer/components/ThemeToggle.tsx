import { useEffect } from 'react';

// Force dark mode - this component now just ensures dark mode is always enabled
export default function ThemeToggle() {
  useEffect(() => {
    // Always set dark mode
    document.documentElement.classList.add('dark');
    localStorage.setItem('kakarot-theme', 'dark');
  }, []);

  // Render nothing - dark mode is enforced automatically
  return null;
}
