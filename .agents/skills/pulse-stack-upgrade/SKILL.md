---
name: pulse-stack-upgrade
description: Upgrade Pulse to newer React, Tailwind, Vite, TypeScript, or shadcn versions. Use when the user asks to modernize the stack, bump a major version, or refactor onto newer language or framework APIs. One major at a time. Studio visual rules stay in place.
---

# Pulse stack upgrade

Current stack, from `package.json` and `components.json`:

- React 18.3 and react-dom 18.3, Vite 5.4 SPA (not Next.js)
- TypeScript 5.8
- Tailwind 3.4 (`tailwind.config.ts`, `src/index.css`)
- shadcn style `default`, Radix, UI alias `@/ui`, `rsc: false`
- TanStack Query, Vitest, Storybook

## Order

Bump one major at a time. Do not combine React, Tailwind, and Vite in one change.

1. TypeScript, only when a peer requires it. It is already on 5.8.
2. React 18 to 19. Read `vercel-composition-patterns` and use the React 19 section. Bump `react` and `react-dom` together. Then fix types.
3. Vite, only if the React bump needs a newer Vite.
4. Tailwind 3 to 4, as its own change. Read `tailwind-design-system` for the config move (`@import "tailwindcss"`, `@theme` in `src/index.css`).
5. shadcn component updates after the Tailwind decision. Read `shadcn`. Diff existing `@/ui` files with `npx shadcn@latest add --diff`.

## Which skill applies

| Change | Skill | Leave out |
|---|---|---|
| React 19 APIs | `vercel-composition-patterns` | React 19 APIs while still on 18 |
| Render and bundle performance | `vercel-react-best-practices` | `server-*`, `next/dynamic`, server actions, SWR |
| View transitions | `vercel-react-view-transitions` | Until React is 19.3 or newer, and only if the user asks for motion |
| Tailwind v4 config | `tailwind-design-system` | The sample OKLCH theme and entrance animations |
| Component registry | `shadcn` | `init`, preset apply, Radix to Base UI |

Data fetching stays on TanStack Query and `backendApiUrl`. Skip `references/nextjs.md`.

## Visual rules that survive the upgrade

- Studio page template, flat `bg-zinc-900` wells, inline placeholder labels
- 1rem type floor
- No layout shift after paint
- Existing `@/ui` components. Do not add a second component set.

Do not add `ViewTransition` during the React bump. Motion is a separate request after React 19.3.

## Verify

After each bump:

- `npm run typecheck`
- `npm run test`
- `npm run ui:check` when UI or Tailwind changed

Do not use regex codemods to rewrite components. Do not follow a React 16-to-18 migration guide. This app is already on hooks and `createRoot`.
