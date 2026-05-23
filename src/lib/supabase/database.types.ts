export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_ip_hash: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          severity: string
        }
        Insert: {
          action: string
          actor_ip_hash?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          severity?: string
        }
        Update: {
          action?: string
          actor_ip_hash?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "app_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          organization_id: string
          payload: Json
          queued_at: string
          requested_by_user_id: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          payload?: Json
          queued_at?: string
          requested_by_user_id: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          queued_at?: string
          requested_by_user_id?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_credits_debits: {
        Row: {
          amount_paise: number
          applied_to_invoice_id: string | null
          created_at: string
          id: string
          organization_id: string
          reason: string
        }
        Insert: {
          amount_paise: number
          applied_to_invoice_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          reason: string
        }
        Update: {
          amount_paise?: number
          applied_to_invoice_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credits_debits_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_credits_debits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_credits_debits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_credits_debits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_invoice_items: {
        Row: {
          amount_paise: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          item_type: Database["public"]["Enums"]["billing_line_item_type"]
          metadata: Json
          quantity: number
          tax_paise: number
          unit_price_paise: number
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          item_type: Database["public"]["Enums"]["billing_line_item_type"]
          metadata?: Json
          quantity?: number
          tax_paise: number
          unit_price_paise: number
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          item_type?: Database["public"]["Enums"]["billing_line_item_type"]
          metadata?: Json
          quantity?: number
          tax_paise?: number
          unit_price_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_due_paise: number
          amount_paid_paise: number
          bill_to: Json
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          organization_id: string
          pdf_file_id: string | null
          period_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_payment_link_id: string | null
          razorpay_payment_link_url: string | null
          seller_snapshot: Json
          status: Database["public"]["Enums"]["billing_invoice_status"]
          subtotal_paise: number
          tax_paise: number
          total_paise: number
          updated_at: string
        }
        Insert: {
          amount_due_paise?: number
          amount_paid_paise?: number
          bill_to?: Json
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          organization_id: string
          pdf_file_id?: string | null
          period_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_payment_link_id?: string | null
          razorpay_payment_link_url?: string | null
          seller_snapshot?: Json
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
        }
        Update: {
          amount_due_paise?: number
          amount_paid_paise?: number
          bill_to?: Json
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          organization_id?: string
          pdf_file_id?: string | null
          period_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_payment_link_id?: string | null
          razorpay_payment_link_url?: string | null
          seller_snapshot?: Json
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_invoices_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_orders: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          notes: Json
          organization_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id: string
          receipt: string | null
          status: Database["public"]["Enums"]["billing_order_status"]
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: Json
          organization_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id: string
          receipt?: string | null
          status?: Database["public"]["Enums"]["billing_order_status"]
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: Json
          organization_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id?: string
          receipt?: string | null
          status?: Database["public"]["Enums"]["billing_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_payments: {
        Row: {
          amount_paise: number
          authorized_at: string | null
          captured_at: string | null
          contact: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          invoice_id: string | null
          method: string | null
          organization_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          raw: Json
          razorpay_order_id: string | null
          razorpay_payment_id: string
          status: Database["public"]["Enums"]["billing_payment_status"]
        }
        Insert: {
          amount_paise: number
          authorized_at?: string | null
          captured_at?: string | null
          contact?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          invoice_id?: string | null
          method?: string | null
          organization_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          raw?: Json
          razorpay_order_id?: string | null
          razorpay_payment_id: string
          status: Database["public"]["Enums"]["billing_payment_status"]
        }
        Update: {
          amount_paise?: number
          authorized_at?: string | null
          captured_at?: string | null
          contact?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          invoice_id?: string | null
          method?: string | null
          organization_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          raw?: Json
          razorpay_order_id?: string | null
          razorpay_payment_id?: string
          status?: Database["public"]["Enums"]["billing_payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_periods: {
        Row: {
          created_at: string
          currency: string
          gst_rate_bps: number
          id: string
          organization_id: string
          per_certificate_fee_paise: number
          period_end: string
          period_start: string
          platform_fee_monthly_paise: number
          platform_fee_waived: boolean
          status: Database["public"]["Enums"]["billing_period_status"]
        }
        Insert: {
          created_at?: string
          currency?: string
          gst_rate_bps: number
          id?: string
          organization_id: string
          per_certificate_fee_paise: number
          period_end: string
          period_start: string
          platform_fee_monthly_paise: number
          platform_fee_waived?: boolean
          status?: Database["public"]["Enums"]["billing_period_status"]
        }
        Update: {
          created_at?: string
          currency?: string
          gst_rate_bps?: number
          id?: string
          organization_id?: string
          per_certificate_fee_paise?: number
          period_end?: string
          period_start?: string
          platform_fee_monthly_paise?: number
          platform_fee_waived?: boolean
          status?: Database["public"]["Enums"]["billing_period_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_price_books: {
        Row: {
          created_at: string
          currency: string
          gst_rate_bps: number
          id: string
          is_active: boolean
          is_default: boolean
          key: string
          name: string
          per_authentix_email_paise: number
          per_certificate_fee_paise: number
          per_own_email_paise: number
          platform_fee_monthly_paise: number
        }
        Insert: {
          created_at?: string
          currency?: string
          gst_rate_bps: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          key: string
          name: string
          per_authentix_email_paise?: number
          per_certificate_fee_paise: number
          per_own_email_paise?: number
          platform_fee_monthly_paise: number
        }
        Update: {
          created_at?: string
          currency?: string
          gst_rate_bps?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          key?: string
          name?: string
          per_authentix_email_paise?: number
          per_certificate_fee_paise?: number
          per_own_email_paise?: number
          platform_fee_monthly_paise?: number
        }
        Relationships: []
      }
      billing_provider_events: {
        Row: {
          event_name: string
          id: string
          is_signature_valid: boolean
          organization_id: string | null
          payload: Json
          payload_hash: string
          processed_at: string | null
          processing_error: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          received_at: string
          signature_header: string | null
          status: Database["public"]["Enums"]["provider_event_status"]
        }
        Insert: {
          event_name: string
          id?: string
          is_signature_valid?: boolean
          organization_id?: string | null
          payload: Json
          payload_hash: string
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          received_at?: string
          signature_header?: string | null
          status?: Database["public"]["Enums"]["provider_event_status"]
        }
        Update: {
          event_name?: string
          id?: string
          is_signature_valid?: boolean
          organization_id?: string | null
          payload?: Json
          payload_hash?: string
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          received_at?: string
          signature_header?: string | null
          status?: Database["public"]["Enums"]["provider_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_refunds: {
        Row: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          organization_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          raw: Json
          razorpay_payment_id: string
          razorpay_refund_id: string
          status: Database["public"]["Enums"]["billing_refund_status"]
        }
        Insert: {
          amount_paise: number
          created_at?: string
          currency?: string
          id?: string
          organization_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          raw?: Json
          razorpay_payment_id: string
          razorpay_refund_id: string
          status: Database["public"]["Enums"]["billing_refund_status"]
        }
        Update: {
          amount_paise?: number
          created_at?: string
          currency?: string
          id?: string
          organization_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          raw?: Json
          razorpay_payment_id?: string
          razorpay_refund_id?: string
          status?: Database["public"]["Enums"]["billing_refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      billing_usage_events: {
        Row: {
          amount_paise: number
          certificate_id: string | null
          created_at: string
          event_type: string
          gst_rate_bps: number
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          period_id: string | null
          quantity: number
          tax_paise: number
          unit_price_paise: number
        }
        Insert: {
          amount_paise: number
          certificate_id?: string | null
          created_at?: string
          event_type: string
          gst_rate_bps: number
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          period_id?: string | null
          quantity?: number
          tax_paise: number
          unit_price_paise: number
        }
        Update: {
          amount_paise?: number
          certificate_id?: string | null
          created_at?: string
          event_type?: string
          gst_rate_bps?: number
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          period_id?: string | null
          quantity?: number
          tax_paise?: number
          unit_price_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_usage_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_usage_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificate_verification"
            referencedColumns: ["certificate_id"]
          },
          {
            foreignKeyName: "billing_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_usage_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_logs: {
        Row: {
          broadcast_id: string
          contact_id: string | null
          delivered_at: string | null
          error: string | null
          failed_at: string | null
          id: string
          provider: string
          provider_msg_id: string | null
          queued_at: string
          sent_at: string | null
          status: string
          to_email: string
        }
        Insert: {
          broadcast_id: string
          contact_id?: string | null
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          provider: string
          provider_msg_id?: string | null
          queued_at?: string
          sent_at?: string | null
          status?: string
          to_email: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string | null
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          provider?: string
          provider_msg_id?: string | null
          queued_at?: string
          sent_at?: string | null
          status?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_broadcast_logs_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcast_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bounced_count: number
          clicked_count: number
          complained_count: number
          created_at: string
          created_by: string | null
          delivered_count: number
          email_type: Database["public"]["Enums"]["email_purpose_type"]
          failed_count: number
          from_email: string
          from_name: string | null
          html: string | null
          id: string
          inline_recipients: Json
          integration_id: string | null
          name: string
          opened_count: number
          organization_id: string
          reply_to: string | null
          resend_broadcast_id: string | null
          resend_segment_id: string | null
          resend_topic_id: string | null
          scheduled_at: string | null
          segment_id: string | null
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["broadcast_status"]
          subject: string
          template_id: string | null
          text: string | null
          topic_id: string | null
          total_recipients: number
          unsubscribed_count: number
          updated_at: string
        }
        Insert: {
          bounced_count?: number
          clicked_count?: number
          complained_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          email_type?: Database["public"]["Enums"]["email_purpose_type"]
          failed_count?: number
          from_email: string
          from_name?: string | null
          html?: string | null
          id?: string
          inline_recipients?: Json
          integration_id?: string | null
          name: string
          opened_count?: number
          organization_id: string
          reply_to?: string | null
          resend_broadcast_id?: string | null
          resend_segment_id?: string | null
          resend_topic_id?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          subject: string
          template_id?: string | null
          text?: string | null
          topic_id?: string | null
          total_recipients?: number
          unsubscribed_count?: number
          updated_at?: string
        }
        Update: {
          bounced_count?: number
          clicked_count?: number
          complained_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          email_type?: Database["public"]["Enums"]["email_purpose_type"]
          failed_count?: number
          from_email?: string
          from_name?: string | null
          html?: string | null
          id?: string
          inline_recipients?: Json
          integration_id?: string | null
          name?: string
          opened_count?: number
          organization_id?: string
          reply_to?: string | null
          resend_broadcast_id?: string | null
          resend_segment_id?: string | null
          resend_topic_id?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          subject?: string
          template_id?: string | null
          text?: string | null
          topic_id?: string | null
          total_recipients?: number
          unsubscribed_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "delivery_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "email_broadcasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "email_broadcasts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "email_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "delivery_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "email_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          group_key: string | null
          id: string
          industry_id: string
          key: string
          name: string
          organization_id: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          group_key?: string | null
          id?: string
          industry_id: string
          key: string
          name: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          group_key?: string | null
          id?: string
          industry_id?: string
          key?: string
          name?: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_categories_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      certificate_generation_jobs: {
        Row: {
          background_job_id: string | null
          completed_at: string | null
          created_at: string
          error: Json | null
          id: string
          options: Json | null
          organization_id: string
          requested_by_user_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          background_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          options?: Json | null
          organization_id: string
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          background_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          id?: string
          options?: Json | null
          organization_id?: string
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_generation_jobs_background_job_id_fkey"
            columns: ["background_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_generation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_generation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_generation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_generation_jobs_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_subcategories: {
        Row: {
          category_id: string
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          key: string
          name: string
          organization_id: string | null
          sort_order: number | null
        }
        Insert: {
          category_id: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          key: string
          name: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Update: {
          category_id?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          key?: string
          name?: string
          organization_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "certificate_subcategories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_subcategories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_subcategories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      certificate_template_fields: {
        Row: {
          created_at: string
          field_key: string
          height: number | null
          id: string
          label: string
          page_number: number
          required: boolean
          style: Json | null
          template_version_id: string
          type: Database["public"]["Enums"]["template_field_type"]
          width: number | null
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          field_key: string
          height?: number | null
          id?: string
          label: string
          page_number?: number
          required?: boolean
          style?: Json | null
          template_version_id: string
          type: Database["public"]["Enums"]["template_field_type"]
          width?: number | null
          x: number
          y: number
        }
        Update: {
          created_at?: string
          field_key?: string
          height?: number | null
          id?: string
          label?: string
          page_number?: number
          required?: boolean
          style?: Json | null
          template_version_id?: string
          type?: Database["public"]["Enums"]["template_field_type"]
          width?: number | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_template_fields_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_template_versions: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          normalized_pages: Json | null
          page_count: number
          preview_file_id: string | null
          source_file_id: string
          template_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          normalized_pages?: Json | null
          page_count?: number
          preview_file_id?: string | null
          source_file_id: string
          template_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          normalized_pages?: Json | null
          page_count?: number
          preview_file_id?: string | null
          source_file_id?: string
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_template_versions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_template_versions_preview_file_id_fkey"
            columns: ["preview_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_template_versions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          category_id: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          embedding: string | null
          id: string
          latest_version_id: string | null
          organization_id: string
          subcategory_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          latest_version_id?: string | null
          organization_id: string
          subcategory_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          latest_version_id?: string | null
          organization_id?: string
          subcategory_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "certificate_templates_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "fk_templates_latest_version"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_verification_events: {
        Row: {
          certificate_id: string
          device_type: string | null
          geo_city: string | null
          geo_country: string | null
          id: string
          ip_hash: string | null
          ip_partial: string | null
          metadata: Json | null
          organization_id: string
          referrer: string | null
          result: Database["public"]["Enums"]["verification_result"]
          scanned_at: string
          user_agent: string | null
        }
        Insert: {
          certificate_id: string
          device_type?: string | null
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_hash?: string | null
          ip_partial?: string | null
          metadata?: Json | null
          organization_id: string
          referrer?: string | null
          result: Database["public"]["Enums"]["verification_result"]
          scanned_at?: string
          user_agent?: string | null
        }
        Update: {
          certificate_id?: string
          device_type?: string | null
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_hash?: string | null
          ip_partial?: string | null
          metadata?: Json | null
          organization_id?: string
          referrer?: string | null
          result?: Database["public"]["Enums"]["verification_result"]
          scanned_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_verification_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_verification_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificate_verification"
            referencedColumns: ["certificate_id"]
          },
          {
            foreignKeyName: "certificate_verification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_verification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificate_verification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      certificates: {
        Row: {
          archive_path: string | null
          archived_at: string | null
          category_id: string
          certificate_file_id: string | null
          certificate_number: string
          certificate_preview_file_id: string | null
          contact_id: string | null
          created_at: string
          expires_at: string | null
          generation_job_id: string
          id: string
          issued_at: string
          organization_id: string
          qr_payload_url: string
          recipient_data: Json
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          reissued_from_certificate_id: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          subcategory_id: string
          template_id: string
          template_version_id: string
          validity_interval: string | null
          verification_path: string
          verification_token_hash: string
        }
        Insert: {
          archive_path?: string | null
          archived_at?: string | null
          category_id: string
          certificate_file_id?: string | null
          certificate_number: string
          certificate_preview_file_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          generation_job_id: string
          id?: string
          issued_at?: string
          organization_id: string
          qr_payload_url: string
          recipient_data?: Json
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          reissued_from_certificate_id?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          subcategory_id: string
          template_id: string
          template_version_id: string
          validity_interval?: string | null
          verification_path: string
          verification_token_hash: string
        }
        Update: {
          archive_path?: string | null
          archived_at?: string | null
          category_id?: string
          certificate_file_id?: string | null
          certificate_number?: string
          certificate_preview_file_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          generation_job_id?: string
          id?: string
          issued_at?: string
          organization_id?: string
          qr_payload_url?: string
          recipient_data?: Json
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          reissued_from_certificate_id?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          subcategory_id?: string
          template_id?: string
          template_version_id?: string
          validity_interval?: string | null
          verification_path?: string
          verification_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "certificates_certificate_file_id_fkey"
            columns: ["certificate_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_certificate_preview_file_id_fkey"
            columns: ["certificate_preview_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificates_reissued_from_certificate_id_fkey"
            columns: ["reissued_from_certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_reissued_from_certificate_id_fkey"
            columns: ["reissued_from_certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificate_verification"
            referencedColumns: ["certificate_id"]
          },
          {
            foreignKeyName: "certificates_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_segments: {
        Row: {
          contact_id: string
          segment_id: string
        }
        Insert: {
          contact_id: string
          segment_id: string
        }
        Update: {
          contact_id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_segment_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_segment_contacts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "email_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          certificates_issued: number
          created_at: string
          deleted_at: string | null
          email: string | null
          email_type_prefs: Json
          embedding: string | null
          first_name: string | null
          id: string
          last_cert_category: string | null
          last_cert_issued_at: string | null
          last_email_clicked_at: string | null
          last_email_opened_at: string | null
          last_name: string | null
          organization_id: string
          properties: Json
          resend_audience_id: string | null
          resend_contact_id: string | null
          source: string | null
          source_ref: string | null
          total_emails_opened: number
          total_emails_received: number
          unsubscribed: boolean
          updated_at: string
        }
        Insert: {
          certificates_issued?: number
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_type_prefs?: Json
          embedding?: string | null
          first_name?: string | null
          id?: string
          last_cert_category?: string | null
          last_cert_issued_at?: string | null
          last_email_clicked_at?: string | null
          last_email_opened_at?: string | null
          last_name?: string | null
          organization_id: string
          properties?: Json
          resend_audience_id?: string | null
          resend_contact_id?: string | null
          source?: string | null
          source_ref?: string | null
          total_emails_opened?: number
          total_emails_received?: number
          unsubscribed?: boolean
          updated_at?: string
        }
        Update: {
          certificates_issued?: number
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_type_prefs?: Json
          embedding?: string | null
          first_name?: string | null
          id?: string
          last_cert_category?: string | null
          last_cert_issued_at?: string | null
          last_email_clicked_at?: string | null
          last_email_opened_at?: string | null
          last_name?: string | null
          organization_id?: string
          properties?: Json
          resend_audience_id?: string | null
          resend_contact_id?: string | null
          source?: string | null
          source_ref?: string | null
          total_emails_opened?: number
          total_emails_received?: number
          unsubscribed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "email_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      delivery_email_events: {
        Row: {
          bounce_type: string | null
          broadcast_id: string | null
          click_url: string | null
          complaint_type: string | null
          contact_id: string | null
          event_type: Database["public"]["Enums"]["email_event_type"]
          id: string
          message_id: string | null
          organization_id: string | null
          provider: string
          provider_message_id: string | null
          raw_payload: Json
          received_at: string
        }
        Insert: {
          bounce_type?: string | null
          broadcast_id?: string | null
          click_url?: string | null
          complaint_type?: string | null
          contact_id?: string | null
          event_type?: Database["public"]["Enums"]["email_event_type"]
          id?: string
          message_id?: string | null
          organization_id?: string | null
          provider: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at?: string
        }
        Update: {
          bounce_type?: string | null
          broadcast_id?: string | null
          click_url?: string | null
          complaint_type?: string | null
          contact_id?: string | null
          event_type?: Database["public"]["Enums"]["email_event_type"]
          id?: string
          message_id?: string | null
          organization_id?: string | null
          provider?: string
          provider_message_id?: string | null
          raw_payload?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_email_events_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_email_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_email_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "delivery_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_email_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_email_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_email_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      delivery_integration_secrets: {
        Row: {
          created_at: string
          integration_id: string
          secret_type: Database["public"]["Enums"]["delivery_secret_type"]
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          integration_id: string
          secret_type: Database["public"]["Enums"]["delivery_secret_type"]
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          integration_id?: string
          secret_type?: Database["public"]["Enums"]["delivery_secret_type"]
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "delivery_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_integrations: {
        Row: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          config: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string
          from_email: string | null
          from_name: string | null
          id: string
          is_active: boolean
          is_default: boolean
          organization_id: string
          provider: string
          reply_to: string | null
          track_clicks: boolean
          track_opens: boolean
          unsubscribe_url: string | null
          updated_at: string
          whatsapp_phone_number: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_waba_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          organization_id: string
          provider: string
          reply_to?: string | null
          track_clicks?: boolean
          track_opens?: boolean
          unsubscribe_url?: string | null
          updated_at?: string
          whatsapp_phone_number?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_waba_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["delivery_channel"]
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          organization_id?: string
          provider?: string
          reply_to?: string | null
          track_clicks?: boolean
          track_opens?: boolean
          unsubscribe_url?: string | null
          updated_at?: string
          whatsapp_phone_number?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      delivery_message_items: {
        Row: {
          attachment_file_id: string | null
          certificate_id: string
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          attachment_file_id?: string | null
          certificate_id: string
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          attachment_file_id?: string | null
          certificate_id?: string
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_message_items_attachment_file_id_fkey"
            columns: ["attachment_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_message_items_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_message_items_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificate_verification"
            referencedColumns: ["certificate_id"]
          },
          {
            foreignKeyName: "delivery_message_items_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "delivery_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_messages: {
        Row: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          generation_job_id: string
          id: string
          organization_id: string
          provider: string | null
          provider_message_id: string | null
          queued_at: string
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          to_email: string | null
          to_phone: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          generation_job_id: string
          id?: string
          organization_id: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          read_at?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          to_email?: string | null
          to_phone?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          generation_job_id?: string
          id?: string
          organization_id?: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          read_at?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          to_email?: string | null
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_messages_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "generation_job_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_provider_webhook_events: {
        Row: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          provider: string
          provider_message_id: string | null
          received_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          event_type: string
          id?: string
          organization_id?: string | null
          payload: Json
          provider: string
          provider_message_id?: string | null
          received_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["delivery_channel"]
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          provider?: string
          provider_message_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_provider_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_provider_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_provider_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      delivery_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at: string
          email_subject: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          published_at: string | null
          resend_template_id: string | null
          template_type: string
          updated_at: string
          variables: Json
          whatsapp_language: string | null
          whatsapp_template_name: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          email_subject?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          published_at?: string | null
          resend_template_id?: string | null
          template_type?: string
          updated_at?: string
          variables?: Json
          whatsapp_language?: string | null
          whatsapp_template_name?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["delivery_channel"]
          created_at?: string
          email_subject?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          published_at?: string | null
          resend_template_id?: string | null
          template_type?: string
          updated_at?: string
          variables?: Json
          whatsapp_language?: string | null
          whatsapp_template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      email_segments: {
        Row: {
          contact_count: number
          created_at: string
          filters: Json
          id: string
          name: string
          organization_id: string
          resend_segment_id: string | null
          updated_at: string
        }
        Insert: {
          contact_count?: number
          created_at?: string
          filters?: Json
          id?: string
          name: string
          organization_id: string
          resend_segment_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_count?: number
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          organization_id?: string
          resend_segment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "email_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      email_topics: {
        Row: {
          created_at: string
          default_subscription: Database["public"]["Enums"]["topic_default_subscription"]
          description: string | null
          email_type: Database["public"]["Enums"]["email_topic_type"]
          id: string
          name: string
          organization_id: string
          resend_topic_id: string | null
          visibility: Database["public"]["Enums"]["topic_visibility"]
        }
        Insert: {
          created_at?: string
          default_subscription?: Database["public"]["Enums"]["topic_default_subscription"]
          description?: string | null
          email_type?: Database["public"]["Enums"]["email_topic_type"]
          id?: string
          name: string
          organization_id: string
          resend_topic_id?: string | null
          visibility?: Database["public"]["Enums"]["topic_visibility"]
        }
        Update: {
          created_at?: string
          default_subscription?: Database["public"]["Enums"]["topic_default_subscription"]
          description?: string | null
          email_type?: Database["public"]["Enums"]["email_topic_type"]
          id?: string
          name?: string
          organization_id?: string
          resend_topic_id?: string | null
          visibility?: Database["public"]["Enums"]["topic_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "email_topics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_topics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "email_topics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      file_import_jobs: {
        Row: {
          category_id: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string | null
          error: Json | null
          failed_count: number
          id: string
          mapping: Json | null
          organization_id: string
          row_count: number | null
          source_file_id: string | null
          source_format: string | null
          status: Database["public"]["Enums"]["import_status"]
          subcategory_id: string | null
          success_count: number
          template_id: string | null
          template_version_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          error?: Json | null
          failed_count?: number
          id?: string
          mapping?: Json | null
          organization_id: string
          row_count?: number | null
          source_file_id?: string | null
          source_format?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          subcategory_id?: string | null
          success_count?: number
          template_id?: string | null
          template_version_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          error?: Json | null
          failed_count?: number
          id?: string
          mapping?: Json | null
          organization_id?: string
          row_count?: number | null
          source_file_id?: string | null
          source_format?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          subcategory_id?: string | null
          success_count?: number
          template_id?: string | null
          template_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_import_jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "file_import_jobs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "file_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "file_import_jobs_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "file_import_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_import_jobs_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      file_import_rows: {
        Row: {
          canonical_hash: string | null
          created_at: string
          data: Json
          errors: Json | null
          id: string
          import_job_id: string
          ingestion_contract_version: number
          row_index: number
          status: Database["public"]["Enums"]["import_status"]
        }
        Insert: {
          canonical_hash?: string | null
          created_at?: string
          data: Json
          errors?: Json | null
          id?: string
          import_job_id: string
          ingestion_contract_version?: number
          row_index: number
          status?: Database["public"]["Enums"]["import_status"]
        }
        Update: {
          canonical_hash?: string | null
          created_at?: string
          data?: Json
          errors?: Json | null
          id?: string
          import_job_id?: string
          ingestion_contract_version?: number
          row_index?: number
          status?: Database["public"]["Enums"]["import_status"]
        }
        Relationships: [
          {
            foreignKeyName: "file_import_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "file_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          archive_path: string | null
          archived_at: string | null
          bucket: string
          checksum_sha256: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          exported_at: string | null
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          organization_id: string
          original_name: string | null
          path: string
          retention_days: number | null
          size_bytes: number | null
        }
        Insert: {
          archive_path?: string | null
          archived_at?: string | null
          bucket?: string
          checksum_sha256?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          exported_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          organization_id: string
          original_name?: string | null
          path: string
          retention_days?: number | null
          size_bytes?: number | null
        }
        Update: {
          archive_path?: string | null
          archived_at?: string | null
          bucket?: string
          checksum_sha256?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          exported_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          organization_id?: string
          original_name?: string | null
          path?: string
          retention_days?: number | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "files_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      generation_job_recipients: {
        Row: {
          created_at: string
          id: string
          job_id: string
          recipient_data: Json
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          recipient_data?: Json
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          recipient_data?: Json
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_job_recipients_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_job_templates: {
        Row: {
          category_id: string
          id: string
          job_id: string
          subcategory_id: string
          template_id: string
          template_version_id: string
        }
        Insert: {
          category_id: string
          id?: string
          job_id: string
          subcategory_id: string
          template_id: string
          template_version_id: string
        }
        Update: {
          category_id?: string
          id?: string
          job_id?: string
          subcategory_id?: string
          template_id?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_job_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_job_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "generation_job_templates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_job_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_job_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "generation_job_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_job_templates_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          organization_id: string
          response_body: Json | null
          response_headers: Json | null
          status: Database["public"]["Enums"]["idempotency_status"]
          status_code: number | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          key: string
          organization_id: string
          response_body?: Json | null
          response_headers?: Json | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          status_code?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          organization_id?: string
          response_body?: Json | null
          response_headers?: Json | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          status_code?: number | null
        }
        Relationships: []
      }
      industries: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      integration_mappings: {
        Row: {
          created_at: string
          default_value: string | null
          id: string
          integration_id: string
          is_required: boolean
          organization_id: string
          source_field: string
          target_entity: Database["public"]["Enums"]["mapping_target_entity"]
          target_field: string
          transform_fn: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          id?: string
          integration_id: string
          is_required?: boolean
          organization_id: string
          source_field: string
          target_entity: Database["public"]["Enums"]["mapping_target_entity"]
          target_field: string
          transform_fn?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          id?: string
          integration_id?: string
          is_required?: boolean
          organization_id?: string
          source_field?: string
          target_entity?: Database["public"]["Enums"]["mapping_target_entity"]
          target_field?: string
          transform_fn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "delivery_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "integration_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      integration_syncs: {
        Row: {
          completed_at: string | null
          created_at: string
          cursor_value: string | null
          error_message: string | null
          id: string
          integration_id: string
          metadata: Json
          organization_id: string
          records_failed: number | null
          records_processed: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["sync_status"]
          sync_type: Database["public"]["Enums"]["sync_type"]
          triggered_by_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cursor_value?: string | null
          error_message?: string | null
          id?: string
          integration_id: string
          metadata?: Json
          organization_id: string
          records_failed?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_status"]
          sync_type?: Database["public"]["Enums"]["sync_type"]
          triggered_by_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cursor_value?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string
          metadata?: Json
          organization_id?: string
          records_failed?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_status"]
          sync_type?: Database["public"]["Enums"]["sync_type"]
          triggered_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_syncs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "delivery_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_syncs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_syncs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "integration_syncs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_category_overrides: {
        Row: {
          base_category_id: string
          color_override: string | null
          created_at: string
          id: string
          is_hidden: boolean
          name_override: string | null
          organization_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          base_category_id: string
          color_override?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean
          name_override?: string | null
          organization_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          base_category_id?: string
          color_override?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean
          name_override?: string | null
          organization_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_category_overrides_base_category_id_fkey"
            columns: ["base_category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_category_overrides_base_category_id_fkey"
            columns: ["base_category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "organization_category_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_category_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_category_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_user_id: string
          organization_id: string
          role_id: string
          status: Database["public"]["Enums"]["invite_status"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_user_id: string
          organization_id: string
          role_id: string
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string
          organization_id?: string
          role_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "organization_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          organization_id: string
          role_id: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id: string
          role_id: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id?: string
          role_id?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "organization_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_pricing_overrides: {
        Row: {
          created_at: string
          effective_from: string
          gst_rate_bps: number | null
          id: string
          notes: string | null
          organization_id: string
          per_certificate_fee_paise: number | null
          platform_fee_monthly_paise: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          gst_rate_bps?: number | null
          id?: string
          notes?: string | null
          organization_id: string
          per_certificate_fee_paise?: number | null
          platform_fee_monthly_paise?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          gst_rate_bps?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          per_certificate_fee_paise?: number | null
          platform_fee_monthly_paise?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_pricing_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_pricing_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_pricing_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          key: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_stats: {
        Row: {
          organization_id: string
          pending_jobs: number
          revoked_certificates: number
          total_certificates: number
          updated_at: string
          verifications_today: number
          verifications_total: number
        }
        Insert: {
          organization_id: string
          pending_jobs?: number
          revoked_certificates?: number
          total_certificates?: number
          updated_at?: string
          verifications_today?: number
          verifications_total?: number
        }
        Update: {
          organization_id?: string
          pending_jobs?: number
          revoked_certificates?: number
          total_certificates?: number
          updated_at?: string
          verifications_today?: number
          verifications_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_subcategory_overrides: {
        Row: {
          base_subcategory_id: string
          color_override: string | null
          created_at: string
          id: string
          is_hidden: boolean
          name_override: string | null
          organization_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          base_subcategory_id: string
          color_override?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean
          name_override?: string | null
          organization_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          base_subcategory_id?: string
          color_override?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean
          name_override?: string | null
          organization_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subcategory_overrides_base_subcategory_id_fkey"
            columns: ["base_subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subcategory_overrides_base_subcategory_id_fkey"
            columns: ["base_subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "organization_subcategory_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subcategory_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_subcategory_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          api_key_hash: string
          application_id: string
          billing_address: Json
          billing_address_line1: string | null
          billing_city: string | null
          billing_country: string | null
          billing_currency: string
          billing_email: string | null
          billing_grace_ends_at: string | null
          billing_period_start: string | null
          billing_postal_code: string | null
          billing_state_province: string | null
          billing_status: Database["public"]["Enums"]["organization_billing_status"]
          certificate_number_format: string
          certificate_prefix: string
          certificate_seq: number
          cin: string | null
          city: string | null
          country: string | null
          created_at: string
          dashboard_locked_at: string | null
          deleted_at: string | null
          email: string | null
          gst_rate_bps_default: number
          gstin: string | null
          id: string
          industry_id: string | null
          invoice_digits: number
          invoice_seq: number
          legal_name: string | null
          logo_file_id: string | null
          name: string
          org_type: string | null
          per_certificate_fee_paise_default: number
          phone: string | null
          platform_fee_monthly_paise_default: number
          platform_fee_waived: boolean
          postal_code: string | null
          slug: string
          state_province: string | null
          tax_id: string | null
          trial_ends_at: string | null
          trial_free_certificates_limit: number
          trial_free_certificates_used: number
          trial_started_at: string
          updated_at: string
          verification_message: string | null
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          api_key_hash: string
          application_id: string
          billing_address?: Json
          billing_address_line1?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_currency?: string
          billing_email?: string | null
          billing_grace_ends_at?: string | null
          billing_period_start?: string | null
          billing_postal_code?: string | null
          billing_state_province?: string | null
          billing_status?: Database["public"]["Enums"]["organization_billing_status"]
          certificate_number_format?: string
          certificate_prefix?: string
          certificate_seq?: number
          cin?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dashboard_locked_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_rate_bps_default?: number
          gstin?: string | null
          id?: string
          industry_id?: string | null
          invoice_digits?: number
          invoice_seq?: number
          legal_name?: string | null
          logo_file_id?: string | null
          name: string
          org_type?: string | null
          per_certificate_fee_paise_default?: number
          phone?: string | null
          platform_fee_monthly_paise_default?: number
          platform_fee_waived?: boolean
          postal_code?: string | null
          slug: string
          state_province?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          trial_free_certificates_limit?: number
          trial_free_certificates_used?: number
          trial_started_at?: string
          updated_at?: string
          verification_message?: string | null
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          api_key_hash?: string
          application_id?: string
          billing_address?: Json
          billing_address_line1?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_currency?: string
          billing_email?: string | null
          billing_grace_ends_at?: string | null
          billing_period_start?: string | null
          billing_postal_code?: string | null
          billing_state_province?: string | null
          billing_status?: Database["public"]["Enums"]["organization_billing_status"]
          certificate_number_format?: string
          certificate_prefix?: string
          certificate_seq?: number
          cin?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dashboard_locked_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_rate_bps_default?: number
          gstin?: string | null
          id?: string
          industry_id?: string | null
          invoice_digits?: number
          invoice_seq?: number
          legal_name?: string | null
          logo_file_id?: string | null
          name?: string
          org_type?: string | null
          per_certificate_fee_paise_default?: number
          phone?: string | null
          platform_fee_monthly_paise_default?: number
          platform_fee_waived?: boolean
          postal_code?: string | null
          slug?: string
          state_province?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          trial_free_certificates_limit?: number
          trial_free_certificates_used?: number
          trial_started_at?: string
          updated_at?: string
          verification_message?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_events: {
        Row: {
          actor_id: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          event_version: number
          exported_at: string | null
          id: string
          occurred_at: string
          organization_id: string
          payload: Json
          request_id: string | null
          trace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          event_version?: number
          exported_at?: string | null
          id?: string
          occurred_at?: string
          organization_id: string
          payload?: Json
          request_id?: string | null
          trace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          event_version?: number
          exported_at?: string | null
          id?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          request_id?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "platform_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      razorpay_customers: {
        Row: {
          autopay_enabled: boolean
          created_at: string
          id: string
          organization_id: string
          razorpay_customer_id: string
          updated_at: string
        }
        Insert: {
          autopay_enabled?: boolean
          created_at?: string
          id?: string
          organization_id: string
          razorpay_customer_id: string
          updated_at?: string
        }
        Update: {
          autopay_enabled?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          razorpay_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "razorpay_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      razorpay_payment_methods: {
        Row: {
          card_expiry_month: number | null
          card_expiry_year: number | null
          card_last4: string | null
          card_name: string | null
          card_network: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          method_type: string
          organization_id: string
          razorpay_customer_id: string
          razorpay_token_id: string | null
          updated_at: string
          upi_vpa: string | null
        }
        Insert: {
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_last4?: string | null
          card_name?: string | null
          card_network?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          method_type: string
          organization_id: string
          razorpay_customer_id: string
          razorpay_token_id?: string | null
          updated_at?: string
          upi_vpa?: string | null
        }
        Update: {
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_last4?: string | null
          card_name?: string | null
          card_network?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          method_type?: string
          organization_id?: string
          razorpay_customer_id?: string
          razorpay_token_id?: string | null
          updated_at?: string
          upi_vpa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "razorpay_payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          organization_id: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          organization_id: string
          retention_days: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          organization_id?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "organization_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_usage_history: {
        Row: {
          certificates_count: number | null
          created_at: string
          field_snapshot: Json | null
          generation_job_id: string | null
          id: string
          last_used_at: string
          organization_id: string
          template_id: string
          template_version_id: string | null
          updated_at: string
          usage_type: Database["public"]["Enums"]["template_usage_type"]
          user_id: string
        }
        Insert: {
          certificates_count?: number | null
          created_at?: string
          field_snapshot?: Json | null
          generation_job_id?: string | null
          id?: string
          last_used_at?: string
          organization_id: string
          template_id: string
          template_version_id?: string | null
          updated_at?: string
          usage_type: Database["public"]["Enums"]["template_usage_type"]
          user_id: string
        }
        Update: {
          certificates_count?: number | null
          created_at?: string
          field_snapshot?: Json | null
          generation_job_id?: string | null
          id?: string
          last_used_at?: string
          organization_id?: string
          template_id?: string
          template_version_id?: string | null
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["template_usage_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_usage_history_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "template_usage_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      billing_provider_events_safe: {
        Row: {
          event_name: string | null
          id: string | null
          is_signature_valid: boolean | null
          organization_id: string | null
          processed_at: string | null
          processing_error: string | null
          provider: Database["public"]["Enums"]["billing_provider"] | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          received_at: string | null
          status: Database["public"]["Enums"]["provider_event_status"] | null
        }
        Insert: {
          event_name?: string | null
          id?: string | null
          is_signature_valid?: boolean | null
          organization_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"] | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["provider_event_status"] | null
        }
        Update: {
          event_name?: string | null
          id?: string | null
          is_signature_valid?: boolean | null
          organization_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"] | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          received_at?: string | null
          status?: Database["public"]["Enums"]["provider_event_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "billing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_certificate_verification: {
        Row: {
          category_name: string | null
          certificate_id: string | null
          certificate_number: string | null
          certificate_preview_file_id: string | null
          expires_at: string | null
          issued_at: string | null
          logo_bucket: string | null
          logo_file_id: string | null
          logo_path: string | null
          organization_id: string | null
          organization_name: string | null
          organization_slug: string | null
          preview_bucket: string | null
          preview_path: string | null
          qr_payload_url: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          revoked_at: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["certificate_status"] | null
          subcategory_name: string | null
          verification_path: string | null
          verification_token_hash: string | null
          website_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_certificate_preview_file_id_fkey"
            columns: ["certificate_preview_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "certificates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_effective_categories: {
        Row: {
          category_id: string | null
          group_key: string | null
          is_hidden: boolean | null
          is_org_custom: boolean | null
          key: string | null
          name: string | null
          organization_id: string | null
          sort_order: number | null
        }
        Relationships: []
      }
      v_effective_subcategories: {
        Row: {
          category_id: string | null
          is_hidden: boolean | null
          is_org_custom: boolean | null
          key: string | null
          name: string | null
          organization_id: string | null
          sort_order: number | null
          subcategory_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      v_template_usage_recent: {
        Row: {
          category_id: string | null
          category_name: string | null
          certificates_count: number | null
          created_at: string | null
          field_snapshot: Json | null
          generation_job_id: string | null
          id: string | null
          last_used_at: string | null
          organization_id: string | null
          preview_bucket: string | null
          preview_file_id: string | null
          preview_path: string | null
          source_bucket: string | null
          source_file_id: string | null
          source_mime_type: string | null
          source_path: string | null
          subcategory_id: string | null
          subcategory_name: string | null
          template_id: string | null
          template_title: string | null
          template_version_id: string | null
          updated_at: string | null
          usage_type: Database["public"]["Enums"]["template_usage_type"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_template_versions_preview_file_id_fkey"
            columns: ["preview_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_template_versions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certificate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "certificate_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "certificate_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["subcategory_id"]
          },
          {
            foreignKeyName: "template_usage_history_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "certificate_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_categories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "template_usage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_effective_subcategories"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "template_usage_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      append_audit_log: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_entity_id: string
          p_entity_type: string
          p_metadata: Json
          p_org_id: string
          p_severity: string
        }
        Returns: undefined
      }
      apply_payment_to_invoice: {
        Args: {
          p_amount_paise: number
          p_invoice_id: string
          p_payment_ref?: string
        }
        Returns: undefined
      }
      assert_period_open: { Args: { p_period_id: string }; Returns: undefined }
      can_issue_certificate: { Args: { p_org_id: string }; Returns: boolean }
      create_invoice_for_period: {
        Args: { p_org_id: string; p_period_start: string }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      custom_access_token: { Args: { event: Json }; Returns: Json }
      ensure_billing_period: {
        Args: { p_org_id: string; p_period_start: string }
        Returns: string
      }
      ensure_billing_periods_for_month: {
        Args: { p_period_start: string }
        Returns: number
      }
      ensure_org_stats: { Args: { p_org_id: string }; Returns: undefined }
      find_similar_templates: {
        Args: { p_embedding: string; p_limit?: number; p_org_id: string }
        Returns: {
          similarity: number
          template_id: string
          template_title: string
        }[]
      }
      get_category_mix: {
        Args: { p_org_id: string }
        Returns: {
          category_id: string
          count: number
          subcategory_id: string
        }[]
      }
      get_daily_series: {
        Args: { p_org_id: string; p_start: string }
        Returns: {
          day: string
          issued: number
          revoked: number
          scans: number
        }[]
      }
      get_dashboard_stats: { Args: { p_org_id: string }; Returns: Json }
      get_org_effective_pricing: {
        Args: { p_at?: string; p_org_id: string }
        Returns: {
          currency: string
          gst_rate_bps: number
          per_certificate_fee_paise: number
          platform_fee_monthly_paise: number
          platform_fee_waived: boolean
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      get_verification_certificate_count: {
        Args: { p_org_id: string; p_search?: string }
        Returns: number
      }
      get_verification_certificate_summary: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_search?: string
        }
        Returns: {
          certificate_id: string
          certificate_number: string
          expired_count: number
          invalid_count: number
          issued_at: string
          last_verified_at: string
          not_found_count: number
          recipient_email: string
          recipient_name: string
          revoked_count: number
          total_count: number
          valid_count: number
        }[]
      }
      is_member_of_org: { Args: { org_id: string }; Returns: boolean }
      list_industries: {
        Args: never
        Returns: {
          created_at: string
          id: string
          key: string
          name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "industries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_expired_certificates: { Args: never; Returns: number }
      next_certificate_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      next_invoice_number:
        | { Args: { p_org_id: string }; Returns: string }
        | { Args: { p_year: number }; Returns: string }
      pgmq_archive: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      pgmq_delete: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      pgmq_read: {
        Args: { p_qty?: number; p_queue: string; p_vt: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_send: { Args: { p_message: Json; p_queue: string }; Returns: number }
      recompute_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_certificate_usage_event: {
        Args: {
          p_certificate_id: string
          p_occurred_at?: string
          p_org_id: string
          p_quantity?: number
        }
        Returns: string
      }
      revoke_certificate: {
        Args: {
          p_certificate_id: string
          p_reason: string
          p_revoked_by: string
        }
        Returns: undefined
      }
      sha256_hex: { Args: { input: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_api_key: { Args: { provided_key: string }; Returns: string }
      verify_certificate: {
        Args: { token: string }
        Returns: {
          certificate_id: string
          company_logo: string
          company_name: string
          course_name: string
          expiry_date: string
          issued_at: string
          recipient_name: string
          result: string
          status: string
        }[]
      }
      verify_certificate_enhanced: {
        Args: { p_token: string }
        Returns: {
          category_name: string
          certificate_id: string
          certificate_number: string
          course_name: string
          expires_at: string
          issued_at: string
          organization_id: string
          organization_logo_bucket: string
          organization_logo_path: string
          organization_name: string
          organization_slug: string
          organization_website: string
          preview_bucket: string
          preview_path: string
          recipient_email: string
          recipient_name: string
          result: string
          revoked_at: string
          revoked_reason: string
          status: string
          subcategory_name: string
        }[]
      }
    }
    Enums: {
      billing_invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "partially_paid"
        | "void"
        | "expired"
        | "refunded"
        | "pending"
      billing_line_item_type:
        | "platform_fee"
        | "certificate_usage"
        | "adjustment"
      billing_order_status:
        | "created"
        | "paid"
        | "attempted"
        | "failed"
        | "cancelled"
      billing_payment_status:
        | "created"
        | "authorized"
        | "captured"
        | "failed"
        | "refunded"
      billing_period_status: "open" | "locked" | "invoiced" | "paid" | "void"
      billing_provider: "razorpay"
      billing_refund_status: "created" | "processed" | "failed"
      broadcast_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "sent"
        | "failed"
        | "cancelled"
      certificate_status: "issued" | "expired" | "revoked" | "reissued"
      delivery_channel: "email" | "whatsapp"
      delivery_secret_type:
        | "whatsapp_access_token"
        | "whatsapp_webhook_verify_token"
        | "smtp_password"
        | "email_api_key"
        | "aws_secret_key"
      delivery_status: "queued" | "sent" | "delivered" | "read" | "failed"
      email_event_type:
        | "sent"
        | "delivered"
        | "delivery_delayed"
        | "bounced"
        | "complained"
        | "opened"
        | "clicked"
        | "unsubscribed"
        | "failed"
        | "scheduled"
        | "contact_created"
        | "contact_updated"
        | "contact_deleted"
        | "domain_created"
        | "domain_updated"
        | "domain_deleted"
        | "unknown"
      email_purpose_type:
        | "transactional"
        | "promotional"
        | "lifecycle"
        | "newsletter"
        | "personal"
      email_topic_type:
        | "transactional"
        | "promotional"
        | "lifecycle"
        | "newsletter"
        | "personal"
      file_kind:
        | "template_source"
        | "template_preview"
        | "import_source"
        | "certificate_pdf"
        | "certificate_preview"
        | "zip_bundle"
        | "org_logo"
        | "other"
        | "certificate_image"
      idempotency_status: "processing" | "completed"
      import_status: "queued" | "processing" | "completed" | "failed"
      invite_status: "pending" | "accepted" | "expired" | "revoked"
      job_status: "queued" | "running" | "completed" | "failed" | "cancelled"
      job_type:
        | "certificate_generation"
        | "delivery_send"
        | "batch_certificate_generation"
      mapping_target_entity:
        | "contact"
        | "certificate"
        | "template"
        | "campaign"
        | "import"
      member_status: "invited" | "active" | "suspended"
      organization_billing_status:
        | "trialing"
        | "active"
        | "past_due"
        | "disabled"
      provider_event_status:
        | "received"
        | "verified"
        | "processed"
        | "ignored"
        | "failed"
      segment_filter_match: "all" | "any"
      sync_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      sync_type: "full" | "incremental" | "on_demand"
      template_field_type: "text" | "date" | "qrcode" | "custom" | "image"
      template_status: "draft" | "active" | "archived"
      template_usage_type: "generated" | "in_progress"
      topic_default_subscription: "opt_in" | "opt_out"
      topic_visibility: "public" | "private"
      verification_result:
        | "valid"
        | "invalid"
        | "revoked"
        | "expired"
        | "not_found"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      billing_invoice_status: [
        "draft",
        "issued",
        "paid",
        "partially_paid",
        "void",
        "expired",
        "refunded",
        "pending",
      ],
      billing_line_item_type: [
        "platform_fee",
        "certificate_usage",
        "adjustment",
      ],
      billing_order_status: [
        "created",
        "paid",
        "attempted",
        "failed",
        "cancelled",
      ],
      billing_payment_status: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
      ],
      billing_period_status: ["open", "locked", "invoiced", "paid", "void"],
      billing_provider: ["razorpay"],
      billing_refund_status: ["created", "processed", "failed"],
      broadcast_status: [
        "draft",
        "scheduled",
        "sending",
        "sent",
        "failed",
        "cancelled",
      ],
      certificate_status: ["issued", "expired", "revoked", "reissued"],
      delivery_channel: ["email", "whatsapp"],
      delivery_secret_type: [
        "whatsapp_access_token",
        "whatsapp_webhook_verify_token",
        "smtp_password",
        "email_api_key",
        "aws_secret_key",
      ],
      delivery_status: ["queued", "sent", "delivered", "read", "failed"],
      email_event_type: [
        "sent",
        "delivered",
        "delivery_delayed",
        "bounced",
        "complained",
        "opened",
        "clicked",
        "unsubscribed",
        "failed",
        "scheduled",
        "contact_created",
        "contact_updated",
        "contact_deleted",
        "domain_created",
        "domain_updated",
        "domain_deleted",
        "unknown",
      ],
      email_purpose_type: [
        "transactional",
        "promotional",
        "lifecycle",
        "newsletter",
        "personal",
      ],
      email_topic_type: [
        "transactional",
        "promotional",
        "lifecycle",
        "newsletter",
        "personal",
      ],
      file_kind: [
        "template_source",
        "template_preview",
        "import_source",
        "certificate_pdf",
        "certificate_preview",
        "zip_bundle",
        "org_logo",
        "other",
        "certificate_image",
      ],
      idempotency_status: ["processing", "completed"],
      import_status: ["queued", "processing", "completed", "failed"],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      job_status: ["queued", "running", "completed", "failed", "cancelled"],
      job_type: [
        "certificate_generation",
        "delivery_send",
        "batch_certificate_generation",
      ],
      mapping_target_entity: [
        "contact",
        "certificate",
        "template",
        "campaign",
        "import",
      ],
      member_status: ["invited", "active", "suspended"],
      organization_billing_status: [
        "trialing",
        "active",
        "past_due",
        "disabled",
      ],
      provider_event_status: [
        "received",
        "verified",
        "processed",
        "ignored",
        "failed",
      ],
      segment_filter_match: ["all", "any"],
      sync_status: ["pending", "running", "completed", "failed", "cancelled"],
      sync_type: ["full", "incremental", "on_demand"],
      template_field_type: ["text", "date", "qrcode", "custom", "image"],
      template_status: ["draft", "active", "archived"],
      template_usage_type: ["generated", "in_progress"],
      topic_default_subscription: ["opt_in", "opt_out"],
      topic_visibility: ["public", "private"],
      verification_result: [
        "valid",
        "invalid",
        "revoked",
        "expired",
        "not_found",
      ],
    },
  },
} as const
