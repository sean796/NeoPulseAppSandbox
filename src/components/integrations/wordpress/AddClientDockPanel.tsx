import type { ComponentType } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button, Field } from "@/ui";
import { cn } from "@/lib/utils";

export type AddClientDockPanelProps = {
  open: boolean;
  name: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  statusText: string;
  isImporting: boolean;
  onNameChange: (value: string) => void;
  onSiteUrlChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onAppPasswordChange: (value: string) => void;
  onAiImport: () => void;
  onSave: () => void;
  onCancel: () => void;
};

function SpinningLoader({ className }: { className?: string }) {
  return <Loader2 className={cn(className, "animate-spin")} />;
}

/**
 * Left-dock Add Client panel: credentials + spark AI import, then Save.
 * Fixed height region; list above continues to scroll.
 */
export function AddClientDockPanel({
  open,
  name,
  siteUrl,
  username,
  appPassword,
  statusText,
  isImporting,
  onNameChange,
  onSiteUrlChange,
  onUsernameChange,
  onAppPasswordChange,
  onAiImport,
  onSave,
  onCancel,
}: AddClientDockPanelProps) {
  if (!open) return null;

  const canSpark =
    Boolean(siteUrl.trim() && username.trim() && appPassword.trim()) && !isImporting;
  const sparkIcon: ComponentType<{ className?: string }> = isImporting
    ? SpinningLoader
    : Sparkles;

  return (
    <div
      className="neo-pulse-add-client-dock shrink-0 border-0 bg-[#111113] px-1.5 py-2"
      aria-label="Add client"
    >
      <div className="mb-1.5 flex h-8 items-center justify-between gap-2">
        <span className="truncate text-base font-medium text-white">Add client</span>
        <Button
          variant="tool"
          size="icon"
          icon={X}
          type="button"
          onClick={onCancel}
          title="Cancel"
          aria-label="Cancel add client"
          disabled={isImporting}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Field
          placeholder="Site URL"
          value={siteUrl}
          onChange={(e) => onSiteUrlChange(e.target.value)}
          aria-label="Site URL"
          disabled={isImporting}
          autoComplete="url"
        />
        <Field
          placeholder="Username"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          aria-label="WordPress username"
          disabled={isImporting}
          autoComplete="username"
        />
        <Field
          placeholder="Application password"
          type="password"
          value={appPassword}
          onChange={(e) => onAppPasswordChange(e.target.value)}
          aria-label="WordPress application password"
          disabled={isImporting}
          autoComplete="current-password"
        />
        <Field
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="Client name"
          disabled={isImporting}
        />
        <div className="flex h-8 min-w-0 items-center gap-1.5">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-base tabular-nums text-muted-foreground",
              statusText.trim() ? "text-white/80" : "invisible",
            )}
            aria-live="polite"
          >
            {statusText.trim() || "Ready"}
          </p>
          <Button
            variant="tool"
            size="icon"
            icon={sparkIcon}
            type="button"
            onClick={onAiImport}
            disabled={!canSpark}
            title="Import with Neo MCP AI"
            aria-label="Import with Neo MCP AI"
          />
          <Button
            variant="run"
            type="button"
            onClick={onSave}
            disabled={isImporting || !siteUrl.trim()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
