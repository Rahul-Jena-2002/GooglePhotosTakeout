import { motion } from "framer-motion"
import { useId } from "react"

export interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartProps {
  data: ChartDataPoint[];
  height?: number;
  color?: "indigo" | "emerald" | "amber" | "red" | "purple";
  showGrid?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}

const COLOR_THEMES = {
  indigo: {
    stroke: "#6366f1",
    gradientStart: "rgba(99,102,241,0.25)",
    gradientEnd: "rgba(99,102,241,0.0)",
    dot: "#818cf8"
  },
  emerald: {
    stroke: "#10b981",
    gradientStart: "rgba(16,185,129,0.25)",
    gradientEnd: "rgba(16,185,129,0.0)",
    dot: "#34d399"
  },
  amber: {
    stroke: "#f5e028",
    gradientStart: "rgba(245,224,40,0.25)",
    gradientEnd: "rgba(245,224,40,0.0)",
    dot: "#fbbf24"
  },
  red: {
    stroke: "#ef4444",
    gradientStart: "rgba(239,68,68,0.25)",
    gradientEnd: "rgba(239,68,68,0.0)",
    dot: "#f87171"
  },
  purple: {
    stroke: "#a855f7",
    gradientStart: "rgba(168,85,247,0.25)",
    gradientEnd: "rgba(168,85,247,0.0)",
    dot: "#c084fc"
  }
}

export function Chart({
  data,
  height = 200,
  color = "indigo",
  showGrid = true,
  prefix = "",
  suffix = "",
  className = ""
}: ChartProps) {
  const gradId = useId()
  const theme = COLOR_THEMES[color] || COLOR_THEMES.indigo

  if (!data || data.length === 0) {
    return (
      <div className={`h-[${height}px] w-full flex items-center justify-center text-zinc-500 italic text-xs border border-zinc-800 bg-zinc-950/20 rounded-xl`}>
        No data available
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const maxVal = Math.max(...values, 10)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal

  const svgWidth = 500
  const svgHeight = height

  const paddingLeft = 45
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 30

  const chartWidth = svgWidth - paddingLeft - paddingRight
  const chartHeight = svgHeight - paddingTop - paddingBottom

  // Generate coordinates
  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * chartWidth
    const y = paddingTop + chartHeight - ((d.value - minVal) / range) * chartHeight
    return { x, y, value: d.value, label: d.label }
  })

  // Create path strings
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
    : ""

  // Gridline values
  const gridLinesCount = 3
  const gridlineYPositions = Array.from({ length: gridLinesCount }).map((_, i) => {
    const ratio = (i + 1) / (gridLinesCount + 1)
    return paddingTop + ratio * chartHeight
  })

  return (
    <div className={`w-full bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-md ${className}`}>
      <svg className="w-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`} height={svgHeight}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.gradientStart} />
            <stop offset="100%" stopColor={theme.gradientEnd} />
          </linearGradient>
        </defs>

        {/* ─── GRIDLINES ─── */}
        {showGrid && (
          <g className="stroke-zinc-800/60" strokeWidth="1" strokeDasharray="3 3">
            {gridlineYPositions.map((y, idx) => (
              <line key={idx} x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} />
            ))}
          </g>
        )}

        {/* ─── AXES LABEL (Y-axis gridlines indicators) ─── */}
        <g className="fill-zinc-500 font-mono text-[9px] text-right" textAnchor="end">
          {/* Max Value */}
          <text x={paddingLeft - 8} y={paddingTop + 4}>
            {prefix}{maxVal.toLocaleString()}{suffix}
          </text>
          {/* Mid Value */}
          <text x={paddingLeft - 8} y={paddingTop + chartHeight / 2 + 4}>
            {prefix}{Math.round((maxVal + minVal) / 2).toLocaleString()}{suffix}
          </text>
          {/* Min Value */}
          <text x={paddingLeft - 8} y={paddingTop + chartHeight + 4}>
            {prefix}{minVal.toLocaleString()}{suffix}
          </text>
        </g>

        {/* ─── AREA PATH (GRADIENT FILL) ─── */}
        {areaPath && (
          <motion.path
            d={areaPath}
            fill={`url(#${gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        )}

        {/* ─── LINE PATH ─── */}
        {linePath && (
          <motion.path
            d={linePath}
            fill="none"
            stroke={theme.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          />
        )}

        {/* ─── DATA DOTS ─── */}
        <g>
          {points.map((p, idx) => (
            <g key={idx} className="group/dot cursor-pointer">
              {/* Glow background */}
              <circle
                cx={p.x}
                cy={p.y}
                r="7"
                fill={theme.stroke}
                className="opacity-0 group-hover/dot:opacity-25 transition-opacity duration-200"
              />
              {/* Solid point */}
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill={theme.dot}
                stroke="#09090b"
                strokeWidth="1"
                className="transition-all group-hover/dot:scale-125"
              />
              {/* Simple inline tooltip on hover */}
              <g className="opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-all duration-200">
                <rect
                  x={p.x - 35}
                  y={p.y - 28}
                  width="70"
                  height="18"
                  rx="4"
                  fill="#18181b"
                  stroke="#27272a"
                  strokeWidth="1"
                />
                <text
                  x={p.x}
                  y={p.y - 16}
                  textAnchor="middle"
                  fill="#ffffff"
                  className="font-mono text-[9px] font-bold"
                >
                  {prefix}{p.value.toLocaleString()}{suffix}
                </text>
              </g>
            </g>
          ))}
        </g>

        {/* ─── X-AXIS LABELS ─── */}
        <g className="fill-zinc-500 font-sans text-[9px]" textAnchor="middle">
          {points.map((p, idx) => {
            // Render alternate labels if data is dense to avoid overlap
            const renderLabel = data.length <= 7 || idx % Math.ceil(data.length / 6) === 0 || idx === data.length - 1
            if (!renderLabel) return null
            return (
              <text key={idx} x={p.x} y={svgHeight - 10} className="font-medium">
                {p.label}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
