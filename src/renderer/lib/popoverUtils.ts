import React from 'react';

/**
 * Calculate optimal position for a popover to keep it within viewport bounds
 * @param triggerRect - The bounding rect of the trigger element
 * @param popoverWidth - Width of the popover
 * @param popoverHeight - Height of the popover (approximate)
 * @param preferredPosition - 'above' | 'below' | 'left' | 'right'
 * @returns Position object with top and left coordinates
 */
export function calculatePopoverPosition(
  triggerRect: DOMRect,
  popoverWidth: number,
  popoverHeight: number,
  preferredPosition: 'above' | 'below' | 'left' | 'right' = 'above'
): { top: number; left: number } {
  const padding = 16; // Minimum padding from viewport edges
  const gap = 8; // Gap between trigger and popover

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = 0;
  let left = 0;

  // Calculate vertical position
  if (preferredPosition === 'above' || preferredPosition === 'below') {
    if (preferredPosition === 'above') {
      top = triggerRect.top - popoverHeight - gap;
      
      // If not enough space above, try below
      if (top < padding) {
        top = triggerRect.bottom + gap;
        
        // If also not enough space below, center vertically
        if (top + popoverHeight > viewportHeight - padding) {
          top = Math.max(padding, (viewportHeight - popoverHeight) / 2);
        }
      }
    } else {
      top = triggerRect.bottom + gap;
      
      // If not enough space below, try above
      if (top + popoverHeight > viewportHeight - padding) {
        top = triggerRect.top - popoverHeight - gap;
        
        // If also not enough space above, center vertically
        if (top < padding) {
          top = Math.max(padding, (viewportHeight - popoverHeight) / 2);
        }
      }
    }

    // Center horizontally on trigger
    left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
    
    // Adjust if overflowing on the left
    if (left < padding) {
      left = padding;
    }
    
    // Adjust if overflowing on the right
    if (left + popoverWidth > viewportWidth - padding) {
      left = viewportWidth - popoverWidth - padding;
    }
  } else {
    // Horizontal positioning (left or right)
    if (preferredPosition === 'right') {
      left = triggerRect.right + gap;
      
      // If not enough space on right, try left
      if (left + popoverWidth > viewportWidth - padding) {
        left = triggerRect.left - popoverWidth - gap;
        
        // If also not enough space on left, center horizontally
        if (left < padding) {
          left = Math.max(padding, (viewportWidth - popoverWidth) / 2);
        }
      }
    } else {
      left = triggerRect.left - popoverWidth - gap;
      
      // If not enough space on left, try right
      if (left < padding) {
        left = triggerRect.right + gap;
        
        // If also not enough space on right, center horizontally
        if (left + popoverWidth > viewportWidth - padding) {
          left = Math.max(padding, (viewportWidth - popoverWidth) / 2);
        }
      }
    }

    // Center vertically on trigger
    top = triggerRect.top + triggerRect.height / 2 - popoverHeight / 2;
    
    // Adjust if overflowing on top
    if (top < padding) {
      top = padding;
    }
    
    // Adjust if overflowing on bottom
    if (top + popoverHeight > viewportHeight - padding) {
      top = viewportHeight - popoverHeight - padding;
    }
  }

  return { top, left };
}

/**
 * React hook to manage popover positioning that stays within viewport bounds
 * @param isOpen - Whether the popover is open
 * @param triggerRef - Ref to the trigger element
 * @param popoverWidth - Width of the popover
 * @param popoverHeight - Height of the popover (approximate)
 * @param preferredPosition - Preferred position relative to trigger
 * @returns Position object with top and left coordinates
 */
export function usePopoverPosition(
  isOpen: boolean,
  triggerRef: React.RefObject<HTMLElement>,
  popoverWidth: number,
  popoverHeight: number,
  preferredPosition: 'above' | 'below' | 'left' | 'right' = 'above'
): { top: number; left: number } {
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (isOpen && triggerRef.current) {
      const calculatePosition = () => {
        const triggerRect = triggerRef.current?.getBoundingClientRect();
        if (!triggerRect) return;

        const newPosition = calculatePopoverPosition(
          triggerRect,
          popoverWidth,
          popoverHeight,
          preferredPosition
        );
        setPosition(newPosition);
      };

      calculatePosition();
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition, true);
      
      return () => {
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition, true);
      };
    }
  }, [isOpen, triggerRef, popoverWidth, popoverHeight, preferredPosition]);

  return position;
}
