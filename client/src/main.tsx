import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
// Before shell/pages/promotions on purpose: forms.css sets the base every text
// control in the product inherits, and the later sheets refine specific ones
// (the sign-in card, the composed search and unit fields). Load order is the
// override order.
import "./styles/forms.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/admin.css";
import "./styles/promotions.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
