import type { Metadata } from "next";
import { Quicksand, Inter, Caveat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComposeDialog } from "@/components/compose-dialog";
import Link from "next/link";
import { ListChecks, MessageCircle } from "lucide-react";
import { isAdmin } from "@/lib/admin";
import { TIME_ZONE } from "@/lib/days";

const quicksand = Quicksand({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

function HeaderDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <span className="hidden sm:inline text-[13px] text-[var(--text-secondary)] font-medium">
      {formatted}
    </span>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const canWrite = await isAdmin();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${quicksand.variable} ${inter.variable} ${caveat.variable} antialiased`}
      >
        <ThemeProvider>
          <header className="flex items-center justify-between px-4 sm:px-10 py-5 border-b border-[var(--border)] sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-xl">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-terracotta)] flex items-center justify-center shadow-[var(--shadow-md)]">
                <MessageCircle className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <span className="font-heading text-xl font-bold tracking-tight">Daily Thoughts</span>
            </Link>
            <div className="flex items-center gap-4">
              <HeaderDate />
              {canWrite && (
                <Link
                  href="/questions"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--card)] transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"
                >
                  <ListChecks className="h-4 w-4 text-[var(--accent-amber)]" />
                  <span className="sr-only">Questions</span>
                </Link>
              )}
              {canWrite && <ComposeDialog />}
              <ThemeToggle />
            </div>
          </header>
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
