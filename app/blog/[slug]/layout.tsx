import Link from "next/link";
import { FaAngleLeft } from "react-icons/fa6";

export default function MdxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose">
      <Link href={"/blog"} className="no-underline  space-x-1 items-center inline-flex mb-[53px]">
        <FaAngleLeft className="h-4 w-4"/>
        <div>Back to blog</div>
      </Link>
      <div>{children}</div>
    </div>
  );
}
