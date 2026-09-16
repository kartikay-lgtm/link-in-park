import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import ThemePicker from "@/components/ThemePicker";
import "./globals.css";
import { configured } from "@/lib/env";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Link-in Park",
  description: "Create and track Linkrunner campaign links",
};

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so dark themes never flash white. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('lip-theme');if(t&&t!=='paper')document.documentElement.setAttribute('data-theme',t)}catch(e){}" }} />
      </head>
      <body>
        <header style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <div className="mx-auto max-w-[1280px] px-6 h-12 flex items-center gap-7">
            <Link href="/" aria-label="Link-in Park home"><Logo /></Link>
            <nav className="flex items-center gap-1 text-[13.5px]">
              <Link href="/" className="btn btn-sm">Campaigns</Link>
              <Link href="/web-users" className="btn btn-sm">Web users</Link>
              <Link href="/new" className="btn btn-sm">New link</Link>
              <Link href="/setup" className="btn btn-sm">Setup</Link>
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <ThemePicker />
              {!configured.linkrunner && <Link href="/setup" className="badge badge-warn">Linkrunner not connected</Link>}
              {configured.auth && (
                <form action={logoutAction}><button className="btn btn-sm muted" type="submit">Log out</button></form>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-6 py-7">{children}</main>
        {modal}
      </body>
    </html>
  );
}
