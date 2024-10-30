import Link from 'next/link'
import { getPosts } from "./utils/getPost";

export default async function blog() {
  const blogPosts = await getPosts();

  return (
    <div className="flex-col mt-[70px] w-[337px] sm:w-[536px] md:w-[706px]">
      {
        blogPosts.map( post => (
          <Link key={post.slug} href={'blog/' + post.slug}>
            <p className="font-bold">{post.frontMatter.title}</p>
            <p className="text-[14px]">{post.slug.replace(/-/g, " ")}</p>
            <p className="text-[11px] mt-[6px]">{post.frontMatter.date}</p>
          </Link>
        ))
      }
    </div>
  );
}

