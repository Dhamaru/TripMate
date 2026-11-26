import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  const [location] = useLocation();
  // /app/maps runs a full-bleed layout with its own bottom sheet (peek bar +
  // collapse chevron) anchored at the same bottom-right corner the toast
  // viewport defaults to — live-confirmed a "Navigation Started" toast
  // rendering directly on top of the sheet's handle, blocking it. Same
  // exclusion zone App.tsx already carves out for the Atlas trigger button.
  const isMapsPage = location.startsWith("/app/maps");

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport className={isMapsPage ? "sm:bottom-40" : undefined} />
    </ToastProvider>
  );
}
