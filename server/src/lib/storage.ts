import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from './env';

/**
 * Storage is behind this thin service so the demo's local disk driver can be
 * swapped for S3-compatible object storage without touching the routes.
 */
export interface StoredFile {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface StorageDriver {
  save(file: Express.Multer.File, folder: string): Promise<StoredFile>;
  remove(url: string): Promise<void>;
  resolve(url: string): string | null;
}

const localDriver: StorageDriver = {
  async save(file, folder) {
    // multer.diskStorage has already written the file; just report where.
    return {
      url: `/uploads/${folder}/${file.filename}`,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  },
  async remove(url) {
    const abs = localDriver.resolve(url);
    if (abs && fs.existsSync(abs)) await fs.promises.unlink(abs);
  },
  resolve(url) {
    if (!url.startsWith('/uploads/')) return null;
    const rel = url.replace('/uploads/', '');
    const abs = path.join(env.uploadDir, rel);
    // Guard against traversal outside the upload root.
    if (!abs.startsWith(path.resolve(env.uploadDir))) return null;
    return abs;
  },
};

// A stub kept alongside so the swap point is obvious.
const s3NotConfigured: StorageDriver = {
  async save() {
    throw new Error('S3 storage driver is not configured. Set STORAGE_DRIVER=local or implement the S3 driver.');
  },
  async remove() {
    throw new Error('S3 storage driver is not configured.');
  },
  resolve() {
    return null;
  },
};

export const storage: StorageDriver = env.storageDriver === 's3' ? s3NotConfigured : localDriver;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ensureDir(env.uploadDir);

export function uploader(folder: string) {
  const dest = ensureDir(path.join(env.uploadDir, folder));
  return multer({
    limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dest),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-80);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const allowed = /pdf|png|jpe?g|docx?|xlsx?|csv|dwg|zip/i;
      const ok = allowed.test(path.extname(file.originalname));
      cb(ok ? null : (new Error('Unsupported file type') as any), ok);
    },
  });
}

export { folderFor };

function folderFor(caseId: string | undefined) {
  return caseId ? `cases/${caseId}` : 'misc';
}
