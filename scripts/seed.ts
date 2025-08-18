/**
 * Seed script for Momentia
 * - Reads images from ./seed/photos
 * - Extracts EXIF (exifr)
 * - Generates variants with sharp (thumb 480, large up to 2048)
 * - Uploads originals and variants to Azure Blob (Azurite in dev)
 * - Inserts Photo/Variant/Keyword records via Prisma
 *
 * Run:  npx tsx scripts/seed.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as exifr from 'exifr';
import { PrismaClient } from '@prisma/client';
import { BlobServiceClient } from '@azure/storage-blob';

const prisma = new PrismaClient();

const CONTAINER_NAME = 'photos';
const ORIG_PREFIX = 'originals/';
const PUB_PREFIX = 'public/';

function log(...args: any[]) { console.log('[seed]', ...args); }

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureContainer() {
  const conn = assertEnv('AZURE_STORAGE_CONNECTION_STRING');
  const service = BlobServiceClient.fromConnectionString(conn);
  const container = service.getContainerClient(CONTAINER_NAME);
  const exists = await container.exists();
  if (!exists) {
    await container.create({ access: 'container' });
    log(`created container: ${CONTAINER_NAME}`);
  }
  return container;
}

async function uploadBuffer(container: any, buf: Buffer, blobPath: string, contentType = 'image/jpeg') {
  const client = container.getBlockBlobClient(blobPath);
  await client.uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
}

async function processOne(container: any, absPath: string) {
  const srcBuf = await fs.readFile(absPath);
  const baseName = path.parse(absPath).name; // without ext
  const slug = slugify(baseName);

  // Read metadata
  const img = sharp(srcBuf).withMetadata();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error(`Cannot read dimensions: ${absPath}`);

  // EXIF (may be null)
  const exifData: any = await exifr.parse(srcBuf).catch(() => null);

  // Originals
  const originalJpeg = await img.jpeg({ quality: 92 }).toBuffer();
  const originalPath = `${ORIG_PREFIX}${baseName}.jpg`;
  await uploadBuffer(container, originalJpeg, originalPath);

  // Variants
  const ow = meta.width; const oh = meta.height;
  const makeResize = async (targetW: number, q: number) => {
    const width = Math.min(targetW, ow);
    const buf = await sharp(srcBuf).resize({ width, withoutEnlargement: true }).jpeg({ quality: q }).toBuffer();
    const h = Math.round(oh * (width / ow));
    return { buf, width, height: h };
  };

  const thumb = await makeResize(480, 82);
  const large = await makeResize(2048, 88);

  const thumbPath = `${PUB_PREFIX}${baseName}_480.jpg`;
  const largePath = `${PUB_PREFIX}${baseName}_2048.jpg`;

  await uploadBuffer(container, thumb.buf, thumbPath);
  await uploadBuffer(container, large.buf, largePath);

  // DB inserts
  const photo = await prisma.photo.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      storagePath: originalPath,
      width: ow,
      height: oh,
      capturedAt: exifData?.DateTimeOriginal
        ? new Date(exifData.DateTimeOriginal)
        : (exifData?.CreateDate ? new Date(exifData.CreateDate) : null),
      exifRaw: exifData || {},
    },
  });

  // Remove old variants if any, then create new ones
  await prisma.variant.deleteMany({ where: { photoId: photo.id } });
  await prisma.variant.createMany({
    data: [
      { photoId: photo.id, type: 'thumb', width: thumb.width, height: thumb.height, storagePath: thumbPath, bytes: thumb.buf.length },
      { photoId: photo.id, type: 'large', width: large.width, height: large.height, storagePath: largePath, bytes: large.buf.length },
    ],
  });

  // Keywords (IPTC/EXIF Keywords or Subject)
  const kws: string[] = Array.from(new Set(
    ([] as string[])
      .concat(exifData?.Keywords || [])
      .concat(exifData?.Subject || [])
      .filter((w: any) => typeof w === 'string' && w.trim().length > 0)
      .map((w: string) => w.trim())
  ));

  if (kws.length) {
    await prisma.keyword.deleteMany({ where: { photoId: photo.id } });
    await prisma.keyword.createMany({ data: kws.slice(0, 16).map(word => ({ photoId: photo.id, word })) });
  }

  log('seeded', slug, `(${ow}x${oh})`, kws.length ? `kws:${kws.length}` : '');
}

async function main() {
  const container = await ensureContainer();
  const seedDir = path.join(process.cwd(), 'seed', 'photos');
  const exists = await fs.stat(seedDir).then(() => true).catch(() => false);
  if (!exists) {
    log(`No seed directory found at ${seedDir}. Put some JPG/PNG files there.`);
    return;
  }

  const files = (await fs.readdir(seedDir))
    .filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f))
    .map(f => path.join(seedDir, f));

  if (files.length === 0) {
    log('No seed images found. Add files under seed/photos and rerun.');
    return;
  }

  for (const file of files) {
    try {
      await processOne(container, file);
    } catch (e) {
      console.error('[seed] failed for', file, e);
    }
  }

  log('done');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
