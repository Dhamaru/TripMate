import path from "path";
import type { Request } from "express";
import type { FileFilterCallback } from "multer";

// multer's fileFilter only sees file.mimetype, which is the client-supplied
// Content-Type header on the multipart form part — an attacker can upload
// a file named "evil.html" with Content-Type: image/jpeg and the MIME check
// alone passes it straight through. Since the destination filename reuses
// path.extname(file.originalname), that .html extension survives onto disk
// and gets served back at /uploads/... with a real text/html Content-Type
// by express.static, which is a stored-file same-origin XSS vector — no
// image ever needs to be decoded for this exploit to work. Extension
// allowlisting closes it: even if the MIME header lies, only these
// extensions can ever land on disk.
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export function isAllowedImageUpload(file: { mimetype: string; originalname: string }): boolean {
    if (!file.mimetype.startsWith("image/")) return false;
    const ext = path.extname(file.originalname).toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

export function imageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
    if (isAllowedImageUpload(file)) {
        cb(null, true);
    } else {
        cb(null, false);
    }
}
