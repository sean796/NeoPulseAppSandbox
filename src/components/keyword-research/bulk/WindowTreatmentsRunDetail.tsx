import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  buildWindowTreatmentsRulesDownloadText,
  fetchWindowTreatmentsLivePrompt,
} from "@/lib/window-treatments-vertical/window-treatments-live-prompt";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { Button } from "@/ui";

function downloadWindowTreatmentsRulesTxt(livePrompt: string) {
  const content = buildWindowTreatmentsRulesDownloadText(livePrompt);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "window-treatments-rules.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify.success(NOTIFY_CSV_DOWNLOADED);
}

/** Standing blinds vertical rules (visible under Google SEO Rules for blinds clients). */
export function WindowTreatmentsRunDetail() {
  const [livePrompt, setLivePrompt] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchWindowTreatmentsLivePrompt()
      .then((payload) => {
        if (!cancelled) {
          setLivePrompt(payload.livePrompt);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLivePrompt("");
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = !loaded
    ? "Window Treatments Rules"
    : livePrompt.trim()
      ? "Window Treatments Rules"
      : "No window treatments rules yet.";

  return (
    <div className="flex h-8 items-center gap-2 px-2.5 sm:px-3">
      <p className="min-w-0 flex-1 truncate text-base font-medium text-white">{label}</p>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Button
          size="icon"
          icon={Download}
          variant="quiet"
          type="button"
          title="Download window-treatments-rules.txt"
          aria-label="Download window treatments rules"
          onClick={() => downloadWindowTreatmentsRulesTxt(livePrompt)}
        ></Button>
      </div>
    </div>
  );
}
