/* eslint-disable react-refresh/only-export-components -- provider + hooks */
import * as React from 'react'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 4000

export type ToastVariant = 'default' | 'success' | 'destructive'

export interface ToastData {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

type Action =
  | { type: 'ADD'; toast: ToastData }
  | { type: 'DISMISS'; id: string }

interface State {
  toasts: ToastData[]
}

const ToastContext = React.createContext<{
  state: State
  dispatch: React.Dispatch<Action>
} | null>(null)

let count = 0
function genId() {
  count = (count + 1) % 1_000_000
  return `toast-${Date.now()}-${count}`
}

export function ToastStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer((prev: State, action: Action): State => {
    switch (action.type) {
      case 'ADD': {
        return {
          toasts: [action.toast, ...prev.toasts].slice(0, TOAST_LIMIT),
        }
      }
      case 'DISMISS': {
        return {
          ...prev,
          toasts: prev.toasts.filter((t) => t.id !== action.id),
        }
      }
      default:
        return prev
    }
  }, { toasts: [] })

  return (
    <ToastContext.Provider value={{ state, dispatch }}>{children}</ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  const dispatch = ctx?.dispatch

  const toast = React.useCallback(
    (t: Omit<ToastData, 'id'>) => {
      if (!dispatch) return
      const id = genId()
      dispatch({
        type: 'ADD',
        toast: { ...t, id },
      })
      window.setTimeout(() => dispatch({ type: 'DISMISS', id }), TOAST_REMOVE_DELAY)
    },
    [dispatch],
  )

  const dismiss = React.useCallback(
    (id: string) => {
      dispatch?.({ type: 'DISMISS', id })
    },
    [dispatch],
  )

  return { toast, dismiss }
}

export function useToastState() {
  const ctx = React.useContext(ToastContext)
  return ctx?.state ?? { toasts: [] }
}

export function useToastDispatch() {
  const ctx = React.useContext(ToastContext)
  return ctx?.dispatch ?? null
}
