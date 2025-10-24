"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createPhotographerAction(formData: FormData) {
  const rawSlug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!rawSlug || !name) {
    throw new Error("slug と name は必須です。");
  }

  const slug = normalizeSlug(rawSlug);
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const profileUrl = String(formData.get("profileUrl") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;

  const existing = await prisma.photographer.findUnique({ where: { slug } });
  if (existing) {
    throw new Error("同じ slug のフォトグラファーが既に存在します。");
  }

  await prisma.photographer.create({
    data: { slug, name, displayName, bio, profileUrl, website, contactEmail },
  });

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export async function updatePhotographerAction(id: string, formData: FormData) {
  const rawSlug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!rawSlug || !name) {
    throw new Error("slug と name は必須です。");
  }

  const slug = normalizeSlug(rawSlug);
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const profileUrl = String(formData.get("profileUrl") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;

  const existing = await prisma.photographer.findFirst({
    where: { slug, NOT: { id } },
    select: { id: true },
  });
  if (existing) {
    throw new Error("同じ slug のフォトグラファーが既に存在します。");
  }

  await prisma.photographer.update({
    where: { id },
    data: { slug, name, displayName, bio, profileUrl, website, contactEmail },
  });

  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}

export async function deletePhotographerAction(id: string) {
  await prisma.photographer.delete({ where: { id } });
  revalidatePath("/admin/photographers");
  redirect("/admin/photographers");
}
