import { type FC, useState } from "react";
import { Outlet } from "react-router";
import { MobileNav } from "./mobile-nav";
import { Rail } from "./rail";
import { Topbar } from "./topbar";

export const AppLayout: FC = () => {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Rail />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
