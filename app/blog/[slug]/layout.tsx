import Link from "next/link";
import { MdOutlineArrowBack } from "react-icons/md";

export default function MdxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose">
      <Link href={"/blog"} className="no-underline  space-x-1 items-center inline-flex mb-4">
        <MdOutlineArrowBack className="h-4 w-4"/>
        <div>Back to blog</div>
      </Link>
      <div className="mt-3">{children}</div>
    </div>
  );
}
