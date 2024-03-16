import { blogs } from "../dummyData/data";

export default function blog() {
  return (
    <div className="flex-col mt-[70px] w-[337px] sm:w-[536px] md:w-[706px]">
      {blogs.map((data) => (
        <div key={data.slug} className="mb-[25px]">
          <p className="font-bold">{data.title}</p>
          <p className="text-[14px]">{data.slug}</p>
          <p className="text-[11px] mt-[6px]">{data.date}</p>
        </div>
      ))}
    </div>
  );
}
