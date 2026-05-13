'use client';

import { useState, useEffect, useCallback } from 'react';
import { billingApi, type PaymentMethod } from '@/lib/api/billing';
import { CreditCard, Smartphone, Plus, Trash2, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

// Preload Razorpay checkout script as soon as this component mounts
function preloadRazorpay() {
  if (typeof window === 'undefined' || (window as any).Razorpay) return;
  if (document.getElementById('rzp-checkout-js')) return;
  const s = document.createElement('script');
  s.id = 'rzp-checkout-js';
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
}

function waitForRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) { resolve(); return; }
    const el = document.getElementById('rzp-checkout-js');
    if (!el) { reject(new Error('Razorpay script not injected')); return; }
    const tid = setTimeout(() => reject(new Error('Razorpay load timed out')), 10_000);
    el.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    el.addEventListener('error', () => { clearTimeout(tid); reject(new Error('Razorpay script failed to load')); });
  });
}

const METHOD_ICONS: Record<string, React.ReactNode> = {
  card: <CreditCard className="w-4 h-4" />,
  upi:  <Smartphone   className="w-4 h-4" />,
};

function methodLabel(m: PaymentMethod) {
  if (m.method_type === 'card') {
    const parts = [m.card_network, m.card_last4 ? `•••• ${m.card_last4}` : null].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Card';
  }
  if (m.method_type === 'upi') return m.upi_vpa ?? 'UPI';
  return m.method_type;
}

function methodSub(_m: PaymentMethod) {
  return null;
}

export function PaymentMethodsCard({ organizationId: _ }: { organizationId: string }) {
  const [methods, setMethods]       = useState<PaymentMethod[]>([]);
  const [loading, setLoading]       = useState(true);
  const [upiInput, setUpiInput]     = useState('');
  const [upiSaving, setUpiSaving]   = useState(false);
  const [upiError, setUpiError]     = useState('');
  const [cardSetting, setCardSetting] = useState(false);
  const [cardError, setCardError]   = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab]               = useState<'card' | 'upi'>('card');

  // Preload Razorpay immediately so it's ready on click
  useEffect(() => { preloadRazorpay(); }, []);

  const fetchMethods = useCallback(async () => {
    try {
      const list = await billingApi.listPaymentMethods();
      setMethods(list);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  async function handleSaveUpi() {
    const vpa = upiInput.trim();
    if (!vpa) return;
    if (!vpa.includes('@')) { setUpiError('Enter a valid UPI ID (e.g. name@upi)'); return; }
    setUpiSaving(true);
    setUpiError('');
    try {
      const method = await billingApi.saveUpi(vpa);
      setMethods(prev => [...prev, method]);
      setUpiInput('');
    } catch (err: any) {
      setUpiError(err?.message ?? 'Failed to save UPI');
    } finally {
      setUpiSaving(false);
    }
  }

  async function handleSetupCard() {
    setCardSetting(true);
    setCardError('');
    try {
      // Ensure script is ready before fetching the order
      await waitForRazorpay();
      const order = await billingApi.setupCard();
      const RazorpayClass = (window as any).Razorpay;
      if (!RazorpayClass) throw new Error('Razorpay not available after load');

      const rzp = new RazorpayClass({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'DigiCertificates',
        description: 'Save card (₹1 auth charge)',
        order_id: order.razorpay_order_id,
        theme: { color: '#3ECF8E' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const method = await billingApi.savePaymentMethod({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              method_type: 'card',
            });
            setMethods(prev => [...prev, method]);
            setCardSetting(false);
          } catch {
            setCardError('Card saved but failed to record — contact support.');
            setCardSetting(false);
          }
        },
        modal: { ondismiss: () => setCardSetting(false) },
      });
      rzp.on('payment.failed', () => { setCardError('Card setup failed. Please try again.'); setCardSetting(false); });
      rzp.open();
    } catch (err: any) {
      setCardError(err?.message ?? 'Failed to start card setup');
      setCardSetting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await billingApi.deletePaymentMethod(id);
      setMethods(prev => prev.filter(m => m.id !== id));
    } catch { /* non-fatal */ } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden sticky top-4">
      <div className="px-5 py-4 border-b border-border/60">
        <h2 className="font-semibold">Payment Methods</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Used for auto-pay when invoices are generated</p>
      </div>

      {/* Saved methods */}
      <div className="px-5 pt-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : methods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-6 text-center">
            <CreditCard className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-xs text-muted-foreground">No payment methods saved</p>
          </div>
        ) : (
          methods.map(m => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3 group">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                {METHOD_ICONS[m.method_type] ?? <CreditCard className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{methodLabel(m)}</p>
                {methodSub(m) && <p className="text-xs text-muted-foreground">{methodSub(m)}</p>}
              </div>
              {m.is_default && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                  <CheckCircle2 className="w-2.5 h-2.5" />Default
                </span>
              )}
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-30"
              >
                {deletingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add method */}
      <div className="px-5 py-4">
        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border/60 overflow-hidden mb-3 text-xs font-medium">
          {(['card', 'upi'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setCardError(''); setUpiError(''); }}
              className={`flex-1 py-1.5 transition-colors ${tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'card' ? '+ Credit / Debit Card' : '+ UPI / VPA'}
            </button>
          ))}
        </div>

        {tab === 'card' && (
          <div className="space-y-2">
            <button
              onClick={handleSetupCard}
              disabled={cardSetting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cardSetting ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : <><Plus className="w-4 h-4" /> Add Card via Razorpay</>}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">₹1 refundable auth charge · Secured by Razorpay</p>
            {cardError && <ErrorMsg>{cardError}</ErrorMsg>}
          </div>
        )}

        {tab === 'upi' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={upiInput}
                onChange={e => setUpiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveUpi()}
                placeholder="yourname@upi"
                className="flex-1 text-sm border border-border rounded-xl px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500/50 font-mono"
              />
              <button
                onClick={handleSaveUpi}
                disabled={upiSaving || !upiInput.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-50"
              >
                {upiSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
            {upiError && <ErrorMsg>{upiError}</ErrorMsg>}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
