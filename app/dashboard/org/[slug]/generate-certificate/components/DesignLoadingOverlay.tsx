'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '../assets/design-loading.json';

interface DesignLoadingOverlayProps {
  message?: string;
}

export function DesignLoadingOverlay({ message: _message = '' }: DesignLoadingOverlayProps) {
  // Fade-in so the overlay doesn't flash on very fast loads
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      className={[
        'fixed top-0 left-14 right-0 bottom-0 z-50 flex flex-col items-center justify-center',
        'bg-background',
        'transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* Dark-mode neon glow — hidden in light mode */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block overflow-hidden"
      >
        {/* Primary neon halo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-primary/20 blur-[100px]" />
        {/* Secondary accent halo — offset slightly for depth */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[55%] w-[260px] h-[260px] rounded-full bg-violet-500/15 blur-[80px]" />
      </div>

      {/* Light-mode subtle glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:hidden overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full bg-primary/8 blur-[60px]" />
      </div>

      {/* Animation — centered, no label */}
      <div className="relative z-10 w-56 h-56">
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: '100%', height: '100%' }}
          rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
        />
      </div>
    </div>
  );
}
