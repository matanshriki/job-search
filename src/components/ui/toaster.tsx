import { X } from 'lucide-react'
import { useToastState, useToastDispatch } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts } = useToastState()
  const dispatch = useToastDispatch()

  if (!dispatch) return null

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto mb-2 flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm',
            t.variant === 'success' && 'border-emerald-500/30 bg-emerald-500/10',
            t.variant === 'destructive' && 'border-destructive/40 bg-destructive/10',
            (!t.variant || t.variant === 'default') && 'border-border bg-card/95',
          )}
        >
          <div className="grid flex-1 gap-1">
            {t.title ? <p className="text-sm font-semibold">{t.title}</p> : null}
            {t.description ? (
              <p className="text-sm text-muted-foreground">{t.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md p-1 opacity-70 hover:opacity-100"
            onClick={() => dispatch({ type: 'DISMISS', id: t.id })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
