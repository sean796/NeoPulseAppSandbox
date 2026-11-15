import { Download } from "lucide-react";
import { buildHumanizerDownloadText } from "@/lib/content-humanizer";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { Button } from "@/ui";

function downloadHumanizerTxt() {
  const content = buildHumanizerDownloadText();
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "humanizer.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify.success(NOTIFY_CSV_DOWNLOADED);
}

/** Default generation context: mandatory Humanizer (always visible under Word Blacklist). */
export function HumanizerRunDetail() {
  return (
    <div className="flex h-8 items-center gap-2 px-2.5 sm:px-3">
      <p className="min-w-0 flex-1 text-base font-medium text-white">Humanizer</p>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Button
          size="icon"
          icon={Download}
          variant="quiet"
          type="button"
          title="Download humanizer.txt"
          aria-label="Download humanizer"
          onClick={downloadHumanizerTxt}
        ></Button>
      </div>
    </div>
  );
}
