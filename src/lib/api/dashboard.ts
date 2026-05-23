/**
 * DASHBOARD DOMAIN API
 *
 * Dashboard stats and analytics — fetched directly from Supabase.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const dashboardApi = {
  getStats: async (orgId: string) => {
    const supabase = createSupabaseBrowserClient();
    const startISO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [
      statsResult,
      dailyResult,
      categoryMixResult,
      importsResult,
      verificationsResult,
      categoriesResult,
      subcategoriesResult,
    ] = await Promise.all([
      supabase.rpc("get_dashboard_stats", { p_org_id: orgId }),
      supabase.rpc("get_daily_series", { p_org_id: orgId, p_start: startISO }),
      supabase.rpc("get_category_mix", { p_org_id: orgId }),
      supabase
        .from("file_import_jobs")
        .select("id, status, row_count, created_at, source_file:source_file_id(id, original_name, path)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("certificate_verification_events")
        .select("id, result, scanned_at, certificates:certificate_id(recipient_name, certificate_number)")
        .eq("organization_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(5),
      supabase
        .from("v_effective_categories")
        .select("category_id, name")
        .eq("organization_id", orgId),
      supabase
        .from("v_effective_subcategories")
        .select("subcategory_id, name")
        .eq("organization_id", orgId),
    ]);

    // Stats
    const rawStats = statsResult.data as {
      total_certificates?: number;
      pending_jobs?: number;
      verifications_today?: number;
      revoked_certificates?: number;
      verification_events_total?: number;
    } | null;

    const stats = {
      totalCertificates: rawStats?.total_certificates ?? 0,
      pendingJobs: rawStats?.pending_jobs ?? 0,
      verificationsToday: rawStats?.verifications_today ?? 0,
      revokedCertificates: rawStats?.revoked_certificates ?? 0,
      verificationEventsTotal: rawStats?.verification_events_total ?? 0,
    };

    // Daily series
    const rawDaily = (dailyResult.data ?? []) as Array<{
      day: string;
      issued: number;
      revoked: number;
      scans: number;
    }>;
    const certificatesDaily = rawDaily.map((d) => ({
      date: d.day,
      issued: d.issued,
      revoked: d.revoked,
      verificationScans: d.scans,
    }));

    // Category mix with name lookup
    const rawMix = (categoryMixResult.data ?? []) as Array<{
      category_id: string;
      subcategory_id: string;
      count: number;
    }>;
    const catMap = new Map<string, string>(
      (categoriesResult.data ?? []).map((r) => [r.category_id ?? "", r.name ?? ""])
    );
    const subcatMap = new Map<string, string>(
      (subcategoriesResult.data ?? []).map((r) => [r.subcategory_id ?? "", r.name ?? ""])
    );
    const certificateCategoryMix = rawMix.map((r) => ({
      categoryId: r.category_id ?? null,
      subcategoryId: r.subcategory_id ?? null,
      categoryName: catMap.get(r.category_id) ?? r.category_id ?? "Unknown",
      subcategoryName: subcatMap.get(r.subcategory_id) ?? r.subcategory_id ?? "Unknown",
      count: r.count,
    }));

    // Recent imports
    const rawImports = (importsResult.data ?? []) as Array<{
      id: string;
      status: string;
      row_count: number | null;
      created_at: string;
      source_file: { id: string; original_name: string | null; path: string } | null;
    }>;
    const recentImports = rawImports.map((i) => ({
      id: i.id,
      file_name: i.source_file?.original_name ?? null,
      status: i.status,
      total_rows: i.row_count ?? 0,
      created_at: i.created_at,
    }));

    // Recent verifications
    const rawVerifs = (verificationsResult.data ?? []) as Array<{
      id: string;
      result: string;
      scanned_at: string;
      certificates: { recipient_name: string | null; certificate_number: string | null } | null;
    }>;
    const recentVerifications = rawVerifs.map((v) => ({
      id: v.id,
      result: v.result,
      verified_at: v.scanned_at,
      certificate: v.certificates
        ? {
            recipient_name: v.certificates.recipient_name ?? null,
            course_name: v.certificates.certificate_number ?? null,
          }
        : null,
    }));

    return {
      stats,
      recentImports,
      recentVerifications,
      certificatesDaily,
      certificateCategoryMix,
    };
  },
};
