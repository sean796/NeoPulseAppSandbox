import React, { useState } from "react";
import { CheckCircle2, XCircle, Send, TerminalSquare } from "lucide-react";
import { Button, Input, Textarea } from "@/ui";
import {
  PROJECT_ROOM_STAGING_CONTEXT,
  type ProjectRoomArtifact,
} from "@/components/careers/career-role-data";
import {
  sendProjectRoomChat,
  type ProjectRoomChatTurn,
  type ProjectRoomValidationResult,
} from "@/lib/careers/careers-api";
import { cn } from "@/lib/utils";

const FLAT_TEXTAREA_CLASS =
  "w-full rounded-none border-0 bg-zinc-900 p-3 font-mono text-base text-white placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/55";

export interface CareerProjectRoomPanelProps {
  harnessPrompt: string;
  onHarnessPromptChange: (value: string) => void;
  artifactJson: string;
  onArtifactJsonChange: (value: string) => void;
  jsonParseError: string | null;
  validation: ProjectRoomValidationResult;
  chatHistory: ProjectRoomChatTurn[];
  onChatHistoryChange: (next: ProjectRoomChatTurn[]) => void;
  onApplyProposedArtifact: (artifact: ProjectRoomArtifact) => void;
}

export function CareerProjectRoomPanel({
  harnessPrompt,
  onHarnessPromptChange,
  artifactJson,
  onArtifactJsonChange,
  jsonParseError,
  validation,
  chatHistory,
  onChatHistoryChange,
  onApplyProposedArtifact,
}: CareerProjectRoomPanelProps): React.ReactElement {
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setChatError(null);
    const userTurn: ProjectRoomChatTurn = {
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...chatHistory, userTurn];
    onChatHistoryChange(nextHistory);
    setChatInput("");

    try {
      const res = await sendProjectRoomChat({
        message: trimmed,
        harnessPrompt,
        currentArtifactJson: artifactJson,
        history: nextHistory,
      });
      const assistantTurn: ProjectRoomChatTurn = {
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toISOString(),
      };
      onChatHistoryChange([...nextHistory, assistantTurn]);
      onApplyProposedArtifact(res.proposedArtifact);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to reach Project Room assistant");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-2 bg-zinc-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-white">
              Live AI Project Room: Operator Harness & Staging Verification
            </h2>
          </div>
          <span
            className={cn(
              "shrink-0 px-2.5 py-1 text-base font-medium tabular-nums",
              validation.allPassed && !jsonParseError
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300",
            )}
          >
            {validation.passedCount}/{validation.totalCount} Contract Checks Passed
          </span>
        </div>
        <p className="text-base text-zinc-300">
          We expect operators to collaborate with AI. However, the in-room assistant starts with a
          flawed legacy account memo (wrong brand label from Google Ads MCC, colon in title, direct
          browser wp-json fetch, and no staging pause). Inspect the staging context below, steer the
          in-room assistant or edit the harness rules and JSON artifact directly until all 5
          contract checks pass.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 bg-zinc-950 p-4">
          <h3 className="text-base font-semibold text-white">
            1. Staging Property & GSC Context Inspector
          </h3>
          <div className="flex flex-col gap-1.5 bg-zinc-900 p-3 font-mono text-base text-zinc-200">
            <div>
              <span className="text-muted-foreground">Integrations Brand: </span>
              <span className="font-semibold text-emerald-300">
                {PROJECT_ROOM_STAGING_CONTEXT.integrationsBrandName}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Ads MCC Sub-Account: </span>
              <span className="text-amber-300">
                {PROJECT_ROOM_STAGING_CONTEXT.googleAdsMccSubAccountLabel}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Target URL: </span>
              <span>{PROJECT_ROOM_STAGING_CONTEXT.targetUrl}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Focus Keyword: </span>
              <span>{PROJECT_ROOM_STAGING_CONTEXT.focusKeyword}</span>
            </div>
            <div>
              <span className="text-muted-foreground">GSC 28d Signal: </span>
              <span>{PROJECT_ROOM_STAGING_CONTEXT.gscSignal}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Server Write Route: </span>
              <span className="text-emerald-300">
                {PROJECT_ROOM_STAGING_CONTEXT.serverWriteEndpoint}
              </span>
            </div>
          </div>

          <h3 className="text-base font-semibold text-white">
            2. Live Contract Validator (5 Checks)
          </h3>
          <div className="flex flex-col gap-2">
            {jsonParseError ? (
              <div className="flex items-start gap-2 bg-red-500/15 p-3 text-base text-red-300">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>Invalid JSON in artifact editor: {jsonParseError}</span>
              </div>
            ) : null}
            {validation.checks.map((check) => (
              <div
                key={check.id}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 text-base",
                  check.passed
                    ? "bg-emerald-500/10 text-emerald-200"
                    : "bg-zinc-900 text-zinc-300",
                )}
              >
                {check.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                )}
                <span>{check.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              3. In-Room AI Assistant (OpenRouter)
            </h3>
            <span className="text-base tabular-nums text-muted-foreground">
              {chatHistory.length} messages
            </span>
          </div>

          <div className="flex h-[15rem] flex-col gap-2 overflow-y-auto bg-zinc-900 p-3">
            {chatHistory.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Send a prompt to the in-room assistant. Note: if you just say "solve this", it will
                use its flawed legacy defaults. Steer it with the exact brand, server route, and
                staging verification rules.
              </p>
            ) : (
              chatHistory.map((turn, idx) => (
                <div
                  key={`${turn.timestamp}-${idx}`}
                  className={cn(
                    "flex flex-col gap-0.5 p-2.5 text-base",
                    turn.role === "user"
                      ? "bg-black text-white"
                      : "bg-zinc-950 text-emerald-200",
                  )}
                >
                  <span className="font-semibold text-muted-foreground">
                    {turn.role === "user" ? "You (Operator)" : "In-Room Assistant"}
                  </span>
                  <span>{turn.content}</span>
                </div>
              ))
            )}
          </div>

          {chatError ? (
            <p className="bg-red-500/15 px-3 py-2 text-base text-red-300">{chatError}</p>
          ) : null}

          <form onSubmit={handleSendChat} className="flex items-center gap-2">
            <Input
              aria-label="Prompt the in-room assistant"
              placeholder="Steer the assistant (e.g. Use Shutter Spot, /api/wordpress/update-post-meta, staging approval)..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={sending}
              className="h-9 flex-1 rounded-none border-0 bg-zinc-900 px-3 text-base text-white placeholder:text-muted-foreground"
            />
            <Button
              variant="run"
              type="submit"
              disabled={sending || chatInput.trim().length === 0}
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden />
              <span className="inline-block w-[5.5rem] text-center">
                {sending ? "Running" : "Ask AI"}
              </span>
            </Button>
          </form>

          <h3 className="text-base font-semibold text-white">
            4. Harness System Rules & JSON Artifact Workbench
          </h3>
          <Textarea
            aria-label="Candidate harness prompt rules"
            placeholder="Harness instructions injected into the assistant system prompt..."
            value={harnessPrompt}
            onChange={(e) => onHarnessPromptChange(e.target.value)}
            className={cn(FLAT_TEXTAREA_CLASS, "min-h-[4.5rem]")}
          />
          <Textarea
            aria-label="Project Room JSON artifact"
            placeholder="JSON artifact for staging meta update..."
            value={artifactJson}
            onChange={(e) => onArtifactJsonChange(e.target.value)}
            className={cn(FLAT_TEXTAREA_CLASS, "min-h-[12rem]")}
          />
        </section>
      </div>
    </div>
  );
}
