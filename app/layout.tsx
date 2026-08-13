import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VaultMind — AI Document Intelligence",
  description:
    "An encrypted, AI-powered vault that finds, explains, organises, and protects every document you own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('vm-theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
