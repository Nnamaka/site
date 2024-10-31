import { getPostContent } from "../server_actions/action";
import { notFound } from 'next/navigation';
import MdxContent from "../../components/MdxContent";
import LikeButton from "@/app/components/LikeButton";

const components = { LikeButton };

export default async function page({ params }: { params: { slug: string } }) {
  const {
    post: { frontMatter, mdxSource },
  } = await getPostContent(params.slug);

  if (!mdxSource) {
    notFound();
  }

  return (
    <div>
      <div>
        {/* <MdxContent source={mdxSource} components={components} /> */}
        show here
      </div>
    </div>
  );
}
