"use client";

import { useState } from "react";

export default function LikeButton() {
  const [likes, setLikes] = useState(0);

  return (
    <button
      onClick={() => setLikes(likes + 1)}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      👍 {likes}
    </button>
  );
}