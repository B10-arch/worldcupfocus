import { createFileRoute, redirect } from "@tanstack/react-router";

// The combined auth page was split into dedicated /login and /signup routes.
// Keep /auth working as a permanent redirect for old links/bookmarks.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
