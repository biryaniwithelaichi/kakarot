import { useEffect, useRef, useState, useCallback } from 'react';

interface UseChatScrollOptions {
  /** Enable/disable auto-scroll */
  enabled?: boolean;
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number;
}

/**
 * Custom hook for managing sticky auto-scroll in chat interfaces
 * - Auto-scrolls to bottom when user is at bottom and new content arrives
 * - Pauses auto-scroll when user manually scrolls up
 * - Uses Intersection Observer for efficient scroll detection
 */
export function useChatScroll(options: UseChatScrollOptions = {}) {
  const { enabled = true, threshold = 50 } = options;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // Intersection Observer to detect if user is at bottom
  useEffect(() => {
    if (!enabled || !scrollAnchorRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsAtBottom(entry.isIntersecting);

        // If user scrolls back to bottom, re-enable auto-scroll
        if (entry.isIntersecting) {
          setShouldAutoScroll(true);
          userScrolledRef.current = false;
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 1.0,
      }
    );

    observer.observe(scrollAnchorRef.current);

    return () => observer.disconnect();
  }, [enabled]);

  // Detect manual user scrolling (upward)
  useEffect(() => {
    if (!enabled) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceFromBottom = scrollHeight - (currentScrollTop + clientHeight);

      // User scrolled up (and not just a tiny jitter)
      if (currentScrollTop < lastScrollTopRef.current - 5) {
        userScrolledRef.current = true;
        setShouldAutoScroll(false);
      }

      // User is near bottom
      if (distanceFromBottom < threshold) {
        setShouldAutoScroll(true);
        userScrolledRef.current = false;
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => container.removeEventListener('scroll', handleScroll);
  }, [enabled, threshold]);

  // Scroll to bottom programmatically
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!scrollContainerRef.current) return;

    scrollContainerRef.current.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  // Auto-scroll when new content arrives (if should auto-scroll)
  const autoScrollToBottom = useCallback(() => {
    if (!enabled || !shouldAutoScroll) return;
    scrollToBottom('smooth');
  }, [enabled, shouldAutoScroll, scrollToBottom]);

  return {
    scrollContainerRef,
    scrollAnchorRef,
    isAtBottom,
    shouldAutoScroll,
    scrollToBottom,
    autoScrollToBottom,
  };
}
