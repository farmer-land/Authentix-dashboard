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
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
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
                          const parent = (e.target as HTMLElement).closest(".relative")?.getBoundingClientRect()
                          setTooltip({
                            text: count > 0 ? `${count} certificate${count === 1 ? "" : "s"} on ${format(day, "MMM d, yyyy")}` : `No certificates on ${format(day, "MMM d, yyyy")}`,
                            x: rect.left - (parent?.left ?? 0) + 7,
                            y: rect.top - (parent?.top ?? 0) - 30,
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
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
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

function DonutChart({ data, total, size }: { data: { name: string; value: number; color: string }[]; total: number; size: number }) {
  const ir = size * 0.34
  const or = size * 0.47
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={ir}
          outerRadius={or}
          dataKey="value"
          strokeWidth={2}
          stroke="transparent"
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-lg font-bold tabular-nums leading-none">{total.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">total</p>
      </div>
    </div>
  )
}

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

  const Legend = () => (
    <div className="w-full space-y-2">
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
        return (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate text-foreground/80">{d.name}</span>
            <span className="tabular-nums text-muted-foreground w-7 text-right">{pct}%</span>
            <span className="tabular-nums font-medium w-10 text-right">{d.value.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )

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
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Category mix</p>
          <p className="text-xs text-muted-foreground">All-time distribution</p>
        </div>
        <ChartExpandModal title="Category mix">
          <div className="flex flex-col items-center gap-6 py-4">
            <DonutChart data={data} total={total} size={220} />
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 w-full max-w-md px-4">
              {data.map((d) => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
                return (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate text-foreground/80">{d.name}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground text-xs">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </ChartExpandModal>
      </div>
      <div className="flex flex-col items-center gap-4 flex-1">
        <DonutChart data={data} total={total} size={150} />
        <Legend />
      </div>
    </div>
  )
}

// ── Imports area chart ────────────────────────────────────────────────────────

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
  const successColor = successRate >= 90 ? "#3ECF8E" : successRate >= 70 ? "#f59e0b" : "#f87171"

  const chartConfig: ChartConfig = {
    completed: { label: "Completed", color: "#3ECF8E" },
    failed: { label: "Failed", color: "#f87171" },
    processing: { label: "Processing", color: "#60a5fa" },
  }

  const ChartBody = ({ height }: { height: string }) =>
    buckets.length === 0 ? (
      <div className={`${height} flex items-center justify-center text-sm text-muted-foreground`}>No imports in this range</div>
    ) : (
      <ChartContainer config={chartConfig} className={`${height} w-full`}>
        <AreaChart data={buckets} margin={{ left: 0, right: 0, top: 4 }}>
          <defs>
            <linearGradient id="igCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3ECF8E" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#3ECF8E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="igFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="igProcessing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(156,163,175,0.7)" }} />
          <YAxis hide allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="completed" type="monotone" stroke="#3ECF8E" strokeWidth={2} fill="url(#igCompleted)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area dataKey="processing" type="monotone" stroke="#60a5fa" strokeWidth={1.5} fill="url(#igProcessing)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
          <Area dataKey="failed" type="monotone" stroke="#f87171" strokeWidth={2} fill="url(#igFailed)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ChartContainer>
    )

  const LegendRow = () => (
    <div className="flex items-center gap-4 flex-wrap">
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
  )

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Import jobs</p>
          <p className="text-xs text-muted-foreground">Completion status over period</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums" style={{ color: successColor }}>{successRate}%</p>
            <p className="text-[10px] text-muted-foreground">success rate</p>
          </div>
          <ChartExpandModal title="Import jobs">
            <div className="space-y-4 pt-2">
              <ChartBody height="h-64" />
              <LegendRow />
            </div>
          </ChartExpandModal>
        </div>
      </div>
      <ChartBody height="h-36" />
      <div className="mt-3"><LegendRow /></div>
    </div>
  )
}

// ── Verification trend chart ──────────────────────────────────────────────────

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

  const ChartBody = ({ height }: { height: string }) =>
    data.length === 0 ? (
      <div className={`${height} flex items-center justify-center text-sm text-muted-foreground`}>No verifications in this range</div>
    ) : (
      <ChartContainer config={chartConfig} className={`${height} w-full`}>
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 4 }}>
          <defs>
            <linearGradient id="vgValid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3ECF8E" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3ECF8E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="vgInvalid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "rgba(156,163,175,0.7)" }} />
          <YAxis hide allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="valid" type="monotone" stroke="#3ECF8E" strokeWidth={2} fill="url(#vgValid)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area dataKey="invalid" type="monotone" stroke="#f87171" strokeWidth={2} fill="url(#vgInvalid)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ChartContainer>
    )

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Verification results</p>
          <p className="text-xs text-muted-foreground">Valid vs invalid scans</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-[#3ECF8E]">{validPct}%</p>
            <p className="text-[10px] text-muted-foreground">valid rate</p>
          </div>
          <ChartExpandModal title="Verification results">
            <div className="space-y-4 pt-2">
              <ChartBody height="h-64" />
              <div className="flex items-center gap-4">
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
          </ChartExpandModal>
        </div>
      </div>
      <ChartBody height="h-36" />
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

  // Auto-refresh stats every 30s while pending jobs are processing
  React.useEffect(() => {
    if (!initialData) return
    let cancelled = false
    const refresh = async () => {
      try {
        const data = await api.dashboard.getStats()
        if (!cancelled && data.stats) setLiveStats({
          totalCertificates: data.stats.totalCertificates ?? 0,
          pendingJobs: data.stats.pendingJobs ?? 0,
          verificationsToday: data.stats.verificationsToday ?? 0,
          revokedCertificates: data.stats.revokedCertificates ?? 0,
          verificationEventsTotal: data.stats.verificationEventsTotal ?? 0,
        })
      } catch { /* silent */ }
    }
    const id = setInterval(() => {
      if (stats.pendingJobs > 0) refresh()
    }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [initialData, stats.pendingJobs])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      const data = await api.dashboard.getStats()
      if (data.stats) setLiveStats({
        totalCertificates: data.stats.totalCertificates ?? 0,
        pendingJobs: data.stats.pendingJobs ?? 0,
        verificationsToday: data.stats.verificationsToday ?? 0,
        revokedCertificates: data.stats.revokedCertificates ?? 0,
        verificationEventsTotal: data.stats.verificationEventsTotal ?? 0,
      })
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
            <DatePickerWithRange date={customRange} onDateChange={setCustomRange} className="w-52" label="" align="end" />
          )}
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

      {/* Broadcast delivery + Expiring certs */}
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
