import Image from "next/image";
import HighLights from "./components/HighLights";

export default function Home() {
  return (
    <main>
      <div className="">
        <p className="text-[24px] font-bold pt-8">Nnamaka Dike</p>

        <p className="pt-3 w-[414px] text-[16px]">
          - I spend my days coaxing algorithms to dance the tango, whispering sweet
          nothings to neural networks, and babysitting algorithms while
          convincing them to play nice, but with more existential dread 😭💻
        </p>
        <HighLights/>
      </div>
    </main>
  );
}
