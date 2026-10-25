import { getPostContent } from "../server_actions/action";
import MdxContent from "../../components/MdxContent";
import LikeButton from "@/app/components/LikeButton";
import { FaClock } from "react-icons/fa6";

const components = { LikeButton };

export default async function page({ params }: { params: { slug: string } }) {
  const {
    post: { frontMatter, mdxSource, readTime },
  } = await getPostContent(params.slug);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p>{frontMatter.date}</p>
        <div className="flex items-center justify-between space-x-2">
          <FaClock className="h-4 w-4" />
          <p>{readTime}</p>
        </div>
      </div>
      <div>
        <MdxContent source={mdxSource} components={components} />
      </div>
    </div>
  );
}
