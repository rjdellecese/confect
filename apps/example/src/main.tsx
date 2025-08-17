import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import App from "./App";
import { EffectAtomPage } from "./pages/effect-atom";
import { EffectOnlyPage } from "./pages/effect-only";

import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConvexProvider client={convexClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<EffectOnlyPage />} />
            <Route path="/effect-atom" element={<EffectAtomPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>
);
