/// <reference types="vite/client" />

interface Window {
  __NEO_PULSE_WP_LOGGED_IN__?: boolean;
}

declare module "*.sql?raw" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.php?raw" {
  const content: string;
  export default content;
}

declare module "virtual:neo-pulse-sites-bootstrap" {
  import type { WordPressSite } from "@/components/integrations/types";
  export const BOOTSTRAP_SITES: WordPressSite[];
  export const BOOTSTRAP_SOURCE: string | null;
}

interface ImportMetaEnv {
  /** Full git SHA when built on Render/Vercel (see vite.config.ts). */
  readonly VITE_DEPLOY_GIT_SHA?: string;
  /** Set when building the NEOPulse Mobile app entry. */
  readonly VITE_MOBILE_APP?: string;
  readonly VITE_MCP_API_BASE?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_NEO_PULSE?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
