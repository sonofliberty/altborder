import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./mapThemeLayers.css";
import "./editorHud.css";

createRoot(document.getElementById("root")!).render(<App />);
