import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FC } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { RedirectIfAuthed, RequireAuth } from "@/components/auth/route-guard";
import { AppLayout } from "@/components/shell/app-layout";
import { ApiError } from "@/lib/api";
import { BuildPage } from "@/pages/build";
import { ChainPage } from "@/pages/chain";
import { NotBuiltYet } from "@/pages/placeholder";
import { SettingsPage } from "@/pages/settings";
import { SignInPage } from "@/pages/sign-in";
import { SignUpPage } from "@/pages/sign-up";
import { StrategiesPage } from "@/pages/strategies";
import { SurfacePage } from "@/pages/surface";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // a 404 or a 401 will not become a 200 by asking again, so only
      // server and network faults are worth retrying
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export const App: FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route
          path="/sign-in"
          element={
            <RedirectIfAuthed>
              <SignInPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/sign-up"
          element={
            <RedirectIfAuthed>
              <SignUpPage />
            </RedirectIfAuthed>
          }
        />

        <Route element={<AppLayout />}>
          <Route index element={<SurfacePage />} />
          <Route path="chain" element={<ChainPage />} />
          <Route path="build" element={<BuildPage />} />
          <Route
            path="strategies"
            element={
              <RequireAuth>
                <StrategiesPage />
              </RequireAuth>
            }
          />
          <Route
            path="settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="*"
            element={<NotBuiltYet title="Not found" detail="That page does not exist." />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);
