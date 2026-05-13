'use client';

import { useState, useEffect, useCallback } from 'react';
import { billingApi, type PaymentMethod } from '@/lib/api/billing';

interface PaymentMethodsCardProps {
  organizationId: string;
}

export function PaymentMethodsCard({ organizationId: _ }: PaymentMethodsCardProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [upiInput, setUpiInput] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiError, setUpiError] = useState('');
  const [cardSetting, setCardSetting] = useState(false);
  const [cardError, setCardError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMethods = useCallback(async () => {
    try {
      const list = await billingApi.listPaymentMethods();
      setMethods(list);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  async function handleSaveUpi() {
    const vpa = upiInput.trim();
    if (!vpa) return;
    if (!vpa.includes('@')) { setUpiError('Enter a valid UPI VPA (e.g. name@upi)'); return; }
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
      const order = await billingApi.setupCard();
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        setCardError('Razorpay not loaded — please refresh and try again.');
        return;
      }
      const rzp = new Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'DigiCertificates',
        description: 'Add payment method (₹1 auth charge, refunded)',
        order_id: order.razorpay_order_id,
        theme: { color: '#3ECF8E' },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const method = await billingApi.savePaymentMethod({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              method_type: 'card',
            });
            setMethods(prev => [...prev, method]);
          } catch {
            setCardError('Card saved by Razorpay but failed to record — please contact support.');
          }
        },
        modal: {
          ondismiss: () => setCardSetting(false),
        },
      });
      rzp.on('payment.failed', () => {
        setCardError('Card setup failed. Please try again.');
        setCardSetting(false);
      });
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
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">Payment Methods</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saved methods are used for auto-pay when invoices are generated.
        </p>
      </div>

      {/* Saved methods */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      ) : methods.length > 0 ? (
        <div className="space-y-2">
          {methods.map(m => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{m.method_type === 'upi' ? '📱' : '💳'}</span>
                <div>
                  <p className="text-sm font-medium">{m.display_name}</p>
                  {m.upi_vpa && <p className="text-xs text-muted-foreground font-mono">{m.upi_vpa}</p>}
                  {m.card_last4 && (
                    <p className="text-xs text-muted-foreground">
                      {m.card_network} ···· {m.card_last4}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.is_default && (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    Default
                  </span>
                )}
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  {deletingId === m.id ? '…' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No payment methods saved yet.</p>
      )}

      {/* Add UPI */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add UPI</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={upiInput}
            onChange={e => { setUpiInput(e.target.value); setUpiError(''); }}
            placeholder="yourname@upi"
            className="flex-1 h-9 text-sm border border-border rounded-md px-3 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/40 font-mono"
            onKeyDown={e => { if (e.key === 'Enter') handleSaveUpi(); }}
          />
          <button
            onClick={handleSaveUpi}
            disabled={upiSaving || !upiInput.trim()}
            className="h-9 px-4 rounded-md text-sm font-semibold bg-[#3ECF8E] text-white hover:bg-[#34b87a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {upiSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {upiError && <p className="text-xs text-destructive">{upiError}</p>}
      </div>

      {/* Add Card */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Card</p>
        <button
          onClick={handleSetupCard}
          disabled={cardSetting}
          className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold border border-border bg-muted/30 hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💳 {cardSetting ? 'Opening payment…' : 'Add Debit / Credit Card'}
        </button>
        <p className="text-[11px] text-muted-foreground">
          A ₹1 authorisation charge is made and immediately refunded. Your card details are stored securely by Razorpay.
        </p>
        {cardError && <p className="text-xs text-destructive">{cardError}</p>}
      </div>
    </div>
  );
}
