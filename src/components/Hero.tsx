"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative h-[58vh] md:h-[60vh] min-h-[600px] flex items-center justify-center text-center text-white overflow-hidden">
      <Image
        src="/hero-image.webp"
        alt="Hero background"
        fill
        sizes="100vw"
        className="object-cover z-0"
        priority
      />
      <div className="absolute inset-0 bg-black/30 z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-15 z-20"
        style={{
          backgroundImage: "url(/textures/grain.png)",
          backgroundSize: "300px 300px",
          mixBlendMode: "overlay",
        }}
      />
      <div className="relative z-30 px-4">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="font-serif text-4xl md:text-6xl font-medium tracking-tight text-white drop-shadow-md"
        >
          Momentia
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="mt-4 text-lg md:text-xl text-neutral-200 max-w-2xl mx-auto drop-shadow"
        >
          光と時間の呼吸を、そっと壁に。— 静けさを連れてくる写真たち。
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
          className="mt-8 flex flex-wrap gap-4 justify-center"
        >
          <Link
            href="/gallery"
            className="inline-flex items-center rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm px-5 py-2.5 text-base font-medium text-white shadow-sm hover:bg-white/30 transition-colors"
          >
            ギャラリーを見る
          </Link>
        </motion.div>
      </div>
    </section>
  );
}