

import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="bg-white px-6 py-12 max-w-3xl mx-auto rounded-lg shadow mt-8">
      <h1 className="text-3xl font-bold mb-4">写真家について</h1>
      <div className="flex items-start mb-8">
        <Image
          src="/hawk.jpg"
          alt="写真家のプロフィール写真"
          width={200}
          height={200}
          className="rounded-full shadow"
        />
        <p className="text-lg text-gray-700 ml-6">
          写真家：高橋伸和<br />
          経歴：会社の立ち上げと並行してフリーランスの写真家として活動。風景、花、マクロ写真を中心に作品を制作。<br />

        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">理念</h2>
        <p className="text-gray-700">
          「Momentia」は、光と時間の呼吸を感じる写真を通じて、静けさと美しさを届けることを目指しています。日常の中に潜む小さな感動を切り取り、心に残る瞬間を共有します。<br />
          
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-2">制作・額装ポリシー</h2>
        <p className="text-gray-700">
          日本には、まだ写真をプリントアウトし、額装して楽しむ文化が根付いていないと感じています。<br />
          例えば会社の会議室、一枚の写真があるだけで空間の印象は変わり、この一枚の写真から会話が生まれ、コミュニケーションが活性化します。<br />
          そのため、私たちは作品を大切に扱い、適切な額装を施すことで、より多くの人に写真の魅力を伝えたいと考えています。<br />
          Momentiaは、こうした理念のもと、作品の制作から額装まで一貫して行い、写真を通じて人々の心に残る体験を提供します。<br />
        </p>
      </section>

      <div className="flex justify-center">
        <Link
          href="/"
          className="inline-block bg-black text-white px-6 py-3 rounded shadow hover:bg-gray-800 transition"
        >
          作品を見る
        </Link>
      </div>
    </div>
  );
}