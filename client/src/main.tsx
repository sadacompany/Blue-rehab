import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/pages.css";

/**
 * The router shares Vite's base path.
 *
 * On its own domain that is "/" and nothing changes. On GitHub Pages the site
 * lives under /Blue-rehab/, and without a basename every route would resolve
 * against the domain root — every internal link a 404.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
