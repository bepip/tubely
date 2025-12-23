import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { generateThumbnailURL, getAssetDiskPath, getAssetPath, getAssetURL, mediaTypeToExt, saveThumbnail, validateThumbnailMediaType } from "./assets";
import { randomBytes } from "crypto";

type Thumbnail = {
	data: ArrayBuffer;
	mediaType: string;
};

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
	const { videoId } = req.params as { videoId?: string };
	if (!videoId) {
		throw new BadRequestError("Invalid video ID");
	}

	const video = getVideo(cfg.db, videoId);
	if (!video) {
		throw new NotFoundError("Couldn't find video");
	}
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
	const { videoId } = req.params as { videoId?: string };
	if (!videoId) {
		throw new BadRequestError("Invalid video ID");
	}

	const token = getBearerToken(req.headers);
	const userID = validateJWT(token, cfg.jwtSecret);

	const videoMetaData = getVideo(cfg.db, videoId);

	if (!videoMetaData) {
		throw new BadRequestError("Video not found");
	}
	if (videoMetaData.userID !== userID) {
		throw new UserForbiddenError("Forbidden");
	}

	const formData = await req.formData();
	const file = formData.get("thumbnail");
	if (!(file instanceof File)) {
		throw new BadRequestError("Thumbnail file missing");
	}

	const MAX_UPLOAD_SIZE = 10 << 20;

	if (file.size > MAX_UPLOAD_SIZE) {
		throw new BadRequestError("Thumbnail is bigger than 10 MB");
	}
	const mediaType = file.type;
	if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
		throw new BadRequestError("Invalid file type. Only JPEG or PNG allowed.");
	}

	const filename = getAssetPath(mediaType);
	const assetDiskPath = getAssetDiskPath(cfg, filename);

	await Bun.write(assetDiskPath, file);

	const urlPath = getAssetURL(cfg, filename);
	videoMetaData.thumbnailURL = urlPath;
	updateVideo(cfg.db, videoMetaData);

	return respondWithJSON(200, videoMetaData);
}
