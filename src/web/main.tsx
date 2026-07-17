import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { NotFound } from "./components/NotFound";
import { QueryClientProviderWrapper } from "./lib/api/QueryClientProviderWrapper";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// Local fork: no service worker / offline cache — always serve the live build,
// and clean up any previously installed worker.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister();
    }
  });
}

const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <NotFound />,
});

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line consistent-type-definitions -- for declaration merging
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProviderWrapper>
        <RouterProvider router={router} />
      </QueryClientProviderWrapper>
    </StrictMode>,
  );
}
