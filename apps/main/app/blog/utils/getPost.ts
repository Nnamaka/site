import path from "path";
import fs from 'fs';
import matter from 'gray-matter';

export async function getPosts() {
  const files = fs.readdirSync(path.join('app', 'blog', 'posts'));

  const posts = files.map(filename => {
    const post = fs.readFileSync(path.join('app', 'blog', 'posts', filename), 'utf-8');
    const { data: frontMatter } = matter(post);

    return {
      frontMatter,
      slug: filename.split('.')[0]
    }
  });

  return posts;
}

