import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import { spawn } from "bun";
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

	const video = getVideo(cfg.db, videoId);

	if (!video) {
		throw new BadRequestError("Video not found");
	}
	if (video.userID !== userId) {
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
	const aspect = await getVideoAspectRatio(tempFilePath);
	const fastStartPath = await processVideoForFastStart(tempFilePath);
	const key = `${aspect}/${videoId}.mp4`;
	await uploadVideoToS3(cfg, key, fastStartPath, mediaType);

	video.videoURL = getS3AssetURL(cfg, key);
	updateVideo(cfg.db, video);

	await Promise.all([
		rm(tempFilePath, { force: true }),
		rm(fastStartPath, { force: true })
	]);
	return respondWithJSON(200, video);
}

export async function getVideoAspectRatio(filePath: string) {
	const cmd = [
		"ffprobe",
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height",
		"-of",
		"json",
		filePath
	];
	Bun.spawn
	const proc = Bun.spawn({
		cmd: cmd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, errOutput, exitCode] = await Promise.all([
		new Response(proc.stdout).json(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	if (exitCode !== 0) {
		throw new Error(errOutput);
	}
	if (!output.streams || output.streams.length === 0) {
		throw new Error("No video streams found");
	}

	const height: number = output.streams[0].height;
	const width: number = output.streams[0].width;
	return getAspectRatio(width, height);
}

function getAspectRatio(width: number, height: number) {
	const ratio = width / height;
	const tolerance = 0.1;
	const landscape = 16 / 9;
	const portrait = 9 / 16;
	if (ratio >= landscape - tolerance && ratio <= landscape + tolerance) {
		return "landscape";
	} else if (ratio >= portrait - tolerance && ratio <= portrait + tolerance) {
		return "portrait";
	}
	return "other";
}

export async function processVideoForFastStart(inputFilePath: string) {
	const outputFile = inputFilePath + ".processed";
	const cmd = ["ffmpeg", "-v", "quiet", "-i", inputFilePath, "-movflags", "faststart", "-map_metadata", "0", "-codec", "copy", "-f", "mp4", outputFile];
	const proc = Bun.spawn(cmd);
	const exitStatus = await proc.exited;
	if (exitStatus !== 0) {
		throw new Error("failed to process file");
	}

	return outputFile;
}
