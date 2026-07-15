import { createRouter, createRootRoute, createRoute, Outlet, Link } from "@tanstack/react-router";
import { VrmViewerPage } from "./routes/index";
import { DebugPage } from "./routes/debug";
import { LivePage } from "./routes/live";

function RootLayout() {
  return (
    <>
      <nav
        style={{
          position: "fixed",
          top: 8,
          right: 12,
          zIndex: 100,
          display: "flex",
          gap: 12,
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        <Link
          to="/"
          style={{ color: "#aaa", textDecoration: "none" }}
          activeProps={{ style: { color: "#fff" } }}
        >
          VRM
        </Link>
        <Link
          to="/live"
          style={{ color: "#aaa", textDecoration: "none" }}
          activeProps={{ style: { color: "#fff" } }}
        >
          Live
        </Link>
        <Link
          to="/debug"
          style={{ color: "#aaa", textDecoration: "none" }}
          activeProps={{ style: { color: "#fff" } }}
        >
          Debug
        </Link>
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: VrmViewerPage,
});
const debugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debug",
  component: DebugPage,
});
const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/live",
  component: LivePage,
});

const routeTree = rootRoute.addChildren([indexRoute, liveRoute, debugRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
