import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Nobodys｜数据服务",
  description: "Nobodys 服务，支持各类平台，提供粉丝、点赞、播放量等数据服务。无最低充值限制，用多少充多少。",
  icons: {
    icon: "/logo.jpg",
    shortcut: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body
        className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${notoSansSC.variable} h-full bg-[#0A0A0A] overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
