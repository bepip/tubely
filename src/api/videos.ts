import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { getAssetDiskPath, getAssetPath, getAssetURL, getS3AssetURL } from "./assets";
import path from "path";
import { uploadVideoToS3 } from "../s3";
import { rm } from "fs/promises";


export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
	const MAX_UPLOAD_SIZE = 1 << 30;
	const { videoId } = req.params as { videoId?: string };
	if (!videoId) {
		throw new BadRequestError("invalid video ID");
	}

	const token = getBearerToken(req.headers);
	const userId = validateJWT(token, cfg.jwtSecret);

	const videoMetaData = getVideo(cfg.db, videoId);

	if (!videoMetaData) {
		throw new BadRequestError("Video not found");
	}
	if (videoMetaData.userID !== userId) {
		throw new UserForbiddenError("Forbidden");
	}
	const formData = await req.formData();

	const file = formData.get("video");

	if (!(file instanceof File)) {
		throw new BadRequestError("Video file missing");
	}

	if (file.size > MAX_UPLOAD_SIZE) {
		throw new BadRequestError("Video is bigger then 1 GB");
	}
	const mediaType = file.type;
	if (mediaType !== "video/mp4") {
		throw new BadRequestError("Invalid file type. mp4 allowed.");
	}

	const tempFilePath = path.join("/tmp", `${videoId}.mp4`);
	await Bun.write(tempFilePath, file);
	const key = `${videoId}.mp4`;
	await uploadVideoToS3(cfg, key, tempFilePath, mediaType);


	videoMetaData.videoURL = getS3AssetURL(cfg, key);
	updateVideo(cfg.db, videoMetaData);

	await Promise.all([rm(tempFilePath, { force: true })]);
	return respondWithJSON(200, null);
}
