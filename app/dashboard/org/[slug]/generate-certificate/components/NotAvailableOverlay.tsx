'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';

export function NotAvailableOverlay() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      className={[
        'lg:hidden fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-10 text-center',
        'transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* Subtle ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full bg-primary/8 blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="w-64 h-64">
          <Lottie
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ path: '/not-available.json' } as any)}
            loop
            autoplay
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
          />
        </div>
        <h2 className="text-2xl font-bold text-foreground mt-1">Open on a larger screen</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-xs leading-relaxed">
          The certificate playground is designed for laptops and desktops.
          Please switch to a larger device to continue.
        </p>
      </div>
    </div>
  );
}
