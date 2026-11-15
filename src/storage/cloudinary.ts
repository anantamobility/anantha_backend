import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";
import envConfig from "../config/env.js";

cloudinary.config({
	cloud_name: envConfig.cloudinaryCloudName,
	api_key: envConfig.cloudinaryApiKey,
	api_secret: envConfig.cloudinaryApiSecret,
});

if (!envConfig.cloudinaryCloudName || !envConfig.cloudinaryApiKey || !envConfig.cloudinaryApiSecret) {
	console.warn("Cloudinary credentials are missing; document uploads will fail until CLOUDINARY_* env vars are set.");
}

/** Extracts the Cloudinary public id from a secure URL. */
export function publicIdFromUrl(url: string): string | null {
	const [, afterUpload] = url.split("/upload/");
	if (!afterUpload) return null;
	const withoutVersion = afterUpload.replace(/^v\d+\//, "");
	const lastDot = withoutVersion.lastIndexOf(".");
	return lastDot === -1 ? withoutVersion : withoutVersion.slice(0, lastDot);
}

/**
 * Uploads a document and returns its public URL.
 * Documents are public by design; access control stays at the API layer.
 */
export function uploadDocument(buffer: Buffer, folder: string, fileName: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				public_id: fileName.replace(/\.[^.]+$/, ""),
				resource_type: "auto",
				overwrite: false,
			},
			(err, result) => {
				if (err || !result) {
					reject(err ?? new Error("Cloudinary upload returned no result"));
					return;
				}
				resolve(result.secure_url);
			},
		);

		Readable.from(buffer).pipe(stream);
	});
}

/** Deletes the stored asset. Missing or already-removed assets are ignored. */
export async function deleteDocument(url: string): Promise<void> {
	const publicId = publicIdFromUrl(url);
	if (!publicId) return;
	await cloudinary.uploader.destroy(publicId);
}
