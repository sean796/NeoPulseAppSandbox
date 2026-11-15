/** Drive one server agent run until it is done, failed, or cancelled. */

export async function driveAgentRun({ apiBase, bearer, teamId, runId, onTick, sleepMs = 5000 }) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };

  for (;;) {
    const processRes = await fetch(`${apiBase}/api/agent-runs/${runId}/process`, {
      method: "POST",
      headers,
      body: JSON.stringify({ teamId: Number(teamId) }),
    });
    const processed = await processRes.json().catch(() => ({}));
    let run = processed.run;

    if (!run) {
      const readRes = await fetch(
        `${apiBase}/api/agent-runs/${runId}?teamId=${encodeURIComponent(String(teamId))}`,
        { headers },
      );
      const read = await readRes.json().catch(() => ({}));
      run = read.run;
    }

    if (!run) {
      const err = new Error(processed.error || `Agent run ${runId} is unavailable`);
      err.code = "WORKER";
      throw err;
    }

    if (typeof onTick === "function") onTick(run);

    const status = String(run.status || "");
    if (status === "done" || status === "failed" || status === "cancelled") {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}
