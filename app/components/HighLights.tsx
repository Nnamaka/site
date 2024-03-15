import { highlights } from "../dummyData/data";
import { FiArrowUpRight } from "react-icons/fi";

export default function HighLights() {
  return (
    <div className="pt-16">
      <p className="text-[18px] font-bold pt-1 mb-1">Highlights</p>
      {highlights.map((highlight, index) => (
        <div
          key={index}
          className="flex justify-between items-center mt-[23px] px-2 py-1 bg-[#F3ECEC] rounded-md w-[354px]"
        >
          <div>
            <p className="font-bold">{highlight.slug}</p>
            <p className="text-[14px]">{highlight.description}</p>
          </div>
          <FiArrowUpRight className="w-6 h-6"/>
        </div>
      ))}
    </div>
  );
}
