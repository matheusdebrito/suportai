import { useState, useCallback, useRef, useEffect } from 'react';

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const openDropdown = useCallback(() => setOpen(true), []);
  const closeDropdown = useCallback(() => setOpen(false), []);
  const toggleDropdown = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closeDropdown]);

  return {
    open,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    triggerRef,
    contentRef,
  };
}