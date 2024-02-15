import { RiTwitterXFill as TwitterIcon } from "react-icons/ri";
import { FaLinkedin as LinkedinIcon } from "react-icons/fa";
import { VscGithubInverted as GithubIcon } from "react-icons/vsc";

export default function NavBar() {
  return (
    <div className="flex justify-center">
      <div className="flex  max-w-706">
        <div className="Route flex space-x-2">
          <h1>Home</h1>
          <h1>Apps</h1>
          <h1>Blog</h1>
        </div>

        <div className="Icons flex space-x-2">
          <TwitterIcon />
          <LinkedinIcon />
          <GithubIcon />
        </div>
      </div>
    </div>
  );
}
