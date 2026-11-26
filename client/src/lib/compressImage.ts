/**
 * Downscale a photo before upload. Journal photos are stored inside the
 * database entry, so a 5MB phone photo cost ~6.7MB of database space;
 * 1600px JPEG at 0.8 is ~0.3-0.6MB and still sharp full-width.
 * Returns the original file when it can't be decoded or is already smaller.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Append compressed copies of `files` to `formData` under `field`. */
export async function appendCompressed(formData: FormData, field: string, files: Iterable<File>) {
  for (const f of await Promise.all(Array.from(files, (f) => compressImage(f)))) {
    formData.append(field, f);
  }
}
