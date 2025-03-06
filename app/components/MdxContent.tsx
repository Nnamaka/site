"use client";

import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote";
import { MDXComponents } from "mdx/types";
import dynamic from "next/dynamic";
import LikeButton from "./LikeButton";
import TeX from "@matejmazur/react-katex";
import "katex/dist/katex.min.css";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  {
    ssr: false,
  }
);

const InlineMath = ({ children }: { children: React.ReactNode }) => (
  <TeX>{children}</TeX>
);
const BlockMath = ({ children }: { children: React.ReactNode }) => (
  <TeX block>{children}</TeX>
);

const componentss = {
  SyntaxHighlighter,
  LikeButton,
  InlineMath,
  BlockMath,
};

interface MdxContentProps {
  source: MDXRemoteSerializeResult;
  components?: MDXComponents;
}

export default function MdxContent({
  source,
  components: propComponents,
}: MdxContentProps) {
  const mergedComponents = {
    ...componentss,
    ...(propComponents || {}),
  };

  return <MDXRemote {...source} components={mergedComponents} />;
}
