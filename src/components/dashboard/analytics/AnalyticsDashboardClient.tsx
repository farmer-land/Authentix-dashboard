"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  differenceInCalendarDays,
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
  Line,
  LineChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts"
import {
  Award,
  FileText,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  ScanLine,
  AlertTriangle,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

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

const HEAT_LEVELS = [
  { min: 0, max: 0, bg: "bg-[#1a1a1a] dark:bg-[#161b22]", label: "No activity" },
  { min: 1, max: 2, bg: "bg-[#0e4429]", label: "1–2" },
  { min: 3, max: 5, bg: "bg-[#006d32]", label: "3–5" },
  { min: 6, max: 10, bg: "bg-[#26a641]", label: "6–10" },
  { min: 11, max: Infinity, bg: "bg-[#3ECF8E]", label: "11+" },
]

function heatLevel(count: number): string {
  for (const l of HEAT_LEVELS) {
    if (count >= l.min && count <= l.max) return l.bg
  }
  return HEAT_LEVELS[0]!.bg
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

      <div className="relative overflow-x-auto">
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: 28 }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find((m) => m.col === wi)
            return (
              <div key={wi} className="text-[9px] text-muted-foreground/50 leading-none" style={{ width: 14, flexShrink: 0  }}>
                {label?.label ?? ""}
              </div>
            )
          })}
        </div>

        <div className="flex gap-0">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <div key={d} className="text-[9px] text-muted-foreground/40 leading-none flex items-center" style={{ height: 12, width: 24 }}>
                {i % 2 === 1 ? d.slice(0, 1) : ""}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className="relative"
            onMouseLeave={() => setTooltip(null)}
          >
            <div className="flex gap-0.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day) => {
                    const key = format(day, "yyyy-MM-dd")
                    const count = countByDate[key] ?? 0
                    const isFuture = day > today
                    return (
                      <div
                        key={key}
                        className={cn(
                          "w-3 h-3 rounded-sm transition-opacity cursor-default",
                          isFuture ? "opacity-0 pointer-events-none" : heatLevel(count),
                          count > 0 && !isFuture && "hover:ring-1 hover:ring-white/20"
                        )}
                        onMouseEnter={(e) => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect()
                          const parent = (e.target as HTMLElement).closest(".relative")?.getBoundingClientRect()
                          setTooltip({
                            text: count > 0 ? `${count} certificate${count === 1 ? "" : "s"} on ${format(day, "MMM d, yyyy")}` : `No certificates on ${format(day, "MMM d, yyyy")}`,
                            x: rect.left - (parent?.left ?? 0) + 6,
                            y: rect.top - (parent?.top ?? 0) - 28,
                          })
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>

            {tooltip && (
              <div
                className="absolute z-10 pointer-events-none bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md shadow-lg border border-border/60 whitespace-nowrap"
                style={{ left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)" }}
              >
                {tooltip.text}
              </div>
            )}
          </div>
        </div>
      </div>
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

function KpiCard({ label, value, sub, icon, accent = "#3ECF8E", trend, trendLabel }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 flex flex-col gap-3 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}18` }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
        {(sub || trendLabel) && (
          <div className="flex items-center gap-1.5 mt-1">
            {trend === "up" && <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-400" />}
            {trendLabel && <span className={cn("text-xs", trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-400" : "text-muted-foreground")}>{trendLabel}</span>}
            {sub && !trendLabel && <span className="text-xs text-muted-foreground">{sub}</span>}
          </div>
        )}
        {sub && !trendLabel && !trend && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Main area chart ───────────────────────────────────────────────────────────

type CertLineMetric = "issued" | "verificationScans"

const CHART_COLORS = {
  issued: "#3ECF8E",
  verificationScans: "#60a5fa",
}

function MainAreaChart({ series, rangeLabel }: { series: CertificateDailyPoint[]; rangeLabel: string }) {
  const [active, setActive] = React.useState<CertLineMetric>("issued")

  const totals = React.useMemo(
    () => ({
      issued: series.reduce((a, r) => a + r.issued, 0),
      verificationScans: series.reduce((a, r) => a + r.verificationScans, 0),
    }),
    [series]
  )

  const chartConfig: ChartConfig = {
    issued: { label: "Certificates generated", color: CHART_COLORS.issued },
    verificationScans: { label: "Verification scans", color: CHART_COLORS.verificationScans },
  }

  const color = CHART_COLORS[active]

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Metric toggle tabs */}
      <div className="flex border-b border-border/40">
        <div className="flex-1 px-6 py-4">
          <p className="text-xs text-muted-foreground mb-0.5">Trend over {rangeLabel}</p>
          <p className="text-sm font-semibold">Certificates & Verifications</p>
        </div>
        {(["issued", "verificationScans"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={cn(
              "px-6 py-4 border-l border-border/40 text-left transition-colors",
              active === key ? "bg-muted/50" : "hover:bg-muted/20"
            )}
          >
            <p className="text-xs text-muted-foreground mb-0.5">{chartConfig[key]?.label as string}</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: active === key ? color : undefined }}>
              {totals[key].toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-6 pt-4">
        {series.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            No data in this range
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={series} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "rgba(156,163,175,0.7)" }}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(v) => {
                  const d = new Date(String(v))
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }}
              />
              <YAxis hide allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) =>
                      new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    }
                  />
                }
              />
              <Area
                dataKey={active}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                fill="url(#areaGlow)"
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}

// ── Category donut ────────────────────────────────────────────────────────────

const CAT_COLORS = ["#3ECF8E", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399"]

function CategoryDonut({ mix }: { mix: CertificateCategoryMixRow[] }) {
  const data = React.useMemo(
    () => mix.slice(0, 6).map((r, i) => ({
      name: r.categoryName !== "Uncategorised" ? r.categoryName : r.subcategoryName,
      value: r.count,
      color: CAT_COLORS[i % CAT_COLORS.length]!,
    })),
    [mix]
  )
  const total = data.reduce((a, r) => a + r.value, 0)

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-full">
        <p className="text-sm font-semibold mb-1">Category mix</p>
        <p className="text-xs text-muted-foreground mb-4">All-time by template category</p>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No templates yet</div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-full">
      <p className="text-sm font-semibold mb-0.5">Category mix</p>
      <p className="text-xs text-muted-foreground mb-4">All-time distribution</p>
      {/* Simple CSS donut */}
      <div className="flex flex-col gap-2.5 flex-1">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <div key={d.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-foreground/80 truncate max-w-35">{d.name}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">{d.value.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: d.color }} />
              </div>
            </div>
          )
        })}
        <p className="text-[10px] text-muted-foreground/50 pt-1 text-right">{total.toLocaleString()} total</p>
      </div>
    </div>
  )
}

// ── Imports bar chart ─────────────────────────────────────────────────────────

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
      }))
  }, [imports])

  const total = imports.length
  const completed = imports.filter((i) => i.status === "completed").length
  const failed = imports.filter((i) => i.status === "failed").length
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const chartConfig: ChartConfig = {
    completed: { label: "Completed", color: "#3ECF8E" },
    failed: { label: "Failed", color: "#f87171" },
    processing: { label: "Processing", color: "#60a5fa" },
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Import jobs</p>
          <p className="text-xs text-muted-foreground">Completion status over period</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums" style={{ color: successRate >= 90 ? "#3ECF8E" : successRate >= 70 ? "#f59e0b" : "#f87171" }}>
            {successRate}%
          </p>
          <p className="text-[10px] text-muted-foreground">success rate</p>
        </div>
      </div>
      {buckets.length === 0 ? (
        <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">No imports in this range</div>
      ) : (
        <ChartContainer config={chartConfig} className="h-36 w-full">
          <BarChart data={buckets} barSize={12} margin={{ left: 0, right: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(156,163,175,0.6)" }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="completed" stackId="a" fill="#3ECF8E" radius={[0, 0, 0, 0]} />
            <Bar dataKey="processing" stackId="a" fill="#60a5fa" />
            <Bar dataKey="failed" stackId="a" fill="#f87171" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          { label: "Completed", value: completed, color: "#3ECF8E" },
          { label: "Failed", value: failed, color: "#f87171" },
          { label: "Processing", value: total - completed - failed, color: "#60a5fa" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[10px] text-muted-foreground">{s.label}: <strong className="text-foreground">{s.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Verification trend line ───────────────────────────────────────────────────

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
      .map(([date, v]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...v,
      }))
  }, [verifications])

  const total = verifications.length
  const valid = verifications.filter((v) => v.result === "valid").length
  const validPct = total > 0 ? Math.round((valid / total) * 100) : 0

  const chartConfig: ChartConfig = {
    valid: { label: "Valid", color: "#3ECF8E" },
    invalid: { label: "Invalid", color: "#f87171" },
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Verification results</p>
          <p className="text-xs text-muted-foreground">Valid vs invalid scans</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums text-[#3ECF8E]">{validPct}%</p>
          <p className="text-[10px] text-muted-foreground">valid rate</p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">No verifications in this range</div>
      ) : (
        <ChartContainer config={chartConfig} className="h-36 w-full">
          <LineChart data={data} margin={{ left: 0, right: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(156,163,175,0.6)" }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="valid" stroke="#3ECF8E" strokeWidth={2} dot={false} />
            <Line dataKey="invalid" stroke="#f87171" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ChartContainer>
      )}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#3ECF8E]" />
          <span className="text-[10px] text-muted-foreground">Valid: <strong className="text-foreground">{valid}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#f87171]" />
          <span className="text-[10px] text-muted-foreground">Invalid: <strong className="text-foreground">{total - valid}</strong></span>
        </div>
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

  const stats = initialData?.stats ?? {
    totalCertificates: 0,
    pendingJobs: 0,
    verificationsToday: 0,
    revokedCertificates: 0,
    verificationEventsTotal: 0,
  }

  const rangeLabel = formatRangeLabel(preset, customRange)
  const interval = React.useMemo(() => toInterval(preset, customRange), [preset, customRange])

  const allImports = initialData?.recentImports ?? []
  const allVerifications = initialData?.recentVerifications ?? []
  const allCertificatesDaily = initialData?.certificatesDaily ?? []
  const allCategoryMix = initialData?.certificateCategoryMix ?? []

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Certificate operations, verifications, and delivery performance
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <TabsList className="h-9">
              <TabsTrigger value="today" className="text-xs px-3">Today</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3">7 days</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3">30 days</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs px-3">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          {preset === "custom" && (
            <DatePickerWithRange date={customRange} onDateChange={setCustomRange} className="w-52" />
          )}
        </div>
      </div>

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

      {/* Main chart + Category mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MainAreaChart series={filteredDaily} rangeLabel={rangeLabel} />
        </div>
        <CategoryDonut mix={allCategoryMix} />
      </div>

      {/* Activity heatmap */}
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ActivityHeatmap series={allCertificatesDaily} />
      </div>

      {/* Imports + Verifications charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ImportsBarChart imports={filteredImports} />
        <VerificationTrendChart verifications={filteredVerifications} />
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
