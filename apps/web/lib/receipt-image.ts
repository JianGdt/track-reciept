import sharp from "sharp";
import { ServiceError } from "./service-error";
export async function prepareReceiptImage(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024)
    throw new ServiceError(413, "Photo must be smaller than 5 MB.");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
    throw new ServiceError(415, "Please upload a JPEG photo.");
  try {
    // Decode as well as sniffing bytes. Sharp strips EXIF by default.
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    }).rotate();
    const full = await image
      .clone()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbnail = await image
      .clone()
      .resize({
        width: 320,
        height: 320,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { full, thumbnail };
  } catch {
    throw new ServiceError(
      415,
      "This photo is damaged or too large to decode. Choose another photo.",
    );
  }
}
