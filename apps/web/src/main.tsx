import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/project-hub.css";
import "./styles/workspace.css";
import "./styles/modules.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
