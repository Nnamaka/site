import { RiTwitterXFill as TwitterIcon } from "react-icons/ri";
import { FaLinkedin as LinkedinIcon } from "react-icons/fa";
import { VscGithubInverted as GithubIcon } from "react-icons/vsc";
import Link from "next/link";

export default function NavBar() {
  return (
    <div className="flex justify-center ">
      <div className="flex w-[706px] justify-between p-6">
        <div className="Route flex space-x-[30px]">
          <Link href={"/"}>
            <h1>Home</h1>
          </Link>
          <Link href={"/apps"}>
            <h1>Apps</h1>
          </Link>
          <Link href={"blog"}>
            <h1>Blog</h1>
          </Link>
        </div>

        <div className="Icons flex space-x-5 items-center">
          <TwitterIcon className="w-5 h-9" />
          <LinkedinIcon className="w-5 h-9" />
          <GithubIcon className="w-5 h-9" />
        </div>
      </div>
    </div>
  );
}
