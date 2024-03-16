import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NavBar from "./components/NavBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nnamaka Dike",
  description: "Personal website",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html lang="en">
      <body
        className={`flex flex-col items-center justify-between h-dvh overflow-y-scroll no-scrollbar ${inter.className}`}
      >
        <div className="flex-col">
          <div className="w-[430px] sm:w-[582px] ">
            <NavBar />
            <div className="px-6">{children}</div>
          </div>
        </div>
        <p className="flex justify-center font-medium p-2 my-8">{`© ${year}`}</p>
      </body>
    </html>
  );
}
