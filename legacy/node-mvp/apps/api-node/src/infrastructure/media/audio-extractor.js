import { spawn } from "node:child_process";
import { config } from "../../../config.js";

export function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, [
      "-y",
      "-i", videoPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      audioPath
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-600)}`));
    });
  });
}
