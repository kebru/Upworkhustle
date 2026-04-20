import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Upwork Job Evaluator",
  description:
    "Bewertet Upwork-Job-Postings auf Eignung für Cursor und Vibe Coding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} min-h-screen antialiased`}>
        <header className="border-b border-white/10 bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-accent"
            >
              Upwork Job Evaluator
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="text-muted transition-colors hover:text-white">
                Bewerten
              </Link>
              <Link href="/history" className="text-muted transition-colors hover:text-white">
                Verlauf
              </Link>
              <Link href="/compare" className="text-muted transition-colors hover:text-white">
                Vergleich
              </Link>
              <Link href="/stats" className="text-muted transition-colors hover:text-white">
                Statistiken
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
