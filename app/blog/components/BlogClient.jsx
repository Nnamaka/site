// app/blog/components/BlogClient.jsx - Client Component
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Create a loader component
const LoaderOverlay = () => (
  <div className="fixed inset-0 flex items-center justify-center z-50">
    <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"></div>
    <div className="relative z-10 flex flex-col items-center">
      <Loader2 className="h-4 w-4 animate-spin" />
      {/* <span className="text-white mt-2">Loading...</span> */}
    </div>
  </div>
);

export default function BlogClient({ blogPosts }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleNavigation = (slug) => {
    setIsLoading(true);
    router.push(`/blog/${slug}`);
  };

  return (
    <>
      {isLoading && <LoaderOverlay/>}
      <div className="flex-col mt-16 w-full max-w-xs sm:max-w-md md:max-w-lg space-y-4 px-4">
        {blogPosts.map((post) => (
          <div
            key={post.slug}
            onClick={() => handleNavigation(post.slug)}
            className="p-4 border border-gray-200 rounded-md hover:shadow-md cursor-pointer transition-all"
          >
            <p className="font-bold">{post.frontMatter.title}</p>
            <p className="text-sm">{post.slug.replace(/-/g, " ")}</p>
            <p className="text-xs mt-1.5">{post.frontMatter.date}</p>
          </div>
        ))}
      </div>
    </>
  );
}
