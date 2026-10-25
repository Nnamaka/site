import { apps } from "../dummyData/data";
import { VscGithubInverted as GithubIcon } from "react-icons/vsc";
import { RiTwitterXFill as TwitterIcon } from "react-icons/ri";

export default function app() {
  return (
    <div className=" mt-[70px] w-[307px] sm:w-[533px] md:w-[706px]">
      {apps.map((app) => (
        <div key={app.slug} className="mb-[25px] ">
          <p className="font-bold">{app.title}</p>
          <p className="text-[14px]">{app.slug}</p>
          <div className="flex gap-[20px] text-[11px] mt-[6px]">
            <p>{app.date}</p>
            <div className="flex items-center gap-1">
              <GithubIcon />
              <p>{app.githubLink}</p>
            </div>
            <div className="flex items-center gap-1">
              <TwitterIcon />
              <p>{app.videoLink}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
