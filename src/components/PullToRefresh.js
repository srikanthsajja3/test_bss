// PullToRefresh.js — pull down from the top of the page on a phone to reload it (web only).
// The app scrolls inside its own containers, not the browser page, so the phone browser's own
// pull-to-refresh never fires. This brings it back: when every scrolling area under the finger is
// already at its top, a pull of ~80px shows a round indicator; letting go past it reloads the page.
// Ignored inside text fields, open dialogs and horizontal swipes.
import { useEffect } from 'react';
import { Platform } from 'react-native';

const THRESHOLD = 80; // px of (damped) pull needed to reload
const MAX = 120;

const atTopEverywhere = (el) => {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
  }
  return (window.scrollY || 0) <= 0;
};

const skipTarget = (el) => {
  if (!el || !el.closest) return true;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  if (el.closest('[aria-modal="true"], [role="dialog"]')) return true; // a modal is open
  return false;
};

export function usePullToRefresh(enabled) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return undefined;
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    if (!isTouch) return undefined;

    const ind = document.createElement('div');
    ind.setAttribute('aria-hidden', 'true');
    ind.style.cssText = 'position:fixed;left:50%;top:0;z-index:99999;width:38px;height:38px;margin-left:-19px;border-radius:19px;'
      + 'background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.18);display:flex;align-items:center;justify-content:center;'
      + 'transform:translateY(-50px);opacity:0;pointer-events:none;transition:none;';
    ind.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
      + '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
    const svg = () => ind.firstChild;
    document.body.appendChild(ind);
    const style = document.createElement('style');
    style.textContent = '@keyframes onebssPtrSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    let startY = null;
    let startX = 0;
    let pull = 0;
    let active = false;
    let reloading = false;

    const show = (d) => {
      const p = Math.min(d, MAX);
      ind.style.transition = 'none';
      ind.style.opacity = String(Math.min(1, p / 40));
      ind.style.transform = `translateY(${p - 44}px)`;
      svg().style.transform = `rotate(${p * 3}deg)`;
      svg().setAttribute('stroke', p >= THRESHOLD ? '#0f766e' : '#94a3b8');
    };
    const hide = () => {
      ind.style.transition = 'transform .2s ease, opacity .2s ease';
      ind.style.transform = 'translateY(-50px)';
      ind.style.opacity = '0';
    };

    const onStart = (e) => {
      if (reloading || e.touches.length !== 1 || skipTarget(e.target) || !atTopEverywhere(e.target)) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pull = 0;
      active = false;
    };
    const onMove = (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (!active) {
        if (dy < 8) {
          if (dy < -4 || dx > 12) startY = null; // scrolling up / swiping sideways
          return;
        }
        if (dx > dy || !atTopEverywhere(e.target)) {
          startY = null;
          return;
        }
        active = true;
      }
      pull = dy * 0.5;
      if (e.cancelable) e.preventDefault(); // the page itself stays still while pulling
      show(pull);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (active && pull >= THRESHOLD) {
        reloading = true;
        ind.style.transition = 'transform .15s ease';
        ind.style.transform = `translateY(${THRESHOLD - 44}px)`;
        svg().setAttribute('stroke', '#0f766e');
        svg().style.animation = 'onebssPtrSpin .7s linear infinite';
        setTimeout(() => window.location.reload(), 150);
      } else {
        hide();
      }
      active = false;
      pull = 0;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      ind.remove();
      style.remove();
    };
  }, [enabled]);
}
