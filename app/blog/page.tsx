import BlogClient from "./components/BlogClient";
import { getPosts } from "./utils/getPost";

export default async function blog() {
  const blogPosts = await getPosts();

  return <BlogClient blogPosts={blogPosts} />;
}
