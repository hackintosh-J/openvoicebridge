
// Convert segments [{start, end, text}] => SRT string
export function segmentsToSRT(segments) {
  function toTimestamp(sec) {
    const ms = Math.floor((sec % 1) * 1000).toString().padStart(3, '0');
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = n => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${ms}`;
  }
  let srt = '';
  segments.forEach((seg, i) => {
    srt += `${i + 1}\n${toTimestamp(seg.start)} --> ${toTimestamp(seg.end)}\n${seg.text.trim()}\n\n`;
  });
  return srt;
}
