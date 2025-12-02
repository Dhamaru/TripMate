import { useSidebar as useUiSidebar } from "@/components/ui/sidebar"

export function useSidebar() {
  const ctx = useUiSidebar()
  return {
    isOpen: ctx.open,
    toggle: ctx.toggleSidebar,
    setOpen: ctx.setOpen,
    open: ctx.open,
    state: ctx.state,
  }
}

