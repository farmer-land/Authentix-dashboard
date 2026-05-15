"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Upload,
  FileCheck,
  Shield,
  Settings,
  Users,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Building2,
  Sparkles,
  CreditCard,
  Mail,
  UserRound,
  Filter,
  Megaphone,
  Activity,
} from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { OrgProvider } from "@/lib/org";
import { NotificationPanel } from "@/components/dashboard/NotificationPanel";
import { JobNotificationProvider } from "@/lib/notifications/job-notifications";
import { BillingStatusBanner } from "@/components/dashboard/BillingStatusBanner";

// ============================================================================
// Types
// ============================================================================

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
}

interface OrganizationData {
  name: string;
  logo: string | null;
}

interface DashboardShellProps {
  children: React.ReactNode;
  slug: string;
  initialUser: UserData | null;
  initialOrganization: OrganizationData | null;
}

interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

type Theme = "light" | "dark" | "system";

// ============================================================================
// Constants
// ============================================================================

const NAVIGATION_ITEMS: readonly NavItem[] = [
  { name: "Analytics", href: "", icon: LayoutDashboard },
  { name: "Certificate Templates", href: "/templates", icon: FileText },
  { name: "Generate", href: "/generate-certificate", icon: Sparkles },
  { name: "Imports", href: "/imports", icon: Upload },
  { name: "Certificates", href: "/certificates", icon: FileCheck },
  { name: "Verification", href: "/verification-logs", icon: Shield },
  { name: "Email Templates", href: "/email-templates", icon: Mail },
  { name: "Contacts", href: "/contacts", icon: UserRound },
  { name: "Segments", href: "/segments", icon: Filter },
  { name: "Broadcasts", href: "/broadcasts", icon: Megaphone },
  { name: "Delivery Events", href: "/delivery-events", icon: Activity },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

const THEME_CYCLE: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

// ============================================================================
// Sub-components
// ============================================================================

interface SidebarNavProps {
  readonly slug: string;
  readonly pathname: string;
  readonly expanded: boolean;
  readonly pendingJobsCount: number;
}

function SidebarNav({ slug, pathname, expanded, pendingJobsCount }: SidebarNavProps) {
  const basePath = `/dashboard/org/${slug}`;

  return (
    <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
      {NAVIGATION_ITEMS.map((item) => {
        const fullHref = item.href ? `${basePath}${item.href}` : basePath;
        const isActive =
          item.href === ""
            ? pathname === basePath
            : pathname.startsWith(fullHref);
        const Icon = item.icon;
        const showBadge = item.name === "Imports" && pendingJobsCount > 0;

        return (
          <Link
            key={item.name}
            href={fullHref}
            className={cn(
              "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              expanded ? "px-3" : "justify-center",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-primary"
            )}
            title={!expanded ? item.name : undefined}
          >
            <div className="relative shrink-0">
              <Icon className="h-4.5 w-4.5" />
              {showBadge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-background" />
              )}
            </div>
            {expanded && <span className="whitespace-nowrap flex-1">{item.name}</span>}
            {expanded && showBadge && (
              <span className="ml-auto text-[10px] font-bold bg-amber-400/15 text-amber-500 rounded-full px-1.5 py-0.5 leading-none">
                {pendingJobsCount > 99 ? "99+" : pendingJobsCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

interface ThemeButtonProps {
  readonly theme: Theme;
  readonly onCycle: () => void;
  readonly expanded: boolean;
}

function ThemeButton({ theme, onCycle, expanded }: ThemeButtonProps) {
  const Icon = theme === "dark" ? Sun : theme === "light" ? Moon : Monitor;
  const label =
    theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

  return (
    <button
      onClick={onCycle}
      className={cn(
        "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium w-full",
        expanded ? "px-3" : "justify-center",
        "text-muted-foreground hover:text-primary"
      )}
      aria-label={`Switch theme (currently ${label})`}
    >
      <Icon className="h-4.5 w-4.5" />
      {expanded && <span>{label}</span>}
    </button>
  );
}

interface UserMenuProps {
  readonly user: UserData | null;
  readonly profileName: string;
  readonly organizationName: string;
  readonly organizationLogo: string | null;
  readonly slug: string;
  readonly onLogout: () => void;
  readonly mounted: boolean;
  readonly expanded: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function UserMenu({
  user,
  profileName,
  organizationName,
  organizationLogo,
  slug,
  onLogout,
  mounted,
  expanded,
  onOpenChange,
}: UserMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium w-full hover:opacity-80 transition-opacity",
            expanded ? "px-3" : "justify-center"
          )}
          aria-label="User menu"
          disabled={!mounted}
        >
          {!mounted ? (
            <div className="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold overflow-hidden shrink-0 text-xs">
                {organizationLogo ? (
                  <img
                    src={organizationLogo}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (profileName || "U").charAt(0).toUpperCase()
                )}
              </div>
              {expanded && (
                <div className="text-left min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{profileName || "User"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {organizationName || "Organization"}
                  </p>
                </div>
              )}
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{profileName}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/org/${slug}/organization`}>
            <Building2 className="mr-2 h-4 w-4" />
            Organization
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DashboardShell({
  children,
  slug,
  initialUser,
  initialOrganization,
}: DashboardShellProps) {
  // State
  const [mounted, setMounted] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [pendingJobsCount, setPendingJobsCount] = useState(0);

  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Derived values
  const profileName =
    initialUser?.full_name ?? initialUser?.email?.split("@")[0] ?? "User";
  const organizationName = initialOrganization?.name ?? "Organization";
  const organizationLogo = initialOrganization?.logo ?? null;

  // Mounted effect for hydration safety
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch pending jobs count for sidebar badge — poll every 30s while any are running
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const data = await api.dashboard.getStats();
        if (!cancelled) setPendingJobsCount(data.stats.pendingJobs ?? 0);
      } catch { /* silent */ }
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Theme initialization (client-only)
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const currentTheme = savedTheme ?? "system";

    setTheme(currentTheme);
    document.documentElement.classList.toggle(
      "dark",
      currentTheme === "dark" || (currentTheme === "system" && prefersDark)
    );
  }, []);

  // Callbacks
  const handleSetTheme = useCallback((value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    document.documentElement.classList.toggle(
      "dark",
      value === "dark" || (value === "system" && prefersDark)
    );
  }, []);

  const handleCycleTheme = useCallback(() => {
    handleSetTheme(THEME_CYCLE[theme]);
  }, [theme, handleSetTheme]);

  const handleLogout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Continue with logout even if API fails
    }
    // Wipe all cached query data so the next user never sees stale cross-org data
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }, [router, queryClient]);

  const isExpanded = sidebarExpanded || dropdownOpen || notificationOpen;

  return (
    <OrgProvider slug={slug}>
    <JobNotificationProvider>
      <div className="min-h-screen bg-background">
        <OnboardingModal />

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-0 left-0 z-60 h-screen bg-card border-r rounded-tr-2xl rounded-br-2xl transition-all duration-300",
            isExpanded ? "w-52" : "w-14"
          )}
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="h-14 flex items-center justify-center border-b px-2">
              <Link
                href={`/dashboard/org/${slug}`}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-lg bg-card border flex items-center justify-center shrink-0">
                  <Image
                    src="/brand/authentix-24-24.svg"
                    width={18}
                    height={18}
                    alt="Authentix"
                    priority
                  />
                </div>
                {isExpanded && (
                  <span className="font-bold text-base whitespace-nowrap">
                    Authentix
                  </span>
                )}
              </Link>
            </div>

            {/* Navigation */}
            <SidebarNav
              slug={slug}
              pathname={pathname}
              expanded={isExpanded}
              pendingJobsCount={pendingJobsCount}
            />

            {/* Bottom actions */}
            <div className="p-2 border-t space-y-0.5">
              {/* Notifications */}
              <NotificationPanel expanded={isExpanded} onOpenChange={setNotificationOpen} />

              {/* User profile */}
              <UserMenu
                user={initialUser}
                profileName={profileName}
                organizationName={organizationName}
                organizationLogo={organizationLogo}
                slug={slug}
                onLogout={handleLogout}
                mounted={mounted}
                expanded={isExpanded}
                onOpenChange={setDropdownOpen}
              />

              <ThemeButton
                theme={theme}
                onCycle={handleCycleTheme}
                expanded={isExpanded}
              />
              <button
                onClick={handleLogout}
                className={cn(
                  "flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium w-full",
                  isExpanded ? "px-3" : "justify-center",
                  "text-muted-foreground hover:text-destructive"
                )}
              >
                <LogOut className="h-4.5 w-4.5" />
                {isExpanded && <span>Logout</span>}
              </button>
            </div>
          </div>
        </aside>

        {/* Main content — sits to the right of the sidebar, no top header */}
        <div className="pl-14">
          <BillingStatusBanner />
          <main className="p-6">
            <div className="max-w-350 mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </JobNotificationProvider>
    </OrgProvider>
  );
}
