"use client";

import { motion } from "framer-motion";
import HighLights from "./components/HighLights";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


export default function Home() {
  return (
    <main>
      <div className="mt-8">
        <p className="text-[20px] font-bold pt-8">Nnamaka Dike</p>
        <p className="mb-2 border-b border-gray-300 pb-1 inline-block">Machine Learning &amp; Software Engineer</p>
        
        <p className="mt-3 w-[320px] sm:w-[414px] text-[16px]">
          - Hi, I build intelligent systems, refine neural networks, and craft data-driven solutions—always with a touch of {"  "}
          <Link
            href="https://medium.com/@nnamaka7"
            target="_blank"
            className="text-sm italic"
          >
            creativity
          </Link>{" "}
        </p>
        <TooltipProvider delayDuration={100}>
          <p className="mt-4">
          I share my thoughts here and{" "}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="https://medium.com/@nnamaka7"
                  target="_blank"
                  className="text-sm italic cursor-pointer font-extrabold relative transition-all duration-200 hover:underline text-blue-600"
                >
                  there
                </Link>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white px-2 py-1 rounded-md text-xs">
                Medium Articles
              </TooltipContent>
            </Tooltip>
          </p>
        </TooltipProvider>

        <p className="mt-4">
          <motion.span
            whileHover={{ scale: 1.1, color: "#1DB954" }} // Spotify green color
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="cursor-pointer font-bold text-sm italic"
            onClick={() =>
              window.open(
                "https://open.spotify.com/track/7msfmSm4KbVnIds5DvsGzT?si=df42b2af5cd64ac9",
                "_blank"
              )
            }
          >
            Soft music 
          </motion.span>{"   "}
          is often playing in the background while I build.
        </p>
        <HighLights />
      </div>
    </main>
  );
}
