import type { FC, ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PendingHold } from "@/components/ui/states";
import { useSession } from "@/lib/queries";

/** authed routes wait for the session answer before deciding, so a slow
    session check never flashes the sign-in page at a signed-in user */
export const RequireAuth: FC<{ children: ReactNode }> = ({ children }) => {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    // a cached session answers in about 40ms, which is too fast to show
    // anything without it reading as a flicker
    return <PendingHold label="Checking your session" />;
  }

  if (session.data == null) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

/** the inverse: an already-signed-in user should never see the auth pages */
export const RedirectIfAuthed: FC<{ children: ReactNode }> = ({ children }) => {
  const session = useSession();

  if (session.isPending) return null;
  if (session.data != null) return <Navigate to="/" replace />;

  return <>{children}</>;
};
