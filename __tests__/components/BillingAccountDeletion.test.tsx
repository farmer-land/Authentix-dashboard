/**
 * Billing — account-deletion failure handling (GARDEN-11)
 *
 * Before the fix, DeleteAccountDialog's `onConfirm` prop (which calls
 * `api.billing.requestAccountDeletion()`) and `handleConfirm` had no `catch`
 * around the `await`. A rejected API call became an unhandled promise
 * rejection: the "Deleting…" spinner just stopped with zero user feedback,
 * with nothing to prove the dialog even stayed open on purpose.
 *
 * Covers:
 *  - a failed deletion request surfaces a visible toast.error with the
 *    server's failure reason
 *  - the dialog stays open (still on the interactive confirm step) after a
 *    failure, so the user can retry — not stuck on a spinner forever
 *  - a subsequent successful attempt still works (closes the dialog), so the
 *    fix does not regress the happy path
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  requestAccountDeletion: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { alt, ...rest } = props as any;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img alt={alt ?? ''} {...rest} />;
  },
}));

vi.mock('@/lib/razorpay', () => ({ preloadRazorpay: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'acme' }),
}));

vi.mock('@/lib/billing-ui/hooks/use-invoice-list', () => ({
  useInvoiceList: () => ({ invoices: [], loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/lib/hooks/queries/billing', () => ({
  useBillingOverview: () => ({
    overview: {
      billing_profile: {
        plan_name: 'Farm',
        platform_fee_amount: 499,
        certificate_unit_price: 10,
        broadcast_email_unit_price: 0.2,
        broadcast_email_quota: 2000,
        gst_rate: 18,
        gst_inclusive: true,
        currency: 'INR',
      },
      current_usage: {
        certificate_count: 10,
        platform_fee: 499,
        usage_cost: 100,
        broadcast_email_count: 0,
        broadcast_email_cost: 0,
        subtotal: 599,
        gst_amount: 107.82,
        estimated_total: 706.82,
        currency: 'INR',
        gst_rate: 18,
      },
      org_billing: {
        billing_status: 'active',
        trial_ends_at: null,
        trial_free_certificates_limit: 0,
        trial_free_certificates_used: 0,
        dashboard_locked_at: null,
        billing_grace_ends_at: null,
        last_active_at: null,
        hibernated_since: null,
      },
      billing_caps: { cert_cap_monthly: 200, contact_cap: 3000, auto_topup_certs: false, topup_block_size: 100 },
      recent_invoices: [],
      total_outstanding: 0,
      is_product_owner: false,
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/queries/organizations', () => ({
  useOrganization: () => ({
    organization: { id: 'org-1', name: 'Acme Certs', slug: 'acme', email: 'ops@acme.test' },
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/hooks/queries/users', () => ({
  useUserProfile: () => ({
    profile: { email: 'ops@acme.test' },
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    billing: {
      requestAccountDeletion: mocks.requestAccountDeletion,
      updateCaps: vi.fn(),
    },
  },
}));

import BillingPage from '@/app/dashboard/org/[slug]/billing/page';

beforeEach(() => {
  mocks.requestAccountDeletion.mockReset();
  mocks.toastError.mockClear();
  mocks.toastSuccess.mockClear();
});

async function openConfirmStep() {
  render(<BillingPage />);
  fireEvent.click(screen.getByRole('button', { name: /request deletion/i }));
  fireEvent.click(await screen.findByRole('button', { name: /i understand, continue/i }));
  const input = await screen.findByPlaceholderText('delete');
  fireEvent.change(input, { target: { value: 'delete' } });
}

describe('Billing — account deletion failure handling', () => {
  it('shows a visible toast error and keeps the dialog open when deletion fails', async () => {
    mocks.requestAccountDeletion.mockRejectedValue(new Error('Outstanding balance must be cleared first'));
    await openConfirmStep();

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Outstanding balance must be cleared first');
    });

    // Dialog must still be open — the confirm step's button is still present.
    expect(screen.getByRole('button', { name: /^delete account$/i })).toBeInTheDocument();
    // No unhandled rejection escaped: the button is enabled again (confirming reset to false).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^delete account$/i })).not.toBeDisabled();
    });
  });

  it('falls back to a generic message when the rejection has no Error message', async () => {
    mocks.requestAccountDeletion.mockRejectedValue('network blip');
    await openConfirmStep();

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to request account deletion. Please try again.');
    });
  });

  it('still closes the dialog on a successful deletion (no regression)', async () => {
    mocks.requestAccountDeletion.mockResolvedValue(undefined);
    await openConfirmStep();

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^delete account$/i })).not.toBeInTheDocument();
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
