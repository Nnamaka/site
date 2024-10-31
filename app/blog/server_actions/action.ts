"use server"

import fs from "fs";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import path from "path";

export async function getPostContent(slug: string) {
  const fileName = slug.replace(/ /g, "-") + ".mdx";
  console.log(fileName)
  const post = fs.readFileSync(
    path.join("app", "blog", "posts", fileName )
  );

  const { data: frontMatter, content } = matter(post);
  const mdxSource = await serialize(content);

  return {
    post: {
      frontMatter,
      mdxSource
    },
  };
}
