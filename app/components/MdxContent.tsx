"use client";

import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote";
import { MDXComponents } from "mdx/types";
import dynamic from "next/dynamic";
import LikeButton from "./LikeButton";

// const SyntaxHighlighter = dynamic(() => import("react-syntax-highlighter"), {
//   ssr: false,
// });

const SyntaxHighlighter = dynamic(() => import('react-syntax-highlighter').then(mod => mod.Prism), {
  ssr: false,
});

const components = { SyntaxHighlighter, LikeButton };

interface MdxContentProps {
  source: MDXRemoteSerializeResult;
  components?: MDXComponents;
}

export default function MdxContent({ source, components }: MdxContentProps) {
  const mergedComponents = {
    SyntaxHighlighter,
    ...(components || {}),
  };

  return <MDXRemote {...source} components={mergedComponents} />;
}
