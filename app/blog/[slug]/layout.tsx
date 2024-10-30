import Link from "next/link";
import { MdOutlineArrowBack } from "react-icons/md";

export default function MdxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose">
      <Link href={"/blog"} className="no-underline">
        <MdOutlineArrowBack className="h-4 w-4"/>
      </Link>
      <div className="mt-3">{children}</div>
    </div>
  );
}
