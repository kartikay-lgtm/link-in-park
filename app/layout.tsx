import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import Backdrop from "@/components/Backdrop";
import Header from "@/components/Header";
import "./globals.css";
import { configured } from "@/lib/env";
import { currentUser, gated } from "@/lib/users";
import { logoutAction } from "./actions";

// Every page depends on who is signed in; nothing here is prerendered.
export const dynamic = "force-dynamic";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Link-in Park",
  description: "Create and track Linkrunner campaign links",
};

export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const user = await currentUser();
  const isGated = await gated();
  // On a laptop with no accounts, everything is open and everyone is an admin.
  const isAdmin = user ? user.role === 'admin' : !isGated;
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        <Backdrop />
        <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-7">
          <div className="shell">
            <Header isAdmin={isAdmin} userName={user?.name || null} right={<>
              {!configured.linkrunner && isAdmin && <Link href="/setup" className="badge badge-warn">Linkrunner not connected</Link>}
              {user && (
                <form action={logoutAction}><button className="btn btn-sm btn-pill" type="submit">Log out</button></form>
              )}
            </>} />
            <main className="shell-body">{children}</main>
          </div>
        </div>
        {modal}
      </body>
    </html>
  );
}
