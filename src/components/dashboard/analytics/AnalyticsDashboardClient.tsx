"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  endOfDay,
  format,
  isWithinInterval,
  startOfDay,
  subDays,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  CartesianGrid,
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Line,
  Brush,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import {
  Award,
  FileText,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ScanLine,
  AlertTriangle,
  Download,
  RefreshCw,
  CalendarClock,
  Mail,
  Loader2,
  Maximize2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api/client"
import type { EmailBroadcast } from "@/lib/api/client"
import type { Certificate } from "@/lib/api/client"

// ── Types ────────────────────────────────────────────────────────────────────

type DashboardStats = {
  totalCertificates: number
  pendingJobs: number
  verificationsToday: number
  revokedCertificates: number
  verificationEventsTotal: number
}

type RecentImport = {
  id: string
  file_name?: string | null
  status: string
  total_rows: number | null
  created_at: string
}

type RecentVerification = {
  id: string
  result?: string | null
  verified_at: string
  certificate?: {
    recipient_name?: string | null
    course_name?: string | null
    [key: string]: unknown
  } | null
}

type CertificateDailyPoint = {
  date: string
  issued: number
  revoked: number
  verificationScans: number
}

type CertificateCategoryMixRow = {
  categoryId: string | null
  subcategoryId: string | null
  categoryName: string
  subcategoryName: string
  count: number
}

type DashboardData = {
  stats: DashboardStats
  recentImports: RecentImport[]
  recentVerifications: RecentVerification[]
  certificatesDaily: CertificateDailyPoint[]
  certificateCategoryMix: CertificateCategoryMixRow[]
}

export interface AnalyticsDashboardClientProps {
  slug: string
  initialData: DashboardData | null
}

type RangePreset = "today" | "week" | "month" | "custom"

// ── Utilities ────────────────────────────────────────────────────────────────

function getTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function orgPath(slug: string, path: string): string {
  return `/dashboard/org/${slug}${path}`
}

function formatRangeLabel(preset: RangePreset, custom?: DateRange): string {
  if (preset === "today") return "Today"
  if (preset === "week") return "Last 7 days"
  if (preset === "month") return "Last 30 days"
  if (preset === "custom" && custom?.from && custom?.to)
    return `${format(custom.from, "MMM d")} – ${format(custom.to, "MMM d, yyyy")}`
  if (preset === "custom" && custom?.from && !custom?.to)
    return `${format(custom.from, "MMM d, yyyy")} – …`
  return "Custom range"
}

function toInterval(preset: RangePreset, custom?: DateRange): { start: Date; end: Date } {
  const today = new Date()
  const end = endOfDay(today)
  if (preset === "today") return { start: startOfDay(today), end }
  if (preset === "week") return { start: startOfDay(subDays(today, 6)), end }
  if (preset === "month") return { start: startOfDay(subDays(today, 29)), end }
  if (custom?.from) return { start: startOfDay(custom.from), end: custom.to ? endOfDay(custom.to) : end }
  return { start: startOfDay(subDays(today, 6)), end }
}

function filterCertificatesDailyByInterval(
  series: CertificateDailyPoint[],
  interval: { start: Date; end: Date }
): CertificateDailyPoint[] {
  const fromStr = interval.start.toISOString().slice(0, 10)
  const toStr = interval.end.toISOString().slice(0, 10)
  return series.filter((r) => r.date >= fromStr && r.date <= toStr)
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

const GRID_STROKE = "rgba(128,128,128,0.12)"

const HEAT_LEVELS = [
  { min: 0, max: 0, bg: "bg-[#ebedf0] dark:bg-[#161b22]", label: "No activity" },
  { min: 1, max: 2, bg: "bg-[#9be9a8] dark:bg-[#0e4429]", label: "1–2" },
  { min: 3, max: 5, bg: "bg-[#40c463] dark:bg-[#006d32]", label: "3–5" },
  { min: 6, max: 10, bg: "bg-[#30a14e] dark:bg-[#26a641]", label: "6–10" },
  { min: 11, max: Infinity, bg: "bg-[#216e39] dark:bg-[#39d353]", label: "11+" },
]

function heatLevel(count: number): string {
  for (const l of HEAT_LEVELS) {
    if (count >= l.min && count <= l.max) return l.bg
  }
  return HEAT_LEVELS[0]!.bg
}

// ── Chart expand modal ────────────────────────────────────────────────────────

function ChartExpandModal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Expand chart"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function ActivityHeatmap({ series }: { series: CertificateDailyPoint[] }) {
  const today = new Date()
  const start = subDays(today, 364)
  const calStart = startOfWeek(start, { weekStartsOn: 0 })
  const calEnd = endOfWeek(today, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const countByDate: Record<string, number> = {}
  for (const pt of series) {
    countByDate[pt.date] = (countByDate[pt.date] ?? 0) + pt.issued
  }

  // Group into weeks (columns)
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const m = week[0]!.getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ label: format(week[0]!, "MMM"), col: wi })
      lastMonth = m
    }
  })

  const totalInYear = Object.values(countByDate).reduce((a, b) => a + b, 0)
  const activeDays = Object.values(countByDate).filter((v) => v > 0).length

  const [tooltip, setTooltip] = React.useState<{ text: string; x: number; y: number } | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Certificate Activity</p>
          <p className="text-xs text-muted-foreground">
            {totalInYear.toLocaleString()} certificates across {activeDays} active days in the last year
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {HEAT_LEVELS.map((l, i) => (
            <div key={i} className={cn("w-3 h-3 rounded-sm", l.bg)} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto flex justify-center">
        <div>
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: 30 }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find((m) => m.col === wi)
            return (
              <div key={wi} className="text-[9px] text-muted-foreground/50 leading-none" style={{ width: 18, flexShrink: 0 }}>
                {label?.label ?? ""}
              </div>
            )
          })}
        </div>

        <div className="flex gap-0">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-1 mr-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <div key={d} className="text-[9px] text-muted-foreground/40 leading-none flex items-center" style={{ height: 14, width: 26 }}>
                {i % 2 === 1 ? d.slice(0, 1) : ""}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className="relative"
            onMouseLeave={() => setTooltip(null)}
          >
            <div className="flex gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day) => {
                    const key = format(day, "yyyy-MM-dd")
                    const count = countByDate[key] ?? 0
                    const isFuture = day > today
                    return (
                      <div
                        key={key}
                        className={cn(
                          "w-3.5 h-3.5 rounded-sm transition-opacity cursor-default",
                          isFuture ? "opacity-0 pointer-events-none" : heatLevel(count),
                          count > 0 && !isFuture && "hover:ring-1 hover:ring-black/20 dark:hover:ring-white/20"
                        )}
                        onMouseEnter={(e) => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect()
                          setTooltip({
                            text: count > 0 ? `${count} certificate${count === 1 ? "" : "s"} on ${format(day, "MMM d, yyyy")}` : `No certificates on ${format(day, "MMM d, yyyy")}`,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          })
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md shadow-lg border border-border/60 whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

type KpiCardProps = {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: string
  trend?: "up" | "down" | "neutral"
  trendLabel?: string
}

function KpiCard({ label, value, sub, icon, accent = NEON.green, trend, trendLabel }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card p-5 flex flex-col gap-3 relative overflow-hidden group">
      {/* Ambient glow */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none transition-opacity group-hover:opacity-[0.09]"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}, transparent 65%)` }} />
      {/* Corner accent */}
      <div className="absolute top-0 left-0 w-5 h-5 border-l-2 border-t-2 rounded-tl-2xl pointer-events-none"
        style={{ borderColor: `${accent}60` }} />

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}15`, boxShadow: `0 0 12px ${accent}20` }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight tabular-nums font-mono"
          style={{ color: accent, textShadow: `0 0 20px ${accent}40` }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {(trend || trendLabel) ? (
          <div className="flex items-center gap-1.5 mt-1">
            {trend === "up" && <ArrowUpRight className="w-3 h-3" style={{ color: NEON.green }} />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3" style={{ color: NEON.rose }} />}
            {trendLabel && <span className="text-[10px] font-mono" style={{ color: trend === "up" ? NEON.green : trend === "down" ? NEON.rose : undefined }}>{trendLabel}</span>}
            {sub && <span className="text-[10px] font-mono text-muted-foreground">{sub}</span>}
          </div>
        ) : sub ? (
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</p>
        ) : null}
      </div>
    </div>
  )
}

// ── Futuristic neon palette ───────────────────────────────────────────────────

const NEON = {
  green:  "#00E5A0",
  blue:   "#38BDF8",
  amber:  "#FBBF24",
  rose:   "#F43F5E",
  purple: "#A78BFA",
}
const NEON_GRID = "rgba(148,163,184,0.07)"

const CHART_COLORS = {
  issued: NEON.green,
  verificationScans: NEON.blue,
}

// ── Certificates & Verifications spline chart (stock-market style) ─────────────

function MainAreaChart({ series, rangeLabel }: { series: CertificateDailyPoint[]; rangeLabel: string }) {
  const totals = React.useMemo(
    () => ({
      issued: series.reduce((a, r) => a + r.issued, 0),
      verificationScans: series.reduce((a, r) => a + r.verificationScans, 0),
    }),
    [series]
  )

  const chartConfig: ChartConfig = {
    issued: { label: "Certificates", color: NEON.green },
    verificationScans: { label: "Verifications", color: NEON.blue },
  }

  const SplineTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const date = label ? new Date(String(label)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""
    return (
      <div className="rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl px-4 py-3 shadow-2xl text-xs font-mono min-w-[140px]">
        <p className="text-slate-400 mb-2 text-[10px] tracking-widest uppercase">{date}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-6 mb-1">
            <span className="flex items-center gap-1.5" style={{ color: p.color }}>
              <span className="w-1 h-3 rounded-full inline-block" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
              {p.name === "issued" ? "GEN" : "VRF"}
            </span>
            <span className="font-bold text-white">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card overflow-hidden relative">
      {/* Sci-fi corner accents */}
      <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 rounded-tl-2xl pointer-events-none" style={{ borderColor: `${NEON.green}50` }} />
      <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 rounded-tr-2xl pointer-events-none" style={{ borderColor: `${NEON.blue}50` }} />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 rounded-bl-2xl pointer-events-none" style={{ borderColor: `${NEON.green}30` }} />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 rounded-br-2xl pointer-events-none" style={{ borderColor: `${NEON.blue}30` }} />

      {/* Header */}
      <div className="grid grid-cols-3 border-b border-white/5">
        <div className="px-6 py-4">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.15em] mb-1">ANALYTICS · {rangeLabel.toUpperCase()}</p>
          <p className="text-sm font-semibold tracking-tight">Certificates & Verifications</p>
        </div>
        <div className="px-6 py-4 border-l border-white/5">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] mb-1" style={{ color: NEON.green }}>▲ GENERATED</p>
          <p className="text-2xl font-bold tabular-nums font-mono" style={{ color: NEON.green, textShadow: `0 0 24px ${NEON.green}50` }}>
            {totals.issued.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">certificates issued</p>
        </div>
        <div className="px-6 py-4 border-l border-white/5">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] mb-1" style={{ color: NEON.blue }}>◆ VERIFIED</p>
          <p className="text-2xl font-bold tabular-nums font-mono" style={{ color: NEON.blue, textShadow: `0 0 24px ${NEON.blue}50` }}>
            {totals.verificationScans.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">public scans</p>
        </div>
      </div>

      {/* Spline chart */}
      <div className="px-4 pt-4 pb-2">
        {series.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground font-mono text-xs tracking-widest">
            NO DATA IN RANGE
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <ComposedChart data={series} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="spIssued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NEON.green} stopOpacity={0.22} />
                  <stop offset="80%" stopColor={NEON.green} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={NEON.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spVerify" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NEON.blue} stopOpacity={0.18} />
                  <stop offset="80%" stopColor={NEON.blue} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={NEON.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="1 8"
                stroke={NEON_GRID}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fill: "rgba(148,163,184,0.5)", fontFamily: "monospace" }}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(v) => new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              />
              <YAxis
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fill: "rgba(148,163,184,0.4)", fontFamily: "monospace" }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                width={36}
                allowDecimals={false}
              />
              <ChartTooltip content={<SplineTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1, strokeDasharray: "3 4" }} />
              <Area
                dataKey="issued"
                type="natural"
                stroke={NEON.green}
                strokeWidth={2}
                fill="url(#spIssued)"
                dot={false}
                activeDot={{ r: 5, fill: NEON.green, strokeWidth: 0, style: { filter: `drop-shadow(0 0 6px ${NEON.green})` } }}
                style={{ filter: `drop-shadow(0 0 3px ${NEON.green}60)` }}
              />
              <Area
                dataKey="verificationScans"
                type="natural"
                stroke={NEON.blue}
                strokeWidth={2}
                fill="url(#spVerify)"
                dot={false}
                activeDot={{ r: 5, fill: NEON.blue, strokeWidth: 0, style: { filter: `drop-shadow(0 0 6px ${NEON.blue})` } }}
                style={{ filter: `drop-shadow(0 0 3px ${NEON.blue}60)` }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>

      {/* Bottom legend bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-t border-white/5">
        {[{ color: NEON.green, label: "Certificates generated" }, { color: NEON.blue, label: "Verification scans" }].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-4 h-0.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
            <span className="text-[10px] font-mono text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Certificate Activity mini card (for right panel) ──────────────────────────

function CertActivityMiniCard({ series }: { series: CertificateDailyPoint[] }) {
  const last30 = series.slice(-30)
  const maxVal = Math.max(...last30.map((d) => d.issued), 1)
  const total = last30.reduce((s, d) => s + d.issued, 0)
  const activeDays = last30.filter((d) => d.issued > 0).length
  const avgPerDay = activeDays > 0 ? Math.round(total / activeDays) : 0
  const peak = last30.reduce((best, d) => (d.issued > best.issued ? d : best), { issued: 0, date: "" })

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card p-5 flex flex-col h-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 rounded-tl-2xl pointer-events-none" style={{ borderColor: `${NEON.amber}60` }} />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 rounded-br-2xl pointer-events-none" style={{ borderColor: `${NEON.amber}30` }} />

      <div className="mb-3">
        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-0.5">ACTIVITY · 30D</p>
        <p className="text-sm font-semibold">Certificate Activity</p>
      </div>

      {/* Mini bar sparkline */}
      <div className="flex items-end gap-[2px] h-14 mb-4 flex-1">
        {last30.map((d, i) => {
          const h = maxVal > 0 ? Math.max((d.issued / maxVal) * 100, d.issued > 0 ? 4 : 2) : 2
          return (
            <div
              key={i}
              className="flex-1 rounded-t-[2px] transition-all"
              style={{
                height: `${h}%`,
                background: d.issued > 0
                  ? `linear-gradient(180deg, ${NEON.amber} 0%, ${NEON.amber}60 100%)`
                  : "rgba(148,163,184,0.08)",
                boxShadow: d.issued > 0 ? `0 0 4px ${NEON.amber}50` : "none",
              }}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "TOTAL", value: total.toLocaleString() },
          { label: "ACTIVE DAYS", value: String(activeDays) },
          { label: "AVG / DAY", value: String(avgPerDay) },
          { label: "PEAK", value: peak.issued > 0 ? String(peak.issued) : "—" },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{s.label}</p>
            <p className="text-base font-bold tabular-nums font-mono mt-0.5" style={{ color: NEON.amber, textShadow: `0 0 12px ${NEON.amber}40` }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Category mix chart (area-style, screenshot-inspired) ─────────────────────

const CAT_COLORS = ["#3ECF8E", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#38bdf8"]

function CategoryAreaViz({
  data,
  height = 88,
  id = "main",
}: {
  data: { name: string; value: number; color: string }[]
  height?: number
  id?: string
}) {
  const sorted = React.useMemo(() => [...data].sort((a, b) => b.value - a.value), [data])
  const maxVal = sorted[0]?.value ?? 1
  const W = 300
  const H = height
  const n = sorted.length

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        {sorted.map((d, i) => {
          const gradId = `cmg_${id}_${i}`
          return (
            <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={d.color} stopOpacity={0.7} />
              <stop offset="100%" stopColor={d.color} stopOpacity={0.08} />
            </linearGradient>
          )
        })}
      </defs>
      {sorted.map((d, i) => {
        const gradId = `cmg_${id}_${i}`
        const peakH = (d.value / maxVal) * (H - 8)
        const peakY = H - 4 - peakH
        const peakX = n <= 1 ? W * 0.5 : W * (0.18 + (i / (n - 1)) * 0.64)
        const path = [
          `M 0 ${H}`,
          `C ${peakX * 0.5} ${H} ${peakX * 0.82} ${peakY} ${peakX} ${peakY}`,
          `C ${peakX + (W - peakX) * 0.18} ${peakY} ${peakX + (W - peakX) * 0.5} ${H} ${W} ${H}`,
          "Z",
        ].join(" ")
        return (
          <path
            key={d.name}
            d={path}
            fill={`url(#${gradId})`}
            stroke={d.color}
            strokeWidth={1.5}
            strokeOpacity={0.8}
            style={{ filter: `drop-shadow(0 0 4px ${d.color}50)` }}
          />
        )
      })}
    </svg>
  )
}

function CategoryDonut({ mix }: { mix: CertificateCategoryMixRow[] }) {
  const data = React.useMemo(
    () =>
      mix.slice(0, 8).map((r, i) => ({
        name: r.categoryName !== "Uncategorised" ? r.categoryName : (r.subcategoryName || "Other"),
        value: r.count,
        color: CAT_COLORS[i % CAT_COLORS.length]!,
      })).sort((a, b) => b.value - a.value),
    [mix]
  )
  const total = data.reduce((a, r) => a + r.value, 0)

  const LegendList = ({ compact = true }: { compact?: boolean }) => (
    <div className={compact ? "space-y-1.5" : "grid grid-cols-2 gap-x-8 gap-y-2"}>
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
        return (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className={cn("flex-1 truncate text-foreground/80", compact ? "text-[10px]" : "text-xs")}>
              {d.name}
            </span>
            <span className={cn("tabular-nums text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {pct}%
            </span>
            <span className={cn("tabular-nums font-medium text-right", compact ? "text-[10px] w-8" : "text-xs w-12")}>
              {d.value.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-full">
        <p className="text-sm font-semibold mb-1">Category mix</p>
        <p className="text-xs text-muted-foreground mb-4">All-time distribution</p>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No templates yet</div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-full">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-sm font-semibold">Category mix</p>
          <p className="text-xs text-muted-foreground">All-time distribution</p>
        </div>
        <ChartExpandModal title="Category mix">
          <div className="space-y-5 pt-2">
            <div>
              <p className="text-3xl font-bold tabular-nums">{total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total certificates</p>
            </div>
            <CategoryAreaViz data={data} height={140} id="exp" />
            <LegendList compact={false} />
          </div>
        </ChartExpandModal>
      </div>

      {/* Prominent total — mirrors screenshot's "930" header */}
      <div className="mb-3">
        <p className="text-2xl font-bold tabular-nums leading-none">{total.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Total certificates</p>
      </div>

      {/* Overlapping mountain-range area visualization */}
      <CategoryAreaViz data={data} height={88} id="mini" />

      {/* Legend */}
      <div className="mt-4 flex-1">
        <LegendList compact />
      </div>
    </div>
  )
}

// ── Import jobs chart (futuristic neon) ──────────────────────────────────────

function ImportsBarChart({ imports }: { imports: RecentImport[] }) {
  const buckets = React.useMemo(() => {
    const byDay: Record<string, { completed: number; failed: number; processing: number }> = {}
    for (const imp of imports) {
      const day = imp.created_at.slice(0, 10)
      if (!byDay[day]) byDay[day] = { completed: 0, failed: 0, processing: 0 }
      const b = byDay[day]!
      if (imp.status === "completed") b.completed++
      else if (imp.status === "failed") b.failed++
      else b.processing++
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...v,
        total: v.completed + v.failed + v.processing,
      }))
  }, [imports])

  const total = imports.length
  const completed = imports.filter((i) => i.status === "completed").length
  const failed = imports.filter((i) => i.status === "failed").length
  const processing = total - completed - failed
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const successColor = successRate >= 90 ? NEON.green : successRate >= 70 ? NEON.amber : NEON.rose
  const avgPerDay = buckets.length > 0 ? Math.round(total / buckets.length) : 0

  const chartConfig: ChartConfig = {
    completed: { label: "Completed", color: NEON.green },
    failed: { label: "Failed", color: NEON.rose },
    processing: { label: "Processing", color: NEON.blue },
    total: { label: "Total", color: "rgba(148,163,184,0.5)" },
  }

  const NeonTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; fill: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const dayTotal = payload.reduce((s, p) => s + (p.value ?? 0), 0)
    return (
      <div className="rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl px-3 py-2.5 shadow-2xl text-xs font-mono">
        <p className="text-slate-400 mb-2 text-[10px] tracking-widest uppercase">{label}</p>
        {payload.filter((p) => p.value > 0).map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-5 mb-0.5">
            <span className="flex items-center gap-1.5" style={{ color: p.fill }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.fill, boxShadow: `0 0 4px ${p.fill}` }} />
              {p.name.toUpperCase()}
            </span>
            <span className="font-bold text-white">{p.value}</span>
          </div>
        ))}
        {dayTotal > 0 && (
          <div className="flex justify-between gap-5 border-t border-white/10 mt-1.5 pt-1.5 text-slate-400">
            <span>TOTAL</span>
            <span className="text-white font-bold">{dayTotal}</span>
          </div>
        )}
      </div>
    )
  }

  const ChartBody = ({ height, withBrush }: { height: string; withBrush?: boolean }) =>
    buckets.length === 0 ? (
      <div className={`${height} flex items-center justify-center text-xs font-mono text-muted-foreground tracking-widest`}>NO DATA IN RANGE</div>
    ) : (
      <ChartContainer config={chartConfig} className={`${height} w-full`}>
        <ComposedChart data={buckets} barSize={Math.max(6, Math.min(18, Math.floor(240 / (buckets.length || 1))))} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="neonCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEON.green} stopOpacity={0.95} />
              <stop offset="100%" stopColor={NEON.green} stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="neonFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEON.rose} stopOpacity={0.95} />
              <stop offset="100%" stopColor={NEON.rose} stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="neonProcessing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEON.blue} stopOpacity={0.95} />
              <stop offset="100%" stopColor={NEON.blue} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={NEON_GRID} strokeDasharray="1 6" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(148,163,184,0.5)", fontFamily: "monospace" }} interval="preserveStartEnd" />
          <YAxis hide allowDecimals={false} />
          {avgPerDay > 0 && (
            <ReferenceLine
              y={avgPerDay}
              stroke={`${NEON.amber}50`}
              strokeDasharray="4 4"
              label={{ value: `AVG ${avgPerDay}`, position: "insideTopRight", fontSize: 8, fill: `${NEON.amber}80`, fontFamily: "monospace" }}
            />
          )}
          <ChartTooltip content={<NeonTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="completed" stackId="a" fill="url(#neonCompleted)" radius={[0, 0, 2, 2]}
            style={{ filter: `drop-shadow(0 0 3px ${NEON.green}60)` }} />
          <Bar dataKey="processing" stackId="a" fill="url(#neonProcessing)"
            style={{ filter: `drop-shadow(0 0 3px ${NEON.blue}50)` }} />
          <Bar dataKey="failed" stackId="a" fill="url(#neonFailed)" radius={[3, 3, 0, 0]}
            style={{ filter: `drop-shadow(0 0 3px ${NEON.rose}50)` }} />
          <Line dataKey="total" type="monotone" stroke={`${NEON.amber}70`} strokeWidth={1.5} dot={false} strokeDasharray="3 4" />
          {withBrush && buckets.length > 7 && (
            <Brush dataKey="date" height={18} stroke={NEON_GRID} fill="rgba(0,0,0,0.2)" travellerWidth={6} />
          )}
        </ComposedChart>
      </ChartContainer>
    )

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 rounded-tl-2xl" style={{ borderColor: `${NEON.green}50` }} />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 rounded-br-2xl" style={{ borderColor: `${NEON.rose}30` }} />

      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-0.5">IMPORT PIPELINE</p>
          <p className="text-sm font-semibold">Import Jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums font-mono" style={{ color: successColor, textShadow: `0 0 16px ${successColor}50` }}>{successRate}%</p>
            <p className="text-[9px] font-mono text-muted-foreground tracking-wider">SUCCESS</p>
          </div>
          <ChartExpandModal title="Import jobs">
            <div className="space-y-4 pt-2">
              <ChartBody height="h-72" withBrush />
              <div className="flex gap-5 flex-wrap">
                {[{ label: "Completed", value: completed, color: NEON.green }, { label: "Processing", value: processing, color: NEON.blue }, { label: "Failed", value: failed, color: NEON.rose }].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5 text-xs font-mono">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
                    <span className="text-muted-foreground">{s.label.toUpperCase()}</span>
                    <strong className="text-foreground ml-1">{s.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </ChartExpandModal>
        </div>
      </div>

      <ChartBody height="h-36" />

      <div className="flex items-center gap-5 mt-3 flex-wrap">
        {[{ label: "OK", value: completed, color: NEON.green }, { label: "RUN", value: processing, color: NEON.blue }, { label: "ERR", value: failed, color: NEON.rose }].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
            <span className="text-[10px] font-mono text-muted-foreground">{s.label} <strong className="text-foreground">{s.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Verification results chart (neon spline) ─────────────────────────────────

function VerificationTrendChart({ verifications }: { verifications: RecentVerification[] }) {
  const data = React.useMemo(() => {
    const byDay: Record<string, { valid: number; invalid: number }> = {}
    for (const v of verifications) {
      const day = v.verified_at.slice(0, 10)
      if (!byDay[day]) byDay[day] = { valid: 0, invalid: 0 }
      if (v.result === "valid") byDay[day]!.valid++
      else byDay[day]!.invalid++
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), ...v }))
  }, [verifications])

  const total = verifications.length
  const valid = verifications.filter((v) => v.result === "valid").length
  const invalid = total - valid
  const validPct = total > 0 ? Math.round((valid / total) * 100) : 0
  const validColor = validPct >= 90 ? NEON.green : validPct >= 70 ? NEON.amber : NEON.rose
  const avgPerDay = data.length > 0 ? Math.round(total / data.length) : 0

  const chartConfig: ChartConfig = {
    valid: { label: "Valid", color: NEON.green },
    invalid: { label: "Invalid", color: NEON.rose },
  }

  const NeonTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const dayTotal = payload.reduce((s, p) => s + (p.value ?? 0), 0)
    const dayPct = dayTotal > 0 ? Math.round(((payload.find((p) => p.name === "valid")?.value ?? 0) / dayTotal) * 100) : 0
    return (
      <div className="rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl px-3 py-2.5 shadow-2xl text-xs font-mono">
        <p className="text-slate-400 mb-2 text-[10px] tracking-widest uppercase">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-5 mb-0.5">
            <span className="flex items-center gap-1.5" style={{ color: p.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}` }} />
              {p.name.toUpperCase()}
            </span>
            <span className="font-bold text-white">{p.value}</span>
          </div>
        ))}
        {dayTotal > 0 && (
          <div className="flex justify-between gap-5 border-t border-white/10 mt-1.5 pt-1.5">
            <span className="text-slate-400">VALID RATE</span>
            <span className="font-bold" style={{ color: dayPct >= 90 ? NEON.green : dayPct >= 70 ? NEON.amber : NEON.rose }}>{dayPct}%</span>
          </div>
        )}
      </div>
    )
  }

  const ChartBody = ({ height, withBrush }: { height: string; withBrush?: boolean }) =>
    data.length === 0 ? (
      <div className={`${height} flex items-center justify-center text-xs font-mono text-muted-foreground tracking-widest`}>NO DATA IN RANGE</div>
    ) : (
      <ChartContainer config={chartConfig} className={`${height} w-full`}>
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="neonValid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEON.green} stopOpacity={0.35} />
              <stop offset="100%" stopColor={NEON.green} stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="neonInvalid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEON.rose} stopOpacity={0.3} />
              <stop offset="100%" stopColor={NEON.rose} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={NEON_GRID} strokeDasharray="1 6" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(148,163,184,0.5)", fontFamily: "monospace" }} interval="preserveStartEnd" />
          <YAxis hide allowDecimals={false} />
          {avgPerDay > 0 && (
            <ReferenceLine
              y={avgPerDay}
              stroke={`${NEON.purple}50`}
              strokeDasharray="4 4"
              label={{ value: `AVG ${avgPerDay}`, position: "insideTopRight", fontSize: 8, fill: `${NEON.purple}80`, fontFamily: "monospace" }}
            />
          )}
          <ChartTooltip content={<NeonTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1, strokeDasharray: "3 4" }} />
          <Area dataKey="valid" type="natural" stroke={NEON.green} strokeWidth={2} fill="url(#neonValid)" dot={false}
            activeDot={{ r: 5, fill: NEON.green, strokeWidth: 0 }}
            style={{ filter: `drop-shadow(0 0 4px ${NEON.green}60)` }}
          />
          <Area dataKey="invalid" type="natural" stroke={NEON.rose} strokeWidth={2} fill="url(#neonInvalid)" dot={false}
            activeDot={{ r: 5, fill: NEON.rose, strokeWidth: 0 }}
            style={{ filter: `drop-shadow(0 0 4px ${NEON.rose}60)` }}
          />
          {withBrush && data.length > 7 && (
            <Brush dataKey="date" height={18} stroke={NEON_GRID} fill="rgba(0,0,0,0.2)" travellerWidth={6} />
          )}
        </AreaChart>
      </ChartContainer>
    )

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 rounded-tl-2xl" style={{ borderColor: `${NEON.green}50` }} />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 rounded-br-2xl" style={{ borderColor: `${NEON.rose}30` }} />

      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-0.5">VERIFICATION SCAN SIGNAL</p>
          <p className="text-sm font-semibold">Verification Results</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums font-mono" style={{ color: validColor, textShadow: `0 0 16px ${validColor}50` }}>{validPct}%</p>
            <p className="text-[9px] font-mono text-muted-foreground tracking-wider">VALID</p>
          </div>
          <ChartExpandModal title="Verification results">
            <div className="space-y-4 pt-2">
              <ChartBody height="h-72" withBrush />
              <div className="flex items-center gap-5 font-mono text-xs">
                {[{ label: "VALID", value: valid, color: NEON.green }, { label: "INVALID", value: invalid, color: NEON.rose }].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
                    <span className="text-muted-foreground">{s.label}</span>
                    <strong className="text-foreground ml-1">{s.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </ChartExpandModal>
        </div>
      </div>

      <ChartBody height="h-36" />

      <div className="flex items-center gap-5 mt-3 flex-wrap">
        {[{ label: "VLD", value: valid, color: NEON.green }, { label: "INV", value: invalid, color: NEON.rose }].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
            <span className="text-[10px] font-mono text-muted-foreground">{s.label} <strong className="text-foreground">{s.value}</strong></span>
          </div>
        ))}
        {avgPerDay > 0 && <span className="text-[10px] font-mono text-muted-foreground">AVG <strong className="text-foreground">{avgPerDay}/day</strong></span>}
      </div>
    </div>
  )
}

// ── Activity feeds ────────────────────────────────────────────────────────────

function RecentImportsCard({ slug, imports }: { slug: string; imports: RecentImport[] }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Recent imports</p>
        </div>
        <Link href={orgPath(slug, "/imports")}>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">View all <ArrowUpRight className="w-3 h-3" /></Button>
        </Link>
      </div>
      <div className="divide-y divide-border/30">
        {imports.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No imports in this range</div>
        ) : (
          imports.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                item.status === "completed" ? "bg-emerald-500/10" : item.status === "failed" ? "bg-red-500/10" : "bg-blue-500/10"
              )}>
                {item.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> :
                 item.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-400" /> :
                 <Clock className="w-3.5 h-3.5 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.file_name || "Unknown file"}</p>
                <p className="text-[10px] text-muted-foreground">{item.total_rows ?? 0} rows · {getTimeAgo(item.created_at)}</p>
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                item.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
                item.status === "failed" ? "bg-red-500/10 text-red-400" :
                "bg-blue-500/10 text-blue-400"
              )}>
                {item.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RecentVerificationsCard({ slug, verifications }: { slug: string; verifications: RecentVerification[] }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Recent verifications</p>
        </div>
        <Link href={orgPath(slug, "/verification-logs")}>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">View all <ArrowUpRight className="w-3 h-3" /></Button>
        </Link>
      </div>
      <div className="divide-y divide-border/30">
        {verifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No verifications in this range</div>
        ) : (
          verifications.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                item.result === "valid" ? "bg-emerald-500/10" : "bg-red-500/10"
              )}>
                {item.result === "valid"
                  ? <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.certificate?.recipient_name || "Unknown"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.certificate?.course_name || "N/A"} · {getTimeAgo(item.verified_at)}</p>
              </div>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                item.result === "valid" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"
              )}>
                {item.result ?? "unknown"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Email broadcasts chart (neon funnel bars) ─────────────────────────────────

function EmailBroadcastChart() {
  const [broadcasts, setBroadcasts] = React.useState<EmailBroadcast[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.delivery.listBroadcasts()
      .then((r) => setBroadcasts(r.broadcasts.filter((b: EmailBroadcast) => b.status === "sent").slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const chartData = broadcasts.map((b) => ({
    name: b.name.length > 14 ? `${b.name.slice(0, 13)}…` : b.name,
    recipients: b.total_recipients,
    delivered: b.delivered_count,
    failed: b.failed_count,
    rate: b.total_recipients > 0 ? Math.round((b.delivered_count / b.total_recipients) * 100) : 0,
  }))

  const totalSent = broadcasts.reduce((s, b) => s + b.sent_count, 0)
  const totalDelivered = broadcasts.reduce((s, b) => s + b.delivered_count, 0)
  const totalFailed = broadcasts.reduce((s, b) => s + b.failed_count, 0)
  const overallRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0
  const rateColor = overallRate >= 90 ? NEON.green : overallRate >= 70 ? NEON.amber : NEON.rose

  const chartConfig: ChartConfig = {
    delivered: { label: "Delivered", color: NEON.green },
    failed: { label: "Failed", color: NEON.rose },
  }

  const EmailTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl px-3 py-2.5 shadow-2xl text-xs font-mono max-w-[180px]">
        <p className="text-slate-300 mb-2 text-[10px] leading-tight font-semibold">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
            <span className="flex items-center gap-1.5" style={{ color: p.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}` }} />
              {p.name.toUpperCase()}
            </span>
            <span className="font-bold text-white">{(p.value as number).toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-card p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 rounded-tl-2xl" style={{ borderColor: `${NEON.purple}60` }} />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 rounded-br-2xl" style={{ borderColor: `${NEON.blue}30` }} />

      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-0.5">EMAIL DELIVERY SIGNAL</p>
          <p className="text-sm font-semibold">Broadcast Performance</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums font-mono" style={{ color: rateColor, textShadow: `0 0 16px ${rateColor}50` }}>
            {overallRate > 0 ? `${overallRate}%` : "—"}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground tracking-wider">DELIVERY RATE</p>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: NEON.purple }} />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs font-mono text-muted-foreground tracking-widest">NO SENT BROADCASTS</div>
      ) : (
        <ChartContainer config={chartConfig} className="h-44 w-full">
          <ComposedChart data={chartData} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="emailDelivered" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={NEON.green} stopOpacity={0.9} />
                <stop offset="100%" stopColor={NEON.green} stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="emailFailed" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={NEON.rose} stopOpacity={0.9} />
                <stop offset="100%" stopColor={NEON.rose} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal={false} stroke={NEON_GRID} strokeDasharray="1 6" />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(148,163,184,0.6)", fontFamily: "monospace" }} width={70} />
            <ChartTooltip content={<EmailTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            <Bar dataKey="delivered" stackId="e" fill="url(#emailDelivered)" radius={[0, 0, 0, 0]} style={{ filter: `drop-shadow(0 0 3px ${NEON.green}60)` }} />
            <Bar dataKey="failed" stackId="e" fill="url(#emailFailed)" radius={[0, 3, 3, 0]} style={{ filter: `drop-shadow(0 0 3px ${NEON.rose}50)` }} />
          </ComposedChart>
        </ChartContainer>
      )}

      <div className="flex items-center gap-5 mt-3 flex-wrap border-t border-white/5 pt-3">
        {[
          { label: "SENT", value: totalSent, color: NEON.blue },
          { label: "DELIVERED", value: totalDelivered, color: NEON.green },
          { label: "FAILED", value: totalFailed, color: NEON.rose },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
            <span className="text-[10px] font-mono text-muted-foreground">{s.label} <strong className="text-foreground">{s.value.toLocaleString()}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Broadcast delivery analytics ─────────────────────────────────────────────

function BroadcastAnalyticsCard({ slug }: { slug: string }) {
  const [broadcasts, setBroadcasts] = React.useState<EmailBroadcast[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.delivery.listBroadcasts()
      .then((r) => setBroadcasts(r.broadcasts.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sent = broadcasts.filter((b) => b.status === "sent")

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Broadcast delivery</p>
        </div>
        <Link href={orgPath(slug, "/broadcasts")}>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">View all <ArrowUpRight className="w-3 h-3" /></Button>
        </Link>
      </div>
      <div className="divide-y divide-border/30">
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : sent.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No sent broadcasts yet</div>
        ) : (
          sent.map((b) => {
            const deliveryRate = b.total_recipients > 0 ? Math.round((b.delivered_count / b.total_recipients) * 100) : 0
            const failRate = b.total_recipients > 0 ? Math.round((b.failed_count / b.total_recipients) * 100) : 0
            return (
              <div key={b.id} className="px-5 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-48">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">{b.total_recipients.toLocaleString()} recipients · {b.sent_at ? format(new Date(b.sent_at), "MMM d") : "—"}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold tabular-nums" style={{ color: deliveryRate >= 90 ? "#3ECF8E" : deliveryRate >= 70 ? "#f59e0b" : "#f87171" }}>{deliveryRate}%</p>
                    <p className="text-[9px] text-muted-foreground">delivered</p>
                  </div>
                </div>
                <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted">
                  <div className="h-full bg-[#3ECF8E] transition-all" style={{ width: `${deliveryRate}%` }} />
                  <div className="h-full bg-[#f87171] transition-all" style={{ width: `${failRate}%` }} />
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span><strong className="text-foreground">{b.delivered_count.toLocaleString()}</strong> delivered</span>
                  <span><strong className="text-red-400">{b.failed_count.toLocaleString()}</strong> failed</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Expiring certificates ─────────────────────────────────────────────────────

type ExpiringCert = Pick<Certificate, "id" | "recipient_name" | "expires_at" | "certificate_number"> & {
  template?: { title: string } | null
}

function ExpiringCertificatesCard({ slug }: { slug: string }) {
  const [certs, setCerts] = React.useState<ExpiringCert[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.certificates.list({ status: "active", sort_by: "expires_at", sort_order: "asc", limit: 20 })
      .then((r) => {
        const now = new Date()
        const in90 = new Date(now.getTime() + 90 * 24 * 3600 * 1000)
        const expiring = r.items
          .filter((c: Certificate) => c.expires_at && new Date(c.expires_at) <= in90)
          .slice(0, 8)
        setCerts(expiring)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function urgencyColor(expiresAt: string) {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    if (days <= 14) return { color: "#f87171", label: `${days}d` }
    if (days <= 30) return { color: "#f59e0b", label: `${days}d` }
    return { color: "#60a5fa", label: `${days}d` }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Expiring soon</p>
          <span className="text-[10px] text-muted-foreground">within 90 days</span>
        </div>
        <Link href={orgPath(slug, "/certificates")}>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">View all <ArrowUpRight className="w-3 h-3" /></Button>
        </Link>
      </div>
      <div className="divide-y divide-border/30">
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : certs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No certificates expiring in the next 90 days</div>
        ) : (
          certs.map((c) => {
            const { color, label } = urgencyColor(c.expires_at!)
            return (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                  <CalendarClock className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.recipient_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.template?.title ?? c.certificate_number}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${color}18`, color }}>
                  {label}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportDailyCSV(series: CertificateDailyPoint[], rangeLabel: string) {
  const rows = [
    ["Date", "Certificates Issued", "Revoked", "Verification Scans"],
    ...series.map((r) => [r.date, String(r.issued), String(r.revoked), String(r.verificationScans)]),
  ]
  const csv = rows.map((r) => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `analytics-${rangeLabel.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border/40 bg-card/30 p-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#3ECF8E]/10 flex items-center justify-center mb-5">
        <Award className="w-8 h-8 text-[#3ECF8E]" />
      </div>
      <h3 className="text-xl font-bold mb-2">No data yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Create a template and import recipient data to start generating certificates and unlocking analytics.
      </p>
      <div className="flex gap-3">
        <Link href={orgPath(slug, "/templates")}>
          <Button className="bg-[#3ECF8E] hover:bg-[#34b87a] text-black font-semibold">Create Template</Button>
        </Link>
        <Link href={orgPath(slug, "/imports")}>
          <Button variant="outline">Import Data</Button>
        </Link>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AnalyticsDashboardClient({ slug, initialData }: AnalyticsDashboardClientProps) {
  const router = useRouter()

  const [preset, setPreset] = React.useState<RangePreset>("week")
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(undefined)
  const [liveStats, setLiveStats] = React.useState(initialData?.stats ?? null)
  const [refreshing, setRefreshing] = React.useState(false)

  const stats = liveStats ?? {
    totalCertificates: 0,
    pendingJobs: 0,
    verificationsToday: 0,
    revokedCertificates: 0,
    verificationEventsTotal: 0,
  }

  const applyStats = React.useCallback((rawStats: Partial<DashboardStats> | null | undefined) => {
    if (!rawStats) return
    setLiveStats({
      totalCertificates: rawStats.totalCertificates ?? 0,
      pendingJobs: rawStats.pendingJobs ?? 0,
      verificationsToday: rawStats.verificationsToday ?? 0,
      revokedCertificates: rawStats.revokedCertificates ?? 0,
      verificationEventsTotal: rawStats.verificationEventsTotal ?? 0,
    })
  }, [])

  // Refresh stats on mount to pick up any changes since server rendered the page
  React.useEffect(() => {
    let cancelled = false
    api.dashboard.getStats().then((data) => {
      if (!cancelled) applyStats(data.stats)
    }).catch(() => { /* silent */ })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh stats every 30s while pending jobs are processing
  React.useEffect(() => {
    if (!initialData) return
    let cancelled = false
    const refresh = async () => {
      try {
        const data = await api.dashboard.getStats()
        if (!cancelled) applyStats(data.stats)
      } catch { /* silent */ }
    }
    const id = setInterval(() => {
      if (stats.pendingJobs > 0) refresh()
    }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [initialData, stats.pendingJobs, applyStats])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      const data = await api.dashboard.getStats()
      applyStats(data.stats)
    } catch { /* silent */ }
    finally { setRefreshing(false) }
  }

  const rangeLabel = formatRangeLabel(preset, customRange)
  const interval = React.useMemo(() => toInterval(preset, customRange), [preset, customRange])

  const allImports = React.useMemo(() => initialData?.recentImports ?? [], [initialData])
  const allVerifications = React.useMemo(() => initialData?.recentVerifications ?? [], [initialData])
  const allCertificatesDaily = React.useMemo(() => initialData?.certificatesDaily ?? [], [initialData])
  const allCategoryMix = React.useMemo(() => initialData?.certificateCategoryMix ?? [], [initialData])

  const filteredDaily = React.useMemo(
    () => filterCertificatesDailyByInterval(allCertificatesDaily, interval),
    [allCertificatesDaily, interval]
  )

  const filteredImports = React.useMemo(
    () => allImports.filter((i) => isWithinInterval(new Date(i.created_at), interval)),
    [allImports, interval]
  )

  const filteredVerifications = React.useMemo(
    () => allVerifications.filter((v) => isWithinInterval(new Date(v.verified_at), interval)),
    [allVerifications, interval]
  )

  const hasAnyData =
    stats.totalCertificates > 0 ||
    stats.pendingJobs > 0 ||
    stats.verificationsToday > 0 ||
    stats.revokedCertificates > 0 ||
    filteredImports.length > 0 ||
    filteredVerifications.length > 0

  if (!initialData) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-8">
        <p className="font-semibold mb-2">Failed to load analytics</p>
        <p className="text-sm text-muted-foreground mb-4">Please refresh the page to retry.</p>
        <Button onClick={() => router.refresh()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1">AUTHENTIX · MISSION CONTROL</p>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Real-time certificate intelligence & delivery telemetry
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-3">
            <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <TabsList className="h-9">
                <TabsTrigger value="today" className="text-xs px-3">Today</TabsTrigger>
                <TabsTrigger value="week" className="text-xs px-3">7 days</TabsTrigger>
                <TabsTrigger value="month" className="text-xs px-3">30 days</TabsTrigger>
                <TabsTrigger value="custom" className="text-xs px-3">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => exportDailyCSV(filteredDaily, rangeLabel)}
              disabled={filteredDaily.length === 0}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={handleManualRefresh}
              disabled={refreshing}
              title="Refresh stats"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
          {preset === "custom" && (
            <DatePickerWithRange date={customRange} onDateChange={setCustomRange} className="w-64" label="" align="end" />
          )}
        </div>
      </div>

      {/* Pending jobs banner */}
      {stats.pendingJobs > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>{stats.pendingJobs}</strong> import job{stats.pendingJobs === 1 ? "" : "s"} {stats.pendingJobs === 1 ? "is" : "are"} currently processing — stats auto-refresh every 30s.
          </p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total certificates"
          value={stats.totalCertificates}
          sub="All-time"
          icon={<Award className="w-4 h-4" />}
          accent="#3ECF8E"
        />
        <KpiCard
          label="Verification scans"
          value={stats.verificationEventsTotal}
          sub="All-time public scans"
          icon={<ScanLine className="w-4 h-4" />}
          accent="#60a5fa"
        />
        <KpiCard
          label="Scanned today"
          value={stats.verificationsToday}
          sub="Today's activity"
          icon={<Activity className="w-4 h-4" />}
          accent="#f59e0b"
          trend={stats.verificationsToday > 0 ? "up" : "neutral"}
          trendLabel={stats.verificationsToday > 0 ? "Active" : undefined}
        />
        <KpiCard
          label="Revoked"
          value={stats.revokedCertificates}
          sub={stats.totalCertificates > 0 ? `${Math.round((stats.revokedCertificates / stats.totalCertificates) * 100)}% of total` : "Invalidated"}
          icon={<AlertTriangle className="w-4 h-4" />}
          accent="#f87171"
          trend={stats.revokedCertificates > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Certificates & Verifications — full-width spline (stock market style) */}
      <MainAreaChart series={filteredDaily} rangeLabel={rangeLabel} />

      {/* Category Mix + Certificate Activity mini */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CategoryDonut mix={allCategoryMix} />
        </div>
        <CertActivityMiniCard series={allCertificatesDaily} />
      </div>

      {/* Activity heatmap (full width) */}
      <div className="rounded-2xl border border-slate-700/40 bg-card p-6">
        <ActivityHeatmap series={allCertificatesDaily} />
      </div>

      {/* Import Jobs + Verification Results */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ImportsBarChart imports={filteredImports} />
        <VerificationTrendChart verifications={filteredVerifications} />
      </div>

      {/* Email — Broadcast Performance chart */}
      <EmailBroadcastChart />

      {/* Broadcast delivery list + Expiring certs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BroadcastAnalyticsCard slug={slug} />
        <ExpiringCertificatesCard slug={slug} />
      </div>

      {/* Empty state */}
      {!hasAnyData && <EmptyState slug={slug} />}

      {/* Activity feeds */}
      {hasAnyData && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RecentImportsCard slug={slug} imports={filteredImports} />
          <RecentVerificationsCard slug={slug} verifications={filteredVerifications} />
        </div>
      )}
    </div>
  )
}
