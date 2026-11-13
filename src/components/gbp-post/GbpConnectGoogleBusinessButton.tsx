import { CheckCircle } from "lucide-react";
import { useGmbConnectionStatus } from "@/hooks/gbp-post/use-gmb-connection-status";
import { Button } from "@/ui";

const CONNECT_SLOT_CLASS = "inline-flex h-8 min-w-[11rem] shrink-0 items-center justify-center";

const CONNECTED_BTN_CLASS =
  `${CONNECT_SLOT_CLASS} gap-1.5 rounded-none border-0 bg-ui-field px-2.5 text-base font-medium text-primary shadow-none cursor-default`;

/**
 * Opens server OAuth flow (GET /api/gmb/authorize) in a new tab when not connected.
 */
export function GbpConnectGoogleBusinessButton({
  variant: _variant = "default",
  label = "Connect Google Business",
}: {
  variant?: "default" | "toolbar" | "titleBar";
  /** Button label when not connected. */
  label?: string;
}) {
  const { connected, loading, refresh } = useGmbConnectionStatus();

  if (loading) {
    return (
      <span className={CONNECTED_BTN_CLASS} aria-live="polite">
        Checking GBP…
      </span>
    );
  }

  if (connected) {
    return (
      <span className={CONNECTED_BTN_CLASS} aria-live="polite">
        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
        GBP connected
      </span>
    );
  }

  return (
    <Button
      variant="quiet"
      className="h-8"
      onClick={() => {
        window.open("/api/gmb/authorize", "_blank", "noopener,noreferrer");
        window.setTimeout(() => refresh(), 1500);
      }}
    >
      {label}
    </Button>
  );
}
