import { existsSync, mkdirSync } from "fs";

import type { ApiConfig } from "../config";
import path from "path";
import { updateVideo, type Video } from "../db/videos";
import { BadRequestError } from "./errors";
import { randomBytes } from "crypto";

export function ensureAssetsDir(cfg: ApiConfig) {
	if (!existsSync(cfg.assetsRoot)) {
		mkdirSync(cfg.assetsRoot, { recursive: true });
	}
}

export function generateThumbnailURL(cfg: ApiConfig, videoID: string) {
	return `http://localhost:${cfg.port}/api/thumbnails/${videoID}`;
}

export function getAssetPath(mediaType: string) {
	const base = randomBytes(32);
	const id = base.toString("base64url");
	const ext = mediaTypeToExt(mediaType);
	return id + ext;
}

export function mediaTypeToExt(mediaType: string) {
	const parts = mediaType.split("/");
	if (parts.length !== 2) {
		return ".bin";
	}
	return "." + parts[1];
}

export function getAssetDiskPath(cfg: ApiConfig, assetPath: string) {
	return path.join(cfg.assetsRoot, assetPath);
}

export function getAssetURL(cfg: ApiConfig, assetPath: string) {
	return `http://localhost:${cfg.port}/assets/${assetPath}`;
}

export function getS3AssetURL(cfg: ApiConfig, key: string) {
	return `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`
}
