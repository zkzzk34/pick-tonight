import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./browser/App";
import "./styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("PickTonight could not find its application root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
