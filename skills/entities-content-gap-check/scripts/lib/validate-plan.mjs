/** Validate schedule plan against count JSON. */

import { dateInMonth } from "./calendar.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * @param {object} count
 * @param {object} plan
 * @returns {{ ok: true, plan: object } | { ok: false, errors: string[] }}
 */
export function validateSchedulePlan(count, plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, errors: ['plan must be a JSON object with "publishDates" and "publishTime"'] };
  }

  const gap = Number(count?.gap);
  if (!Number.isInteger(gap) || gap < 0) {
    return { ok: false, errors: [`count.gap must be a non-negative integer. Received: ${String(count?.gap)}`] };
  }

  if (gap === 0) {
    return { ok: false, errors: ["gap is 0; do not create a schedule plan"] };
  }

  const dates = plan.publishDates;
  if (!Array.isArray(dates)) {
    errors.push('publishDates must be an array of YYYY-MM-DD strings');
  } else if (dates.length !== gap) {
    errors.push(
      `publishDates length must equal gap ${gap}. Received: ${dates.length}`,
    );
  }

  const time = plan.publishTime;
  if (typeof time !== "string" || !TIME_RE.test(time)) {
    errors.push(`publishTime must be HH:MM. Received: ${JSON.stringify(time)}`);
  } else {
    const [hh, mm] = time.split(":").map(Number);
    if (hh > 23 || mm > 59) {
      errors.push(`publishTime out of range. Received: "${time}"`);
    }
  }

  const month = String(count.month ?? "");
  const lastAllowed = String(count.lastAllowedDay ?? "");
  const occupied = new Set(
    Array.isArray(count.occupiedDates)
      ? count.occupiedDates.map((d) => String(d))
      : [],
  );
  const seen = new Set();

  if (Array.isArray(dates)) {
    dates.forEach((raw, index) => {
      const ymd = String(raw ?? "");
      if (!DATE_RE.test(ymd)) {
        errors.push(`publishDates[${index}] must be YYYY-MM-DD. Received: ${JSON.stringify(raw)}`);
        return;
      }
      if (!dateInMonth(ymd, month)) {
        errors.push(
          `publishDates[${index}] ${ymd} is outside month ${month}.`,
        );
      }
      if (lastAllowed && ymd > lastAllowed) {
        errors.push(
          `publishDates[${index}] ${ymd} is after lastAllowedDay ${lastAllowed}. Occupied: ${[...occupied].join(", ") || "(none)"}`,
        );
      }
      if (occupied.has(ymd)) {
        errors.push(
          `publishDates[${index}] ${ymd} is occupied. Occupied: ${[...occupied].join(", ")}`,
        );
      }
      if (seen.has(ymd)) {
        errors.push(`publishDates[${index}] ${ymd} is duplicated`);
      }
      seen.add(ymd);
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    plan: {
      publishDates: dates.map((d) => String(d)),
      publishTime: String(time),
    },
  };
}
