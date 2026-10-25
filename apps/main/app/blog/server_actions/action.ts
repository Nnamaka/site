"use server";

import fs from "fs";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import path from "path";
import readingTime from "reading-time"; 

export async function getPostContent(slug: string) {
  const fileName = slug.replace(/ /g, "-") + ".mdx";
  const fullPath = path.join(process.cwd(), "app", "blog", "posts", fileName);

  console.log("Attempting to read file from:", fullPath);

  const post = fs.readFileSync(fullPath, "utf-8");

  const { data: frontMatter, content } = matter(post);
  const mdxSource = await serialize(content);

  const readTime = readingTime(content).text;

  return {
    post: {
      frontMatter,
      mdxSource,
      readTime, 
    },
  };
}
