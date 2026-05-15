/**
 * Shared organization types used across API client and components.
 * Avoids repeating the same inline type shape in multiple API method signatures.
 */

export interface OrganizationLogoFields {
  logo_file_id?: string | null;
  logo_bucket?: string | null;
  logo_path?: string | null;
  logo_url?: string | null;
  /** Nested structure returned by some endpoints */
  logo?: {
    bucket?: string | null;
    path?: string | null;
  } | null;
}

export interface Organization extends OrganizationLogoFields {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  industry_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  gst_number: string | null;
  cin_number: string | null;
  // Billing-specific address fields (may differ from org address)
  billing_email?: string | null;
  billing_currency?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_country?: string | null;
  billing_postal_code?: string | null;
  verification_message?: string | null;
  created_at: string;
  updated_at: string;
}
