export async function extractWavFromMediaFile(file: File): Promise<Blob> {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持本地音频解码");
  if (file.size > 600 * 1024 * 1024) throw new Error("视频较大，改由 worker 从视频抽取音频");

  const audioContext = new AudioContextClass();
  try {
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    return encodeWav(decoded, 16000);
  } finally {
    await audioContext.close();
  }
}

function encodeWav(audioBuffer: AudioBuffer, targetSampleRate: number): Blob {
  const samples = resampleLinear(mixToMono(audioBuffer), audioBuffer.sampleRate, targetSampleRate);
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const input = audioBuffer.getChannelData(channel);
    for (let index = 0; index < audioBuffer.length; index += 1) {
      output[index] += input[index] / audioBuffer.numberOfChannels;
    }
  }
  return output;
}

function resampleLinear(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

