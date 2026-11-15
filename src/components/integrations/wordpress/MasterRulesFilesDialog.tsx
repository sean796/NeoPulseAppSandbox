import { Download, FileText, Trash2 } from "lucide-react";
import type { MasterInstructionSource } from "@/lib/master-instructions-storage";
import { GBP_ADDRESS_MASTER_RULES_FILENAME } from "@/lib/master-rules-gbp-address-import";
import { formatDateTime } from "@/components/hosting/site-profile/site-profile-view-model";
import { Button, DialogShell } from "@/ui";

function isGbpAddressJsonKind(kind: MasterInstructionSource["kind"]): boolean {
  return kind === "gbp-address-json";
}

function summaryDownloadFilename(
  sourceName: string,
  kind?: MasterInstructionSource["kind"],
): string {
  const base = sourceName
    .replace(/\.[^/.]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const suffix =
    kind === "semantic-triples" ? "master-rules-nested-triples" : "master-rules-summary";
  return `${base || "instructions"}-${suffix}.txt`;
}

function downloadStoredText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatUploadedAt(uploadedAt: number | undefined): string {
  if (!uploadedAt || !Number.isFinite(uploadedAt)) return "";
  return formatDateTime(new Date(uploadedAt).toISOString());
}

function summaryLine(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export type MasterRulesFilesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: MasterInstructionSource[];
  disabled?: boolean;
  editing?: boolean;
  busy?: boolean;
  onRemoveAt: (index: number) => void;
};

export function MasterRulesFilesDialog({
  open,
  onOpenChange,
  sources,
  disabled = false,
  editing = false,
  busy = false,
  onRemoveAt,
}: MasterRulesFilesDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Master Rules"
      size="lg"
    >
      <ul
        className="flex h-72 flex-col gap-1 overflow-y-auto"
        aria-label="Master rule files"
      >
        {sources.length === 0 ? (
          <li className="flex h-11 shrink-0 items-center bg-black px-3 text-base text-muted-foreground">
            No files
          </li>
        ) : (
          sources.map((source, index) => {
            const dateLabel = formatUploadedAt(source.uploadedAt);
            const summary = summaryLine(source.content);
            const canDownload = Boolean(source.content.trim());
            return (
              <li
                key={`${source.name}-${source.uploadedAt}-${index}`}
                className="flex h-11 shrink-0 items-center gap-3 bg-black px-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-white" aria-hidden />
                <span
                  className="min-w-0 w-40 shrink-0 truncate text-base font-medium text-white"
                  title={source.name}
                >
                  {source.name}
                </span>
                <span
                  className="w-[9.5rem] shrink-0 truncate text-base tabular-nums text-muted-foreground"
                  title={dateLabel || undefined}
                >
                  {dateLabel}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-base text-muted-foreground"
                  title={summary || undefined}
                >
                  {summary}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {canDownload ? (
                    <Button
                      type="button"
                      variant="quiet"
                      disabled={disabled || busy}
                      aria-label={`Download ${source.name}`}
                      onClick={() =>
                        downloadStoredText(
                          source.name === GBP_ADDRESS_MASTER_RULES_FILENAME ||
                            isGbpAddressJsonKind(source.kind)
                            ? source.name
                            : summaryDownloadFilename(source.name, source.kind),
                          source.content,
                        )
                      }
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <span className="inline-flex h-8 w-8 shrink-0" aria-hidden />
                  )}
                  {editing ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon"
                      icon={Trash2}
                      disabled={disabled || busy}
                      aria-label={`Remove ${source.name}`}
                      onClick={() => onRemoveAt(index)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </DialogShell>
  );
}
