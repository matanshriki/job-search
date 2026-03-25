import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ScoreDimensionExplanation } from '@/services/scoring/matchEngine'

function DimensionRow({ d }: { d: ScoreDimensionExplanation }) {
  const pct = d.max > 0 ? Math.min(100, Math.round((d.score / d.max) * 100)) : 0
  const strong = pct >= 72
  const weak = pct < 45
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{d.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.explanation}</p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={cn(
              'font-display text-lg font-bold tabular-nums',
              strong && 'text-emerald-400',
              weak && 'text-muted-foreground',
              !strong && !weak && 'text-primary',
            )}
          >
            {d.score}
          </span>
          <span className="text-xs text-muted-foreground">/{d.max}</span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            strong && 'bg-gradient-to-r from-emerald-500 to-teal-400',
            weak && 'bg-muted-foreground/30',
            !strong && !weak && 'bg-gradient-to-r from-primary to-cyan-400',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
        Weighted contribution toward total match
      </p>
    </div>
  )
}

export function ScoreExplanationPanel({
  dimensions,
  total,
  weightsDescription,
}: {
  dimensions: ScoreDimensionExplanation[]
  total: number
  weightsDescription?: string
}) {
  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">How this score was built</CardTitle>
        <CardDescription>
          Six dimensions sum to <span className="font-medium text-foreground">{total}</span>/100.
          Each bar shows points earned versus the maximum for that dimension.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {weightsDescription ? (
          <p className="text-xs text-muted-foreground">{weightsDescription}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Title and domain carry the most weight; strategic fit captures stage and how well the
            posting overlaps with your narrative.
          </p>
        )}
        <Separator className="bg-border/60" />
        <div className="space-y-2">
          {dimensions.map((d) => (
            <DimensionRow key={d.id} d={d} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
