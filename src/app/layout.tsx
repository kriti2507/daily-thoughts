import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, Inter } from "next/font/google";
import Link from "next/link";
import { Cloud, ListChecks } from "lucide-react";

import "./globals.css";
import { ComposeDialog } from "@/components/compose-dialog";
import { ModeSwitch } from "@/components/mode-switch";
import { ThemeProvider } from "@/components/theme-provider";
import { isAdmin } from "@/lib/admin";

const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["800"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Daily Thoughts",
  description: "Thoughts sent to a Telegram bot, collected on one page",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const canWrite = await isAdmin();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${inter.variable} ${caveat.variable} antialiased`}>
        <ThemeProvider>
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-[length:var(--line)] border-[var(--ink)] bg-[var(--paper)]/90 px-4 py-4 backdrop-blur-md sm:px-10">
            <Link href="/" className="flex items-center gap-3">
              <span className="pop hidden h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] sm:flex">
                <Cloud className="h-5 w-5 text-[var(--surface)]" strokeWidth={2.5} />
              </span>
              <span className="misprint whitespace-nowrap font-heading text-xl tracking-tight text-[var(--brand)] sm:text-2xl">
                Daily Thoughts
              </span>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-3">
              {canWrite && (
                <Link
                  href="/questions"
                  className="pop flex h-10 w-10 items-center justify-center rounded-xl"
                >
                  <ListChecks className="h-4 w-4" />
                  <span className="sr-only">Questions</span>
                </Link>
              )}
              {canWrite && <ComposeDialog />}
              <ModeSwitch />
            </div>
          </header>
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
