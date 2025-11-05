import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NavBar from "./components/NavBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nnamaka-ML",
  description: "ML Engineering with Nnamaka Dike",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html lang="en">
      <body className={`${inter.className}`}>
        <div className="flex flex-col items-center justify-between mx-2 mb-2">
          <div className="w-screen sm:w-[582px] md:w-[674px] sm:px-6 md:px-8">
            <NavBar />
            <div className="px-6">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
