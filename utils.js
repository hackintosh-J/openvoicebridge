
// Naive resampler from arbitrary sampleRate to 16000 Hz (mono), Float32
export function resampleTo16k(float32Array, inputSampleRate) {
  const targetRate = 16000;
  if (inputSampleRate === targetRate) return float32Array;

  const sampleRateRatio = inputSampleRate / targetRate;
  const newLength = Math.floor(float32Array.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
      accum += float32Array[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// Simple energy-based VAD: returns end indices of speech segments
export class SimpleVAD {
  constructor(sampleRate = 16000, frameMs = 20, voiceThresh = 0.015, minSilenceMs = 500, minSpeechMs = 300) {
    this.sampleRate = sampleRate;
    this.frameSize = Math.floor(sampleRate * frameMs / 1000);
    this.voiceThresh = voiceThresh;
    this.minSilenceFrames = Math.floor(minSilenceMs / frameMs);
    this.minSpeechFrames = Math.floor(minSpeechMs / frameMs);

    this.frames = [];
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.inSpeech = false;
  }

  // push chunk, return {segments: [ [startIndex, endIndex], ... ], pending: Float32Array}
  push(chunk) {
    // chunk: Float32Array mono 16k
    let segments = [];
    let i = 0;
    while (i + this.frameSize <= chunk.length) {
      const frame = chunk.subarray(i, i + this.frameSize);
      const energy = rms(frame);
      const isVoice = energy > this.voiceThresh;

      this.frames.push(frame);
      if (isVoice) {
        this.speechFrames++;
        this.silenceFrames = 0;
        if (!this.inSpeech && this.speechFrames >= this.minSpeechFrames) {
          this.inSpeech = true;
        }
      } else {
        this.silenceFrames++;
        if (this.inSpeech && this.silenceFrames >= this.minSilenceFrames) {
          // end of segment
          const totalFrames = this.frames.length;
          const end = totalFrames * this.frameSize;
          // find start by scanning back until enough silence before speech start
          // For simplicity, assume segment starts when inSpeech first became true; approximate:
          const segLen = this.speechFrames * this.frameSize;
          const start = Math.max(0, end - segLen - this.minSilenceFrames * this.frameSize);
          segments.push([start, end]);
          // reset state
          this.frames = [];
          this.speechFrames = 0;
          this.silenceFrames = 0;
          this.inSpeech = false;
        }
      }
      i += this.frameSize;
    }
    // pending frames
    const pending = concatFrames(this.frames);
    return { segments, pending };
  }
}

function rms(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / arr.length);
}

function concatFrames(frames) {
  const total = frames.reduce((a, f) => a + f.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const f of frames) { out.set(f, off); off += f.length; }
  return out;
}

// Utility: format seconds to mm:ss
export function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
