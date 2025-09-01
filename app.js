
// OpenVoiceBridge - core
// Dependencies: transformers.js (via CDN), srt.js, utils.js
import { segmentsToSRT } from './srt.js';
import { resampleTo16k, mmss } from './utils.js';

// Transformers.js from CDN. We pin to a semver to reduce breakage; adjust as needed.
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.2';

let transcriber = null;
let modelId = 'Xenova/whisper-tiny'; // default (multilingual), ~39MB
let language = 'auto'; // or 'en', 'zh', etc.

// State
let running = false;
let liveSegments = []; // {start, end, text}
let liveStartTime = 0;
let audioCtx = null;
let sourceNode = null;
let processor = null;
let inputSampleRate = 48000;
let liveBuffer16k = [];
let lastEmitSec = 0;
let partialText = '';

const $ = (sel) => document.querySelector(sel);
const log = (msg) => { const el = $('#log'); el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent; };
const setCaption = (text) => $('#caption').textContent = text || '…';
const setStatus = (text) => $('#status').textContent = text || '';

async function ensureModelLoaded() {
  if (transcriber) return;
  setStatus('正在加载模型（首次需要联网，随后可离线使用）…');
  const { pipeline, env } = await import(`${TRANSFORMERS_CDN}`);
  // Reduce verbosity & prefer WebGPU if available; otherwise ONNX WASM.
  env.localModelPath = null;
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1; // Pages lacks cross-origin isolation; keep single-thread wasm
  transcriber = await pipeline('automatic-speech-recognition', modelId, { quantized: true });
  setStatus('模型已就绪');
}

function uiInit() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
  $('#model').addEventListener('change', e => modelId = e.target.value);
  $('#language').addEventListener('change', e => language = e.target.value);
  $('#startMic').addEventListener('click', startMic);
  $('#stopMic').addEventListener('click', stopMic);
  $('#file').addEventListener('change', handleFile);
  $('#exportSRT').addEventListener('click', exportSRT);
  $('#clear').addEventListener('click', clearAll);
  $('#about-year').textContent = new Date().getFullYear();
}

function clearAll() {
  liveSegments = [];
  liveBuffer16k = [];
  lastEmitSec = 0;
  partialText = '';
  setCaption('…');
  $('#segmentsList').innerHTML = '';
  $('#stats').textContent = '';
  $('#log').textContent = '';
}

async function startMic() {
  await ensureModelLoaded();

  if (running) return;
  running = true;
  clearAll();
  setStatus('打开麦克风…（按 K 键开始/停止）');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  inputSampleRate = audioCtx.sampleRate;

  sourceNode = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  sourceNode.connect(processor);
  processor.connect(audioCtx.destination);

  liveStartTime = performance.now() / 1000;
  processor.onaudioprocess = async (e) => {
    if (!running) return;
    const input = e.inputBuffer.getChannelData(0);
    const chunk16k = resampleTo16k(input, inputSampleRate);
    liveBuffer16k.push(chunk16k);

    // Every ~6 seconds, emit a chunk for recognition (overlap a little)
    const nowSec = performance.now() / 1000;
    const elapsed = nowSec - liveStartTime;
    if (elapsed - lastEmitSec >= 6) {
      lastEmitSec = elapsed;
      const merged = concatFloat32(liveBuffer16k);
      // Keep last ~14s window to balance latency + accuracy
      const targetSamples = 16000 * 14;
      const windowed = merged.length > targetSamples ? merged.slice(merged.length - targetSamples) : merged;
      inferChunk(windowed, elapsed - windowed.length/16000);
    }
  };

  window.addEventListener('keydown', onHotkeys);
}

async function stopMic() {
  running = false;
  if (processor) { processor.disconnect(); processor.onaudioprocess = null; }
  if (sourceNode) sourceNode.disconnect();
  if (audioCtx) await audioCtx.close();
  processor = sourceNode = audioCtx = null;
  setStatus('已停止');
  window.removeEventListener('keydown', onHotkeys);
}

function onHotkeys(e) {
  if (e.key.toLowerCase() === 'k') {
    if (!running) startMic(); else stopMic();
  }
}

function concatFloat32(chunks) {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function inferChunk(float32, startTimeSec) {
  try {
    setStatus('识别中…');
    const cfg = { return_timestamps: true, chunk_length_s: 15, stride_length_s: 3 };
    if (language && language !== 'auto') cfg.language = language;
    // transformers.js accepts raw Float32Array with sampling_rate option
    cfg.task = 'transcribe';
    cfg.sampling_rate = 16000;

    const out = await transcriber(float32, cfg);
    // out.chunks: [{text, timestamp: [start, end]}]
    if (out && out.chunks) {
      partialText = out.text;
      setCaption(partialText);
      out.chunks.forEach(ch => {
        const s = Math.max(0, startTimeSec + ch.timestamp[0]);
        const e = Math.max(0, startTimeSec + ch.timestamp[1]);
        pushSegment({ start: s, end: e, text: ch.text });
      });
      renderSegments();
    } else if (out && out.text) {
      partialText = out.text;
      setCaption(partialText);
      // no timestamps; make a rough segment
      pushSegment({ start: startTimeSec, end: startTimeSec + float32.length/16000, text: out.text });
      renderSegments();
    }
    setStatus('就绪');
  } catch (err) {
    console.error(err);
    log('识别失败：' + (err.message || err));
    setStatus('出错');
  }
}

function pushSegment(seg) {
  if (!seg.text || !seg.text.trim()) return;
  // Merge with previous if overlap
  const n = liveSegments.length;
  if (n > 0) {
    const prev = liveSegments[n-1];
    if (seg.start <= prev.end + 0.3) {
      // overlap -> merge
      prev.end = Math.max(prev.end, seg.end);
      // Avoid duplicate text fragments by simple heuristics
      if (!prev.text.endsWith(seg.text.trim())) {
        if (seg.text.trim().startsWith(prev.text.slice(-10))) {
          prev.text = seg.text.trim();
        } else {
          prev.text = (prev.text + ' ' + seg.text.trim()).replace(/\s+/g, ' ').trim();
        }
      }
      return;
    }
  }
  liveSegments.push(seg);
}

async function handleFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  await ensureModelLoaded();
  setStatus('读取文件…');
  const ab = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await audioCtx.decodeAudioData(ab.slice(0)); // slice to create copy for Safari
  const mono = toMono(audioBuf);
  const pcm16k = resampleTo16k(mono, audioBuf.sampleRate);

  clearAll();
  const duration = pcm16k.length / 16000;
  setStatus('转写中…（可能需要数分钟）');

  const cfg = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 6 };
  if (language && language !== 'auto') cfg.language = language;
  cfg.sampling_rate = 16000;

  const out = await transcriber(pcm16k, cfg);
  if (out && out.chunks) {
    let t0 = 0;
    out.chunks.forEach(ch => {
      const s = Math.max(0, ch.timestamp[0]);
      const e = Math.max(0, ch.timestamp[1]);
      liveSegments.push({ start: s, end: e, text: ch.text });
      t0 = e;
    });
  } else if (out && out.text) {
    liveSegments.push({ start: 0, end: duration, text: out.text });
  }
  setCaption(out.text || '完成');
  renderSegments();
  setStatus(`完成：${mmss(duration)} 时长`);
}

function toMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
  // average channels
  const out = new Float32Array(audioBuffer.length);
  const ch0 = audioBuffer.getChannelData(0);
  for (let i = 0; i < out.length; i++) out[i] = ch0[i];
  for (let ch = 1; ch < audioBuffer.numberOfChannels; ch++) {
    const d = audioBuffer.getChannelData(ch);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] + d[i]) / 2;
  }
  return out;
}

function renderSegments() {
  const list = $('#segmentsList');
  list.innerHTML = '';
  liveSegments.sort((a,b)=>a.start-b.start);
  let totalText = '';
  liveSegments.forEach((seg, i) => {
    const item = document.createElement('div');
    item.className = 'item small';
    item.textContent = `#${i+1} [${mmss(seg.start)} → ${mmss(seg.end)}] ${seg.text.trim()}`;
    list.appendChild(item);
    totalText += seg.text.trim() + ' ';
  });
  $('#stats').textContent = `片段：${liveSegments.length}｜总字数：${totalText.length}`;
}

function exportSRT() {
  if (liveSegments.length === 0) { alert('暂无可导出的字幕。'); return; }
  const srt = segmentsToSRT(liveSegments);
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openvoicebridge.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', uiInit);
