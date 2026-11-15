import { BOOTSTRAP_SITES } from "virtual:neo-pulse-sites-bootstrap";
import { hydrateSitesBootstrap } from "@/components/integrations/storage";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initOverviewStudioInventoryOnce } from "@/lib/overview/overview-studio-inventory-init";
import "./index.css";
import "@/components/pulse-assist/pulse-assist-theme.css";
import "@/components/organic-dashboard/organic-reporting-print.css";
import "@/components/organic-dashboard/organic-reporting-client-deck.css";

hydrateSitesBootstrap(BOOTSTRAP_SITES);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element '#root' not found in document");
}

initOverviewStudioInventoryOnce();

const root = createRoot(rootElement);
root.render(<App />);
