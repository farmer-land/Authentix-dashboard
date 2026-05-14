type RazorpayGlobal = Window & { Razorpay?: unknown };

export const RAZORPAY_BRAND = {
  name: 'Authentix',
  // Must be an absolute PNG URL — Razorpay Checkout does not render SVG
  // TODO: replace with a hosted PNG once available at /brand/authentix.png
  image: 'https://dashboard.digicertificates.in/brand/authentix-24-24.svg',
  theme: { color: '#3ECF8E' },
} as const;

export function preloadRazorpay() {
  if (typeof window === 'undefined' || (window as RazorpayGlobal).Razorpay) return;
  if (document.getElementById('rzp-checkout-js')) return;
  const s = document.createElement('script');
  s.id = 'rzp-checkout-js';
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
}

export function waitForRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as RazorpayGlobal).Razorpay) { resolve(); return; }
    const el = document.getElementById('rzp-checkout-js');
    if (!el) { reject(new Error('Razorpay script not injected')); return; }
    const tid = setTimeout(() => reject(new Error('Razorpay load timed out')), 10_000);
    el.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    el.addEventListener('error', () => { clearTimeout(tid); reject(new Error('Razorpay script failed to load')); });
  });
}
