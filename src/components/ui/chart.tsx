"use client"

import * as React from "react"
import { Tooltip } from "recharts"

import { cn } from "@/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label: string
    color?: string
  }
>

type ChartContextValue = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function ChartContainer({
  config,
  children,
  className,
}: {
  config: ChartConfig
  children: React.ReactNode
  className?: string
}) {
  const divRef = React.useRef<HTMLDivElement>(null)
  // Null = not yet measured. Charts only render once we have real pixel dimensions,
  // eliminating Recharts' width(-1)/height(-1) warning that fires during its own
  // ResizeObserver setup cycle inside ResponsiveContainer.
  const [dims, setDims] = React.useState<{ width: number; height: number } | null>(null)

  React.useLayoutEffect(() => {
    const el = divRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const e = entries[0]
      if (!e) return
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) {
        setDims((prev) =>
          prev?.width === Math.floor(width) && prev?.height === Math.floor(height)
            ? prev
            : { width: Math.floor(width), height: Math.floor(height) }
        )
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const style = React.useMemo(() => {
    const cssVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(config)) {
      cssVars[`--color-${key}`] = value.color ?? "var(--chart-1)"
    }
    return cssVars as React.CSSProperties
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={divRef}
        className={cn("chart-container relative w-full min-h-60", className)}
        style={style}
      >
        {dims &&
          React.cloneElement(
            children as React.ReactElement<{ width?: number; height?: number }>,
            { width: dims.width, height: dims.height },
          )}
      </div>
    </ChartContext.Provider>
  )
}

export type ChartTooltipContentProps = {
  hideLabel?: boolean
  indicator?: "line" | "dot"
  nameKey?: string
  /** When set, formats the tooltip header label (e.g. ISO date → locale string). */
  labelFormatter?: (value: unknown) => string
} & {
  active?: boolean
  label?: unknown
  payload?: Array<{
    dataKey?: string
    name?: string
    value?: unknown
    payload?: Record<string, unknown>
  }>
}

export function ChartTooltipContent({
  hideLabel,
  indicator = "dot",
  nameKey,
  labelFormatter,
  active,
  label,
  payload,
}: ChartTooltipContentProps) {
  const ctx = React.useContext(ChartContext)

  if (!active || !payload || payload.length === 0) return null

  const firstPayload = payload[0]?.payload
  const resolvedLabel =
    (nameKey && firstPayload ? (firstPayload[nameKey] as unknown) : undefined) ??
    label

  const headerLabel =
    resolvedLabel != null
      ? labelFormatter
        ? labelFormatter(resolvedLabel)
        : String(resolvedLabel)
      : null

  return (
    <div className="rounded-md border bg-popover p-2 shadow-sm">
      {!hideLabel && headerLabel != null && (
        <div className="text-xs font-medium mb-1">{headerLabel}</div>
      )}
      <div className="space-y-1">
        {payload.map((item, idx) => {
          const key = (item.dataKey ?? item.name ?? "value") as string
          const cfg = ctx?.config?.[key]
          const payloadName =
            nameKey && item.payload ? (item.payload[nameKey] as unknown) : undefined
          const displayName = String(
            payloadName ?? cfg?.label ?? item.name ?? key
          )
          const value =
            typeof item.value === "number" ? item.value.toLocaleString() : item.value
          const payloadFill = item.payload?.fill
          const colorVar =
            (cfg?.color && `var(--color-${key})`) ??
            (typeof payloadFill === "string" ? payloadFill : undefined)

          return (
            <div key={`${key}-${idx}`} className="flex items-center gap-2 text-xs">
              {indicator === "line" ? (
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: colorVar ?? "currentColor" }}
                />
              ) : (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: colorVar ?? "currentColor" }}
                />
              )}
              <span className="text-muted-foreground">{displayName}</span>
              <span className="ml-auto font-medium tabular-nums">{String(value ?? 0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChartTooltip({
  content,
  ...props
}: React.ComponentProps<typeof Tooltip> & {
  content?: React.ReactElement
}) {
  return (
    <Tooltip
      {...props}
      content={(tooltipProps) => {
        if (!content) return null
        return React.isValidElement(content)
          ? React.cloneElement(content, tooltipProps as unknown as object)
          : null
      }}
    />
  )
}

