import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
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
        <Header right={<>
          <ThemePicker />
          {!configured.linkrunner && <Link href="/setup" className="badge badge-warn">Linkrunner not connected</Link>}
          {configured.auth && (
            <form action={logoutAction}><button className="btn btn-sm muted" type="submit">Log out</button></form>
          )}
        </>} />
        <main className="mx-auto max-w-[1280px] px-6 py-7">{children}</main>
        {modal}
      </body>
    </html>
  );
}
