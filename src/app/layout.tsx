import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "V Square Projects — AI Sales Command Center", template: "%s · V Square AI" },
  description: "AI-powered real estate sales automation for V Square Projects. Developed by Nexobova HQ.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#070b16", width: "device-width", initialScale: 1 };

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('vs-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
