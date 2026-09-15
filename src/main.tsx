import { createRoot } from "react-dom/client";
import { DirectoryScreen } from "./screens/DirectoryScreen";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/nunito-sans/latin-400.css";
import "@fontsource/nunito-sans/latin-600.css";
import "@fontsource/nunito-sans/latin-700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<DirectoryScreen />);
