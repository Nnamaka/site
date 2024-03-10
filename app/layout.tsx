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
        className={`flex justify-center ${inter.className}`}
        style={{ height: "100vh" }}
      >
        <div className="flex flex-col h-full">
          <div className="flex-col  h-full ">
            <div className="w-[706px]">
              <NavBar />
              <div className="px-6">{children}</div>
            </div>
          </div>
          <p className="flex justify-center p-2">{`© ${year}`}</p>
        </div>
      </body>
    </html>
  );
}
