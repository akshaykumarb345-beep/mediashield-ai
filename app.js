/**
 * MediaShield AI — app.js
 * Multimodal Media Inspection Workflow
 *
 * All analysis is performed locally using browser APIs:
 *   - FileReader / ArrayBuffer for file reading
 *   - HTMLImageElement + Canvas 2D for image signal extraction
 *   - HTMLVideoElement for video metadata
 *   - Web Audio API for audio signal inspection
 *   - DataView for binary header inspection (magic bytes / EXIF)
 *
 * NOTE: This is a media INSPECTION workflow, not a validated
 * ML-based deepfake detector. All assessments are cautious and
 * accompanied by explicit uncertainty statements.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & CONFIG
   ═══════════════════════════════════════════════════════════════ */

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

const ACCEPTED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac'],
};
const ALL_ACCEPTED = Object.values(ACCEPTED_TYPES).flat();

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */
let currentFile = null;
let currentMediaType = null; // 'image' | 'video' | 'audio'
let analysisResults = null;

/* ═══════════════════════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

const dropZone          = $('drop-zone');
const fileInput         = $('file-input');
const browseBtn         = $('browse-btn');
const filePreviewPanel  = $('file-preview-panel');
const mediaPreviewCont  = $('media-preview-container');
const fileMetaGrid      = $('file-meta-grid');
const analyseBtn        = $('analyse-btn');
const clearBtn          = $('clear-btn');
const progressPanel     = $('progress-panel');
const progressSteps     = $('progress-steps');
const progressBar       = $('progress-bar');
const progressBarWrap   = $('progress-bar-wrap');
const progressStatus    = $('progress-status');
const resultsPanel      = $('results-panel');
const verdictCard       = $('verdict-card');
const signalsGrid       = $('signals-grid');
const metadataDetails   = $('metadata-details');
const metadataTableWrap = $('metadata-table-wrap');
const nextStepsGrid     = $('next-steps-grid');
const copyReportBtn     = $('copy-report-btn');
const newAnalysisBtn    = $('new-analysis-btn');
const toast             = $('toast');

/* ═══════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.setAttribute('aria-hidden', 'false');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.setAttribute('aria-hidden', 'true');
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════
   FILE VALIDATION
   ═══════════════════════════════════════════════════════════════ */
function detectMediaCategory(file) {
  for (const [cat, types] of Object.entries(ACCEPTED_TYPES)) {
    if (types.includes(file.type)) return cat;
  }
  return null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function validateFile(file) {
  if (!file) return 'No file provided.';
  if (file.size > MAX_FILE_BYTES) return `File exceeds the 200 MB limit (${formatBytes(file.size)}).`;
  if (!ALL_ACCEPTED.includes(file.type)) {
    return `Unsupported file type: ${file.type || '(unknown)'}. Accepted: JPG, PNG, WEBP, MP4, MOV, WEBM, MP3, WAV, M4A.`;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   FILE SELECTION
   ═══════════════════════════════════════════════════════════════ */
function handleFileSelected(file) {
  const err = validateFile(file);
  if (err) { showToast(`⚠️ ${err}`, 5000); return; }

  currentFile      = file;
  currentMediaType = detectMediaCategory(file);
  analysisResults  = null;

  hideResults();
  showFilePreview(file);
}

function showFilePreview(file) {
  // Clear previous
  mediaPreviewCont.innerHTML = '';
  fileMetaGrid.innerHTML = '';

  // Preview
  if (currentMediaType === 'image') {
    const img = document.createElement('img');
    img.alt = `Preview of ${file.name}`;
    img.src = URL.createObjectURL(file);
    img.onload = () => buildImageMeta(img, file);
    mediaPreviewCont.appendChild(img);
  } else if (currentMediaType === 'video') {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.preload = 'metadata';
    video.controls = false;
    video.setAttribute('aria-label', `Preview of ${file.name}`);
    video.onloadedmetadata = () => buildVideoMeta(video, file);
    // Show first frame
    video.addEventListener('seeked', () => {}, { once: true });
    video.currentTime = 1;
    mediaPreviewCont.appendChild(video);
  } else {
    // Audio
    const icon = document.createElement('div');
    icon.className = 'waveform-preview';
    for (let i = 0; i < 18; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      bar.style.height = `${20 + Math.random() * 60}%`;
      bar.style.animationDelay = `${(i * 0.07).toFixed(2)}s`;
      icon.appendChild(bar);
    }
    mediaPreviewCont.appendChild(icon);
    buildAudioMeta(file);
  }

  filePreviewPanel.hidden = false;
  filePreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addMetaItem(label, value, small = false) {
  const item = document.createElement('div');
  item.className = 'meta-item';
  item.innerHTML = `
    <div class="meta-label">${escHtml(label)}</div>
    <div class="meta-value${small ? ' small' : ''}">${escHtml(String(value))}</div>
  `;
  fileMetaGrid.appendChild(item);
}

function buildImageMeta(img, file) {
  addMetaItem('File name', file.name, true);
  addMetaItem('Type', file.type);
  addMetaItem('Size', formatBytes(file.size));
  addMetaItem('Dimensions', `${img.naturalWidth} × ${img.naturalHeight} px`);
  addMetaItem('Aspect ratio', (img.naturalWidth / img.naturalHeight).toFixed(3));
  addMetaItem('Modified', new Date(file.lastModified).toLocaleDateString());
}

function buildVideoMeta(video, file) {
  addMetaItem('File name', file.name, true);
  addMetaItem('Type', file.type);
  addMetaItem('Size', formatBytes(file.size));
  const dur = isFinite(video.duration) ? `${video.duration.toFixed(1)}s` : 'Unknown';
  addMetaItem('Duration', dur);
  const dims = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight} px` : 'Unknown';
  addMetaItem('Dimensions', dims);
  addMetaItem('Modified', new Date(file.lastModified).toLocaleDateString());
}

function buildAudioMeta(file) {
  addMetaItem('File name', file.name, true);
  addMetaItem('Type', file.type);
  addMetaItem('Size', formatBytes(file.size));
  addMetaItem('Modified', new Date(file.lastModified).toLocaleDateString());
  // Duration will be filled after audio load
  const audio = new Audio();
  audio.src = URL.createObjectURL(file);
  audio.addEventListener('loadedmetadata', () => {
    if (isFinite(audio.duration)) addMetaItem('Duration', `${audio.duration.toFixed(1)}s`);
    URL.revokeObjectURL(audio.src);
  }, { once: true });
}

/* ═══════════════════════════════════════════════════════════════
   DRAG-AND-DROP
   ═══════════════════════════════════════════════════════════════ */
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFileSelected(file);
});
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('click', () => fileInput.click());

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) handleFileSelected(fileInput.files[0]);
});

/* ═══════════════════════════════════════════════════════════════
   CLEAR / RESET
   ═══════════════════════════════════════════════════════════════ */
function clearAll() {
  currentFile = null;
  currentMediaType = null;
  analysisResults = null;
  fileInput.value = '';
  filePreviewPanel.hidden = true;
  hideResults();
  progressPanel.hidden = true;
  showToast('File removed. Ready for new analysis.');
}

clearBtn.addEventListener('click', clearAll);
newAnalysisBtn.addEventListener('click', () => {
  clearAll();
  dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

function hideResults() {
  resultsPanel.hidden = true;
}

/* ═══════════════════════════════════════════════════════════════
   PROGRESS HELPERS
   ═══════════════════════════════════════════════════════════════ */
let _stepEls = {};

function initProgress(steps) {
  progressSteps.innerHTML = '';
  _stepEls = {};
  steps.forEach(({ id, label }) => {
    const el = document.createElement('div');
    el.className = 'progress-step';
    el.setAttribute('role', 'listitem');
    el.innerHTML = `
      <div class="step-indicator pending" id="si-${id}" aria-hidden="true">◯</div>
      <span class="step-label">${escHtml(label)}</span>
      <span class="step-note" id="sn-${id}"></span>
    `;
    progressSteps.appendChild(el);
    _stepEls[id] = el;
  });
  progressBar.style.width = '0%';
  progressBarWrap.setAttribute('aria-valuenow', '0');
  progressStatus.textContent = 'Starting…';
  progressPanel.hidden = false;
  progressPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setStep(id, state, note = '') {
  const el = _stepEls[id];
  if (!el) return;
  el.className = `progress-step ${state}`;
  const si = $(`si-${id}`);
  const sn = $(`sn-${id}`);
  si.className = `step-indicator ${state}`;
  const icons = { pending: '◯', running: '↻', done: '✓', skipped: '—', warn: '⚠' };
  si.textContent = icons[state] ?? state;
  if (sn) sn.textContent = note;
}

function setProgress(pct, statusText) {
  progressBar.style.width = `${pct}%`;
  progressBarWrap.setAttribute('aria-valuenow', String(Math.round(pct)));
  if (statusText) progressStatus.textContent = statusText;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE ANALYSIS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Read EXIF / metadata bytes.
 * We inspect the raw binary for basic JPEG header, EXIF marker presence,
 * and XMP/GPS marker presence — no external library required.
 */
async function readImageBinary(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(new DataView(e.target.result));
    reader.readAsArrayBuffer(file.slice(0, 65536)); // read first 64 KB
  });
}

function parseJpegExif(dv) {
  const result = {
    hasExif: false,
    hasXmp:  false,
    hasGps:  false,
    software: null,
    dateTime: null,
    make: null,
    model: null,
    comment: null,
    resolutionX: null,
    resolutionY: null,
  };

  if (dv.byteLength < 4) return result;
  if (dv.getUint8(0) !== 0xFF || dv.getUint8(1) !== 0xD8) return result; // not JPEG

  let offset = 2;
  while (offset + 4 < dv.byteLength) {
    if (dv.getUint8(offset) !== 0xFF) break;
    const marker = dv.getUint8(offset + 1);
    const segLen = dv.getUint16(offset + 2, false);

    if (marker === 0xE1) {
      // APP1 — may be EXIF or XMP
      const hdr = readAscii(dv, offset + 4, 6);
      if (hdr.startsWith('Exif')) {
        result.hasExif = true;
        // Parse IFD0 for common tags
        extractExifTags(dv, offset + 4 + 6, result);
      } else if (hdr.startsWith('http') || readAscii(dv, offset + 4, 29).includes('xpacket')) {
        result.hasXmp = true;
      }
    }
    if (marker === 0xFE) {
      result.comment = readAscii(dv, offset + 4, Math.min(segLen - 2, 128));
    }

    offset += 2 + segLen;
  }

  return result;
}

function readAscii(dv, start, len) {
  let s = '';
  for (let i = start; i < Math.min(start + len, dv.byteLength); i++) {
    const c = dv.getUint8(i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function extractExifTags(dv, exifStart, result) {
  try {
    const littleEndian = dv.getUint8(exifStart) === 0x49;
    const ifdOffset = dv.getUint32(exifStart + 4, littleEndian);
    const ifdAbs = exifStart + ifdOffset;
    const tagCount = dv.getUint16(ifdAbs, littleEndian);

    for (let i = 0; i < tagCount; i++) {
      const tagOff = ifdAbs + 2 + i * 12;
      if (tagOff + 12 > dv.byteLength) break;
      const tag   = dv.getUint16(tagOff, littleEndian);
      const type  = dv.getUint16(tagOff + 2, littleEndian);
      const count = dv.getUint32(tagOff + 4, littleEndian);
      const valOff = tagOff + 8;

      if (type === 2) { // ASCII string
        const strStart = (count <= 4) ? valOff : (exifStart + dv.getUint32(valOff, littleEndian));
        const str = readAscii(dv, strStart, Math.min(count, 128)).trim();
        if (tag === 0x010E) result.comment = str;      // ImageDescription
        if (tag === 0x010F) result.make = str;          // Make
        if (tag === 0x0110) result.model = str;         // Model
        if (tag === 0x0131) result.software = str;      // Software
        if (tag === 0x0132) result.dateTime = str;      // DateTime
      }

      // GPS IFD pointer
      if (tag === 0x8825) result.hasGps = true;

      // XResolution / YResolution (rational)
      if (tag === 0x011A && type === 5) {
        const rOff = exifStart + dv.getUint32(valOff, littleEndian);
        if (rOff + 8 <= dv.byteLength) {
          const num = dv.getUint32(rOff, littleEndian);
          const den = dv.getUint32(rOff + 4, littleEndian);
          if (den !== 0) result.resolutionX = Math.round(num / den);
        }
      }
      if (tag === 0x011B && type === 5) {
        const rOff = exifStart + dv.getUint32(valOff, littleEndian);
        if (rOff + 8 <= dv.byteLength) {
          const num = dv.getUint32(rOff, littleEndian);
          const den = dv.getUint32(rOff + 4, littleEndian);
          if (den !== 0) result.resolutionY = Math.round(num / den);
        }
      }
    }
  } catch (_) { /* malformed EXIF — ignore */ }
}

/**
 * Pixel-level analysis using Canvas 2D.
 * Extracts: colour variance, edge density, noise estimate, DCT-like block artefacts.
 */
async function analyseImagePixels(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = Math.min(img.naturalWidth, 512);
      const H = Math.min(img.naturalHeight, 512);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);

      const data = ctx.getImageData(0, 0, W, H).data;
      const pixels = W * H;

      // Mean luminance
      let sumLuma = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumLuma += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      }
      const meanLuma = sumLuma / pixels;

      // Variance
      let variance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const L = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        variance += (L - meanLuma) ** 2;
      }
      variance /= pixels;
      const stdDev = Math.sqrt(variance);

      // Edge density (simple Sobel approximation over subsampled rows)
      let edgeSum = 0;
      let edgeCount = 0;
      for (let y = 1; y < H - 1; y += 2) {
        for (let x = 1; x < W - 1; x += 2) {
          const idx = (y * W + x) * 4;
          const gx = getLuma(data, (y)*W + (x+1)) - getLuma(data, (y)*W + (x-1));
          const gy = getLuma(data, (y+1)*W + (x)) - getLuma(data, (y-1)*W + (x));
          edgeSum += Math.sqrt(gx*gx + gy*gy);
          edgeCount++;
        }
      }
      const edgeDensity = edgeCount > 0 ? edgeSum / edgeCount : 0;

      // Colour channel correlation (synthetic images often have unusual correlations)
      let sumR = 0, sumG = 0, sumB = 0;
      let sumRG = 0, sumRB = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumR += data[i]; sumG += data[i+1]; sumB += data[i+2];
        sumRG += data[i] * data[i+1];
        sumRB += data[i] * data[i+2];
      }
      const mR = sumR/pixels, mG = sumG/pixels, mB = sumB/pixels;
      const rgCorr = (sumRG/pixels - mR*mG) / (stdDev || 1);
      const rbCorr = (sumRB/pixels - mR*mB) / (stdDev || 1);

      // Block artefact score — compare 8×8 block means
      let blockVariance = 0;
      let blockCount = 0;
      for (let y = 0; y < H - 8; y += 8) {
        for (let x = 0; x < W - 8; x += 8) {
          const m1 = blockMean(data, W, x, y, 8, 8);
          const m2 = blockMean(data, W, x + 1, y, 7, 8);
          blockVariance += Math.abs(m1 - m2);
          blockCount++;
        }
      }
      const blockArtefact = blockCount > 0 ? blockVariance / blockCount : 0;

      resolve({
        width:        img.naturalWidth,
        height:       img.naturalHeight,
        megapixels:   ((img.naturalWidth * img.naturalHeight) / 1e6).toFixed(2),
        meanLuma:     meanLuma.toFixed(1),
        stdDev:       stdDev.toFixed(2),
        edgeDensity:  edgeDensity.toFixed(2),
        rgCorr:       rgCorr.toFixed(3),
        rbCorr:       rbCorr.toFixed(3),
        blockArtefact: blockArtefact.toFixed(3),
      });
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

function getLuma(data, idx) {
  const i = idx * 4;
  return 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
}

function blockMean(data, W, x, y, bw, bh) {
  let sum = 0, count = 0;
  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      const i = ((y + dy) * W + (x + dx)) * 4;
      if (i + 2 < data.length) {
        sum += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO ANALYSIS
   ═══════════════════════════════════════════════════════════════ */

async function analyseVideoFrames(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.preload = 'metadata';

    video.addEventListener('loadedmetadata', () => {
      const duration  = video.duration;
      const width     = video.videoWidth;
      const height    = video.videoHeight;

      if (!isFinite(duration) || duration === 0) {
        URL.revokeObjectURL(url);
        resolve({ error: 'Could not read video duration.', width, height });
        return;
      }

      // Sample up to 6 frames
      const sampleCount = Math.min(6, Math.max(1, Math.floor(duration)));
      const times = [];
      for (let i = 0; i < sampleCount; i++) {
        times.push(Math.max(0.1, (duration / (sampleCount + 1)) * (i + 1)));
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frameData = [];
      let frameIdx = 0;

      canvas.width  = Math.min(width, 320);
      canvas.height = Math.min(height, 320 * height / width);

      function captureNext() {
        if (frameIdx >= times.length) {
          URL.revokeObjectURL(url);
          resolve({
            duration, width, height,
            sampledFrames: frameData,
            frameCount: times.length,
          });
          return;
        }
        video.currentTime = times[frameIdx];
      }

      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const iData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const pixels = canvas.width * canvas.height;
        let sumL = 0;
        for (let i = 0; i < iData.length; i += 4) {
          sumL += 0.299 * iData[i] + 0.587 * iData[i+1] + 0.114 * iData[i+2];
        }
        const meanL = sumL / pixels;
        let varL = 0;
        for (let i = 0; i < iData.length; i += 4) {
          const L = 0.299 * iData[i] + 0.587 * iData[i+1] + 0.114 * iData[i+2];
          varL += (L - meanL) ** 2;
        }
        frameData.push({
          time: times[frameIdx].toFixed(2),
          meanLuma: meanL.toFixed(1),
          stdDev: Math.sqrt(varL / pixels).toFixed(2),
        });
        frameIdx++;
        captureNext();
      });

      captureNext();
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve({ error: 'Could not load video for frame analysis.' });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO ANALYSIS
   ═══════════════════════════════════════════════════════════════ */

async function analyseAudioBuffer(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22050 });
        const buffer = await ctx.decodeAudioData(e.target.result);
        ctx.close();

        const ch0 = buffer.getChannelData(0);
        const sr  = buffer.sampleRate;
        const dur = buffer.duration;

        // RMS loudness
        let sumSq = 0;
        for (let i = 0; i < ch0.length; i++) sumSq += ch0[i] ** 2;
        const rms = Math.sqrt(sumSq / ch0.length);
        const rmsDb = 20 * Math.log10(rms + 1e-9);

        // Peak amplitude
        let peak = 0;
        for (let i = 0; i < ch0.length; i++) peak = Math.max(peak, Math.abs(ch0[i]));
        const peakDb = 20 * Math.log10(peak + 1e-9);

        // Zero-crossing rate
        let zcr = 0;
        for (let i = 1; i < ch0.length; i++) {
          if ((ch0[i-1] >= 0) !== (ch0[i] >= 0)) zcr++;
        }
        zcr /= ch0.length;

        // Silence ratio
        const silenceThresh = 0.01;
        let silentSamples = 0;
        for (let i = 0; i < ch0.length; i++) {
          if (Math.abs(ch0[i]) < silenceThresh) silentSamples++;
        }
        const silenceRatio = silentSamples / ch0.length;

        // Spectral centroid (approximation over whole signal via FFT)
        const fftSize = 2048;
        const segment = ch0.slice(Math.floor(ch0.length / 2), Math.floor(ch0.length / 2) + fftSize);
        const spectrum = simpleFFTMagnitudes(segment, fftSize);
        let specNum = 0, specDen = 0;
        for (let i = 0; i < spectrum.length; i++) {
          const freq = (i * sr) / fftSize;
          specNum += freq * spectrum[i];
          specDen += spectrum[i];
        }
        const spectralCentroid = specDen > 0 ? specNum / specDen : 0;

        // High-frequency energy ratio (> 4kHz vs total)
        let hfEnergy = 0, totalEnergy = 0;
        for (let i = 0; i < spectrum.length; i++) {
          const freq = (i * sr) / fftSize;
          totalEnergy += spectrum[i];
          if (freq > 4000) hfEnergy += spectrum[i];
        }
        const hfRatio = totalEnergy > 0 ? hfEnergy / totalEnergy : 0;

        resolve({
          duration: dur.toFixed(2),
          sampleRate: sr,
          channels: buffer.numberOfChannels,
          rmsDb: rmsDb.toFixed(1),
          peakDb: peakDb.toFixed(1),
          zcr: zcr.toFixed(4),
          silenceRatio: (silenceRatio * 100).toFixed(1),
          spectralCentroid: spectralCentroid.toFixed(0),
          hfRatio: (hfRatio * 100).toFixed(1),
        });
      } catch (err) {
        resolve({ error: `Audio decode failed: ${err.message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Very lightweight DFT magnitude spectrum (no complex library) */
function simpleFFTMagnitudes(samples, N) {
  const mag = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += (samples[n] || 0) * Math.cos(angle);
      im -= (samples[n] || 0) * Math.sin(angle);
    }
    mag[k] = Math.sqrt(re * re + im * im);
  }
  return mag;
}

/* ═══════════════════════════════════════════════════════════════
   ANALYSIS ORCHESTRATOR
   ═══════════════════════════════════════════════════════════════ */

analyseBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  analyseBtn.disabled = true;
  clearBtn.disabled   = true;
  filePreviewPanel.hidden = true;
  hideResults();

  if (currentMediaType === 'image') {
    await runImageAnalysis();
  } else if (currentMediaType === 'video') {
    await runVideoAnalysis();
  } else {
    await runAudioAnalysis();
  }

  analyseBtn.disabled = false;
  clearBtn.disabled   = false;
});

/* ─── IMAGE ────────────────────────────────────────────────── */
async function runImageAnalysis() {
  const steps = [
    { id: 'magic', label: 'Verify file signature (magic bytes)' },
    { id: 'exif',  label: 'Read EXIF / metadata' },
    { id: 'pixel', label: 'Pixel statistics & noise analysis' },
    { id: 'edge',  label: 'Edge density & texture analysis' },
    { id: 'block', label: 'Compression artefact scan' },
    { id: 'colour',label: 'Colour channel analysis' },
    { id: 'score', label: 'Compile assessment' },
  ];
  initProgress(steps);

  // Step 1 — magic bytes
  setStep('magic', 'running', '');
  setProgress(5, 'Reading file signature…');
  await delay(400);
  const dv = await readImageBinary(currentFile);
  const magicOk = dv.byteLength >= 4;
  let fileFormat = 'Unknown';
  if (dv.byteLength >= 2 && dv.getUint8(0) === 0xFF && dv.getUint8(1) === 0xD8) fileFormat = 'JPEG';
  else if (dv.byteLength >= 4 && dv.getUint32(0) === 0x89504E47) fileFormat = 'PNG';
  else if (dv.byteLength >= 4 && readAscii(dv, 0, 4) === 'RIFF') fileFormat = 'WEBP';
  setStep('magic', 'done', fileFormat);
  setProgress(15, 'File signature verified.');

  // Step 2 — EXIF
  setStep('exif', 'running', '');
  setProgress(25, 'Parsing metadata…');
  await delay(500);
  let exif = null;
  if (fileFormat === 'JPEG') {
    exif = parseJpegExif(dv);
  }
  const hasExif = exif?.hasExif ?? false;
  setStep('exif', hasExif ? 'done' : 'warn', hasExif ? 'EXIF found' : 'No EXIF');
  setProgress(35, 'Metadata parsed.');

  // Step 3 — Pixel stats
  setStep('pixel', 'running', '');
  setProgress(45, 'Analysing pixel statistics…');
  const px = await analyseImagePixels(currentFile);
  setStep('pixel', 'done', `${px?.megapixels ?? '?'} MP`);
  setProgress(58, 'Pixel analysis complete.');
  await delay(200);

  // Steps 4-6 come from px data already computed
  setStep('edge',   'done', px ? `Density: ${px.edgeDensity}` : 'N/A');
  setProgress(68);
  await delay(150);
  setStep('block',  'done', px ? `Score: ${px.blockArtefact}` : 'N/A');
  setProgress(78);
  await delay(150);
  setStep('colour', 'done', px ? `R-G corr: ${px.rgCorr}` : 'N/A');
  setProgress(88);
  await delay(200);

  // Step 7 — score
  setStep('score', 'running', '');
  setProgress(95, 'Compiling assessment…');
  await delay(600);

  const report = scoreImageSignals(exif, px, currentFile);
  setStep('score', 'done', '');
  setProgress(100, 'Analysis complete.');
  await delay(400);

  progressPanel.hidden = true;
  renderResults(report, exif, px);
}

function scoreImageSignals(exif, px, file) {
  const signals = [];
  let riskScore = 0; // 0-100
  let flagCount = 0;

  // Metadata presence
  if (!exif) {
    signals.push({
      icon: '📄', name: 'Metadata (EXIF)',
      status: 'unknown', statusLabel: 'Not available',
      body: 'EXIF metadata could not be read from this file type. JPEG is required for EXIF parsing.',
      value: null,
    });
  } else if (!exif.hasExif) {
    riskScore += 10; flagCount++;
    signals.push({
      icon: '📄', name: 'Metadata (EXIF)',
      status: 'flag', statusLabel: 'Absent',
      body: 'No EXIF metadata was found. Synthetic images often lack camera metadata, but metadata can also be stripped by social platforms or editing software.',
      value: 'No EXIF block detected',
    });
  } else {
    const items = [];
    if (exif.make)     items.push(`Make: ${exif.make}`);
    if (exif.model)    items.push(`Model: ${exif.model}`);
    if (exif.software) items.push(`Software: ${exif.software}`);
    if (exif.dateTime) items.push(`Date: ${exif.dateTime}`);

    // Check for AI-tool software tags
    const aiKeywords = ['stable diffusion', 'midjourney', 'dall-e', 'firefly', 'invoke', 'automatic1111', 'comfy', 'novelai', 'dreamstudio'];
    const swLower = (exif.software || '').toLowerCase();
    const hasAiTag = aiKeywords.some(k => swLower.includes(k));

    if (hasAiTag) {
      riskScore += 40; flagCount++;
      signals.push({
        icon: '🤖', name: 'AI Software Tag',
        status: 'alert', statusLabel: 'Detected',
        body: 'The EXIF "Software" field contains a name associated with AI image-generation tools. This is a significant indicator that this image may be AI-generated.',
        value: exif.software,
      });
    } else {
      signals.push({
        icon: '📄', name: 'Metadata (EXIF)',
        status: 'normal', statusLabel: 'Present',
        body: 'EXIF metadata is present. Note: metadata can be manually added, edited, or transferred and is not proof of authenticity.',
        value: items.join(' · ') || 'Present (no camera details)',
      });
    }
    if (exif.hasGps) {
      signals.push({
        icon: '📍', name: 'GPS Coordinates',
        status: 'flag', statusLabel: 'Present',
        body: 'GPS data is embedded. This may be intentional, or may warrant a privacy review. Presence alone does not confirm or deny authenticity.',
        value: 'GPS IFD detected',
      });
    }
  }

  // Pixel checks
  if (px) {
    // Low std dev → possibly over-smoothed (AI)
    const sd = parseFloat(px.stdDev);
    if (sd < 20) {
      riskScore += 15; flagCount++;
      signals.push({
        icon: '📊', name: 'Luminance Variance',
        status: 'flag', statusLabel: 'Low',
        body: 'Pixel luminance variance is low, which can indicate over-smoothed textures sometimes associated with AI generation. However, low-detail images (sky, solid backgrounds) also show low variance naturally.',
        value: `Std dev: ${px.stdDev} (threshold: 20)`,
      });
    } else {
      signals.push({
        icon: '📊', name: 'Luminance Variance',
        status: 'normal', statusLabel: 'Normal',
        body: 'Pixel luminance variance is within a typical range for photographic content.',
        value: `Std dev: ${px.stdDev}`,
      });
    }

    // Edge density
    const ed = parseFloat(px.edgeDensity);
    if (ed < 5) {
      riskScore += 8;
      signals.push({
        icon: '🔲', name: 'Edge Density',
        status: 'flag', statusLabel: 'Low',
        body: 'Edge density is low. Synthetic images can appear overly smooth. This signal alone is not conclusive.',
        value: `Edge density: ${px.edgeDensity}`,
      });
    } else if (ed > 50) {
      signals.push({
        icon: '🔲', name: 'Edge Density',
        status: 'flag', statusLabel: 'High',
        body: 'Very high edge density detected — possibly heavy editing, compression, or a highly detailed graphic.',
        value: `Edge density: ${px.edgeDensity}`,
      });
    } else {
      signals.push({
        icon: '🔲', name: 'Edge Density',
        status: 'normal', statusLabel: 'Normal',
        body: 'Edge density is consistent with typical photographic content.',
        value: `Edge density: ${px.edgeDensity}`,
      });
    }

    // Block artefacts
    const ba = parseFloat(px.blockArtefact);
    if (ba > 4) {
      riskScore += 10;
      signals.push({
        icon: '🎨', name: 'Compression Artefacts',
        status: 'flag', statusLabel: 'Elevated',
        body: 'Block-level artefacts are above baseline. This may indicate aggressive JPEG compression, re-saving, or digital manipulation. It is common in heavily shared images.',
        value: `Block score: ${px.blockArtefact}`,
      });
    } else {
      signals.push({
        icon: '🎨', name: 'Compression Artefacts',
        status: 'normal', statusLabel: 'Normal',
        body: 'Compression artefact level is within a typical range.',
        value: `Block score: ${px.blockArtefact}`,
      });
    }

    // Colour correlation
    const rg = parseFloat(px.rgCorr);
    if (rg > 80) {
      riskScore += 8;
      signals.push({
        icon: '🌈', name: 'Colour Channel Correlation',
        status: 'flag', statusLabel: 'Unusual',
        body: 'Red–green channel correlation is unusually high. This can occur in monochromatic or artificially tinted images. It is not conclusive of AI generation.',
        value: `R-G: ${px.rgCorr}  R-B: ${px.rbCorr}`,
      });
    } else {
      signals.push({
        icon: '🌈', name: 'Colour Channel Correlation',
        status: 'normal', statusLabel: 'Normal',
        body: 'Colour channel correlations are within a typical range for photographic content.',
        value: `R-G: ${px.rgCorr}  R-B: ${px.rbCorr}`,
      });
    }

    // Resolution check
    const mp = parseFloat(px.megapixels);
    signals.push({
      icon: '📐', name: 'Image Dimensions',
      status: 'normal', statusLabel: 'Recorded',
      body: 'Dimensions and resolution recorded. Very round dimensions (512×512, 1024×1024) are commonly used by AI generation tools.',
      value: `${px.width} × ${px.height} px (${mp} MP)`,
    });
    const roundDimThreshold = 10;
    const roundW = Math.abs(px.width % 64) < roundDimThreshold || Math.abs(px.width % 64) > (64 - roundDimThreshold);
    const roundH = Math.abs(px.height % 64) < roundDimThreshold || Math.abs(px.height % 64) > (64 - roundDimThreshold);
    if (roundW && roundH && mp < 2) {
      riskScore += 12; flagCount++;
      signals.push({
        icon: '📏', name: 'Power-of-2 Dimensions',
        status: 'flag', statusLabel: 'Detected',
        body: 'This image has dimensions that are multiples of 64 and a low megapixel count. AI generation tools commonly produce images at such resolutions (e.g. 512×512, 1024×768).',
        value: `${px.width} × ${px.height} px`,
      });
    }
  } else {
    signals.push({
      icon: '❌', name: 'Pixel Analysis',
      status: 'skipped', statusLabel: 'Failed',
      body: 'Pixel-level analysis could not be completed for this file.',
      value: null,
    });
  }

  riskScore = Math.min(riskScore, 100);
  return buildVerdict(riskScore, flagCount, signals, 'image', file);
}

/* ─── VIDEO ────────────────────────────────────────────────── */
async function runVideoAnalysis() {
  const steps = [
    { id: 'magic',  label: 'Verify file signature' },
    { id: 'meta',   label: 'Read video metadata' },
    { id: 'frames', label: 'Sample & analyse frames' },
    { id: 'luma',   label: 'Frame luminance consistency' },
    { id: 'score',  label: 'Compile assessment' },
  ];
  initProgress(steps);

  setStep('magic', 'running');
  setProgress(8, 'Reading file signature…');
  await delay(400);
  const dv = await readImageBinary(currentFile);
  let containerType = 'Unknown';
  if (dv.byteLength >= 8) {
    const ftype = readAscii(dv, 4, 4);
    if (ftype === 'ftyp') containerType = 'MP4/MOV';
    else if (dv.byteLength >= 4 && readAscii(dv, 0, 4) === 'RIFF') containerType = 'WEBM/AVI';
    else if (dv.byteLength >= 4 && dv.getUint32(0, false) === 0x1A45DFA3) containerType = 'WEBM';
  }
  setStep('magic', 'done', containerType);
  setProgress(20, 'Container type identified.');

  setStep('meta', 'running');
  setProgress(30, 'Reading video metadata…');
  await delay(300);

  setStep('frames', 'running');
  setProgress(40, 'Sampling video frames…');
  const frameResult = await analyseVideoFrames(currentFile);

  if (frameResult.error) {
    setStep('frames', 'warn', frameResult.error);
  } else {
    setStep('frames', 'done', `${frameResult.frameCount} frames sampled`);
  }
  setProgress(70, 'Frame analysis complete.');
  await delay(200);

  setStep('luma', 'running');
  setProgress(80, 'Checking luminance consistency…');
  await delay(400);
  setStep('luma', frameResult.sampledFrames ? 'done' : 'skipped',
    frameResult.sampledFrames ? `${frameResult.frameCount} frames compared` : 'N/A');
  setProgress(90);

  setStep('score', 'running');
  setProgress(95, 'Compiling assessment…');
  await delay(500);

  const report = scoreVideoSignals(frameResult, currentFile, containerType);
  setStep('score', 'done', '');
  setProgress(100, 'Analysis complete.');
  await delay(400);

  progressPanel.hidden = true;
  renderResults(report, null, null, frameResult);
}

function scoreVideoSignals(fr, file, container) {
  const signals = [];
  let riskScore = 0;
  let flagCount = 0;

  signals.push({
    icon: '📦', name: 'Container Format',
    status: 'normal', statusLabel: 'Recorded',
    body: 'The file container type was identified from the binary header.',
    value: container,
  });

  if (fr.error) {
    signals.push({
      icon: '🎬', name: 'Frame Analysis',
      status: 'skipped', statusLabel: 'Failed',
      body: `Frame extraction failed: ${fr.error}`,
      value: null,
    });
  } else {
    signals.push({
      icon: '🎬', name: 'Frame Sampling',
      status: 'normal', statusLabel: 'Completed',
      body: `${fr.frameCount} frames were sampled evenly across the clip. Frame-by-frame ML analysis was not performed; only basic luminance statistics were checked.`,
      value: `Duration: ${fr.duration?.toFixed(1)}s  ·  ${fr.width}×${fr.height}px  ·  ${fr.frameCount} frames checked`,
    });

    // Luminance consistency across frames
    if (fr.sampledFrames && fr.sampledFrames.length >= 2) {
      const lumas = fr.sampledFrames.map(f => parseFloat(f.meanLuma));
      const meanL = lumas.reduce((a,b) => a+b, 0) / lumas.length;
      const varL = lumas.reduce((a, v) => a + (v - meanL)**2, 0) / lumas.length;
      const sdL = Math.sqrt(varL);

      if (sdL < 2) {
        riskScore += 15; flagCount++;
        signals.push({
          icon: '💡', name: 'Frame Luminance Consistency',
          status: 'flag', statusLabel: 'Unusual',
          body: 'Luminance across sampled frames is very uniform. Real-world video typically has more variation from movement and lighting changes. This could indicate a near-static or computer-generated clip.',
          value: `Std dev across frames: ${sdL.toFixed(2)}`,
        });
      } else {
        signals.push({
          icon: '💡', name: 'Frame Luminance Consistency',
          status: 'normal', statusLabel: 'Normal',
          body: 'Frame luminance variation is within a typical range for real-world video.',
          value: `Std dev across frames: ${sdL.toFixed(2)}`,
        });
      }

      // Build frame table note
      const frameTable = fr.sampledFrames.map((f, i) =>
        `Frame ${i+1} @ ${f.time}s: luma ${f.meanLuma}, σ ${f.stdDev}`
      ).join('\n');
      signals.push({
        icon: '📋', name: 'Per-Frame Statistics',
        status: 'normal', statusLabel: 'Recorded',
        body: 'Luminance and variance per sampled frame. These values alone are insufficient to confirm manipulation.',
        value: frameTable,
      });
    }
  }

  // Audio-video sync — cannot be verified without ML; mark as unavailable
  signals.push({
    icon: '🔊', name: 'Audio-Video Sync',
    status: 'skipped', statusLabel: 'Not checked',
    body: 'Audio-video synchronisation analysis requires ML-based lip-sync verification, which is not available in this prototype. Manual inspection or a specialist tool is recommended.',
    value: null,
  });

  // Face consistency — not available
  signals.push({
    icon: '👤', name: 'Face Consistency',
    status: 'skipped', statusLabel: 'Not checked',
    body: 'Frame-to-frame face consistency analysis (deepfake detection) requires an on-device face detection and comparison model, which is not included in this prototype.',
    value: null,
  });

  riskScore = Math.min(riskScore, 100);
  return buildVerdict(riskScore, flagCount, signals, 'video', file);
}

/* ─── AUDIO ────────────────────────────────────────────────── */
async function runAudioAnalysis() {
  const steps = [
    { id: 'magic',   label: 'Verify file signature' },
    { id: 'decode',  label: 'Decode audio stream' },
    { id: 'rms',     label: 'Loudness & dynamics analysis' },
    { id: 'spectral',label: 'Spectral analysis' },
    { id: 'score',   label: 'Compile assessment' },
  ];
  initProgress(steps);

  setStep('magic', 'running');
  setProgress(8, 'Reading file signature…');
  await delay(350);
  const dv = await readImageBinary(currentFile);
  let audioFmt = 'Unknown';
  if (dv.byteLength >= 3) {
    const h0 = dv.getUint8(0), h1 = dv.getUint8(1), h2 = dv.getUint8(2);
    if (h0 === 0xFF && (h1 & 0xE0) === 0xE0) audioFmt = 'MP3';
    else if (h0 === 0x49 && h1 === 0x44 && h2 === 0x33) audioFmt = 'MP3 (ID3 header)';
    else if (h0 === 0x52 && h1 === 0x49 && h2 === 0x46) audioFmt = 'WAV (RIFF)';
    else if (readAscii(dv, 4, 4) === 'ftyp') audioFmt = 'M4A / AAC';
  }
  setStep('magic', 'done', audioFmt);
  setProgress(20);

  setStep('decode', 'running');
  setProgress(35, 'Decoding audio…');
  const audio = await analyseAudioBuffer(currentFile);
  if (audio.error) {
    setStep('decode', 'warn', 'Decode failed');
    setProgress(40, audio.error);
    await delay(400);
    // Still continue with limited signals
  } else {
    setStep('decode', 'done', `${audio.sampleRate} Hz, ${audio.channels}ch`);
    setProgress(55);
  }

  setStep('rms', audio.error ? 'skipped' : 'running');
  setProgress(65, 'Analysing dynamics…');
  await delay(400);
  if (!audio.error) {
    setStep('rms', 'done', `RMS: ${audio.rmsDb} dB`);
  }
  setProgress(75);

  setStep('spectral', audio.error ? 'skipped' : 'running');
  setProgress(85, 'Spectral analysis…');
  await delay(500);
  if (!audio.error) {
    setStep('spectral', 'done', `Centroid: ${audio.spectralCentroid} Hz`);
  }
  setProgress(92);

  setStep('score', 'running');
  setProgress(96, 'Compiling assessment…');
  await delay(500);

  const report = scoreAudioSignals(audio, currentFile, audioFmt);
  setStep('score', 'done', '');
  setProgress(100, 'Analysis complete.');
  await delay(400);

  progressPanel.hidden = true;
  renderResults(report, null, null, null, audio);
}

function scoreAudioSignals(a, file, fmt) {
  const signals = [];
  let riskScore = 0;
  let flagCount = 0;

  signals.push({
    icon: '📦', name: 'Audio Format',
    status: 'normal', statusLabel: 'Identified',
    body: 'The audio format was identified from the binary file signature (magic bytes).',
    value: fmt,
  });

  if (a.error) {
    signals.push({
      icon: '❌', name: 'Audio Decode',
      status: 'skipped', statusLabel: 'Failed',
      body: `The Web Audio API could not decode this file: ${a.error}. Some analysis steps were skipped.`,
      value: null,
    });
  } else {
    signals.push({
      icon: '⏱️', name: 'Recording Properties',
      status: 'normal', statusLabel: 'Recorded',
      body: 'Basic technical properties extracted from the decoded audio buffer.',
      value: `Duration: ${a.duration}s  ·  Sample rate: ${a.sampleRate} Hz  ·  Channels: ${a.channels}`,
    });

    // Silence ratio
    const sr = parseFloat(a.silenceRatio);
    if (sr > 30) {
      riskScore += 12; flagCount++;
      signals.push({
        icon: '🔇', name: 'Silence Ratio',
        status: 'flag', statusLabel: 'High',
        body: 'More than 30% of the audio is near-silent. This can indicate cuts, splicing, or a recording with long pauses. It is not conclusive of AI generation.',
        value: `${a.silenceRatio}% silence`,
      });
    } else {
      signals.push({
        icon: '🔇', name: 'Silence Ratio',
        status: 'normal', statusLabel: 'Normal',
        body: 'The proportion of silent segments is within a typical range.',
        value: `${a.silenceRatio}% silence`,
      });
    }

    // Loudness
    const rms = parseFloat(a.rmsDb);
    if (rms > -6) {
      riskScore += 8;
      signals.push({
        icon: '📢', name: 'Loudness (RMS)',
        status: 'flag', statusLabel: 'Very high',
        body: 'RMS loudness is very high, which may indicate heavy dynamic compression. Heavily normalized audio is common in synthetic speech pipelines.',
        value: `RMS: ${a.rmsDb} dB  ·  Peak: ${a.peakDb} dB`,
      });
    } else {
      signals.push({
        icon: '📢', name: 'Loudness (RMS)',
        status: 'normal', statusLabel: 'Normal',
        body: 'Loudness levels are within a typical range.',
        value: `RMS: ${a.rmsDb} dB  ·  Peak: ${a.peakDb} dB`,
      });
    }

    // Zero-crossing rate
    const zcr = parseFloat(a.zcr);
    signals.push({
      icon: '〰️', name: 'Zero-Crossing Rate',
      status: 'normal', statusLabel: 'Recorded',
      body: 'ZCR relates to the noisiness or tonality of the signal. Unusually low ZCR may suggest a very tonal or synthetic signal, but interpretation depends on content type.',
      value: `ZCR: ${a.zcr} crossings/sample`,
    });

    // Spectral centroid
    const sc = parseFloat(a.spectralCentroid);
    if (sc < 800) {
      riskScore += 8;
      signals.push({
        icon: '📡', name: 'Spectral Centroid',
        status: 'flag', statusLabel: 'Low',
        body: 'Spectral centroid is low, suggesting the audio energy is concentrated in low frequencies. Some TTS (text-to-speech) systems produce audio with reduced high-frequency content.',
        value: `${a.spectralCentroid} Hz`,
      });
    } else {
      signals.push({
        icon: '📡', name: 'Spectral Centroid',
        status: 'normal', statusLabel: 'Normal',
        body: 'Spectral centroid is within a typical range for speech and music.',
        value: `${a.spectralCentroid} Hz`,
      });
    }

    // HF ratio
    const hf = parseFloat(a.hfRatio);
    if (hf < 5) {
      riskScore += 10; flagCount++;
      signals.push({
        icon: '📶', name: 'High-Frequency Energy',
        status: 'flag', statusLabel: 'Low',
        body: 'Very little energy above 4 kHz. Some AI voice synthesis systems produce audio with a reduced high-frequency presence, which can sound unnaturally clean.',
        value: `${a.hfRatio}% of energy above 4 kHz`,
      });
    } else {
      signals.push({
        icon: '📶', name: 'High-Frequency Energy',
        status: 'normal', statusLabel: 'Normal',
        body: 'High-frequency energy distribution appears within a typical range.',
        value: `${a.hfRatio}% of energy above 4 kHz`,
      });
    }

    // ML speaker verification — not available
    signals.push({
      icon: '🗣️', name: 'AI Speech Classification',
      status: 'skipped', statusLabel: 'Not available',
      body: 'Detecting AI-cloned or synthetic speech with high reliability requires a dedicated ML model (e.g. SpeechBrain, Resemblyzer). This capability is not included in the current prototype.',
      value: null,
    });

    signals.push({
      icon: '👤', name: 'Speaker Identity',
      status: 'skipped', statusLabel: 'Not performed',
      body: 'Speaker identification is NOT performed. Claiming that audio belongs to a specific person requires a validated speaker-verification system and is outside the scope of this tool.',
      value: null,
    });
  }

  riskScore = Math.min(riskScore, 100);
  return buildVerdict(riskScore, flagCount, signals, 'audio', file);
}

/* ═══════════════════════════════════════════════════════════════
   VERDICT BUILDER
   ═══════════════════════════════════════════════════════════════ */

function buildVerdict(riskScore, flagCount, signals, mediaType, file) {
  let level, tag, headline, summary;

  if (riskScore <= 15) {
    level = 'low';
    tag   = '🟢 Low concern';
    headline = 'No strong manipulation signals detected';
    summary  = `Inspection of this ${mediaType} found no prominent technical signals commonly associated with AI generation or editing. However, absence of signals does not confirm authenticity — many AI-generated files pass technical inspection cleanly.`;
  } else if (riskScore <= 40) {
    level = 'medium';
    tag   = '🟡 Possible signals';
    headline = 'Some noteworthy signals detected';
    summary  = `Inspection found ${flagCount} signal(s) that may warrant further review. These signals can arise from normal editing, compression, or sharing — they are not conclusive proof of manipulation.`;
  } else if (riskScore <= 70) {
    level = 'high';
    tag   = '🔴 Multiple signals';
    headline = 'Multiple signals of possible manipulation';
    summary  = `Several technical signals associated with AI generation or editing were identified. This warrants careful review and independent verification before using or sharing this ${mediaType}.`;
  } else {
    level = 'high';
    tag   = '🔴 Significant signals';
    headline = 'Significant signals of AI generation or editing';
    summary  = `This ${mediaType} shows multiple signals — including possible AI-tool metadata — associated with synthetic or manipulated content. Independent verification is strongly recommended.`;
  }

  // Confidence is expressed as a range, never a precise value
  const confLow  = Math.max(0,  riskScore - 20);
  const confHigh = Math.min(100, riskScore + 20);

  return {
    level, tag, headline, summary,
    riskScore, flagCount, signals,
    mediaType, file,
    confidenceRange: `${confLow}–${confHigh}%`,
    confidenceMid: riskScore,
  };
}

/* ═══════════════════════════════════════════════════════════════
   RENDER RESULTS
   ═══════════════════════════════════════════════════════════════ */

function renderResults(report, exif, px, fr, audioData) {
  analysisResults = report;

  // Verdict card
  const circumference = 2 * Math.PI * 38; // r=38
  const dashOffset = circumference * (1 - report.riskScore / 100);
  const ringColour = report.level === 'low'    ? 'hsl(152,68%,48%)' :
                     report.level === 'medium' ? 'hsl(38,90%,55%)' :
                                                 'hsl(352,80%,58%)';
  verdictCard.className = `card verdict-card verdict-${report.level}`;
  verdictCard.innerHTML = `
    <div class="verdict-inner">
      <div class="verdict-meter">
        <svg class="risk-ring" viewBox="0 0 100 100" role="img" aria-label="Risk score ${report.riskScore} out of 100">
          <circle class="risk-ring-track" cx="50" cy="50" r="38"/>
          <circle class="risk-ring-fill"
            cx="50" cy="50" r="38"
            stroke="${ringColour}"
            stroke-dasharray="${circumference.toFixed(2)}"
            stroke-dashoffset="${circumference.toFixed(2)}"
            data-target="${dashOffset.toFixed(2)}"
            style="transform: rotate(-90deg); transform-origin: 50% 50%;"
          />
          <text class="risk-ring-text" x="50" y="50"
            text-anchor="middle" dominant-baseline="central"
            fill="${ringColour}">
            ${report.riskScore}
          </text>
        </svg>
        <div class="risk-label">Signal<br>Score</div>
      </div>
      <div class="verdict-body">
        <span class="verdict-tag ${report.level}">${report.tag}</span>
        <h3 class="verdict-headline">${escHtml(report.headline)}</h3>
        <p class="verdict-summary">${escHtml(report.summary)}</p>
        <div class="confidence-bar-wrap">
          <span>Uncertainty range</span>
          <div class="confidence-track">
            <div class="confidence-fill" style="width: ${report.confidenceMid}%"></div>
          </div>
          <span class="confidence-value">${report.confidenceRange}</span>
        </div>
        <p class="verdict-disclaimer">
          ⚠️ This score reflects technical signal inspection only. It is <em>not</em> a validated ML model output
          and should not be treated as definitive proof that this ${report.mediaType} is real or manipulated.
        </p>
      </div>
    </div>
  `;

  // Animate the ring
  requestAnimationFrame(() => {
    const fill = verdictCard.querySelector('.risk-ring-fill');
    if (fill) {
      fill.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.2,0,0,1)';
      fill.style.strokeDashoffset = fill.dataset.target;
    }
  });

  // Signals
  signalsGrid.innerHTML = '';
  report.signals.forEach((sig, i) => {
    const card = document.createElement('div');
    card.className = 'signal-card';
    card.style.animationDelay = `${i * 0.06}s`;
    card.innerHTML = `
      <div class="signal-header">
        <span class="signal-icon" aria-hidden="true">${escHtml(sig.icon)}</span>
        <span class="signal-name">${escHtml(sig.name)}</span>
        <span class="signal-status ${sig.status}">${escHtml(sig.statusLabel)}</span>
      </div>
      <div class="signal-body">${escHtml(sig.body)}</div>
      ${sig.value ? `<div class="signal-value" aria-label="Value: ${sig.value}">${escHtml(sig.value)}</div>` : ''}
    `;
    signalsGrid.appendChild(card);
  });

  // Metadata table
  const metaRows = buildMetadataRows(exif, px, fr, audioData, report.file);
  if (metaRows.length) {
    metadataTableWrap.innerHTML = `
      <table class="metadata-table" aria-label="File and technical metadata">
        <thead><tr><th scope="col">Property</th><th scope="col">Value</th></tr></thead>
        <tbody>${metaRows.map(([k,v]) => `<tr><td class="key">${escHtml(k)}</td><td>${escHtml(String(v ?? '—'))}</td></tr>`).join('')}</tbody>
      </table>
      <p style="margin-top: 12px; font-size: 0.78rem; color: var(--clr-text-faint);">
        ℹ️ Metadata may be missing, stripped by platforms, or manually edited. It is not proof of authenticity.
      </p>
    `;
    metadataDetails.hidden = false;
  }

  // Next steps
  const isHighConcern = report.level === 'high' || report.level === 'medium';
  const steps = [
    { icon: '🔎', text: 'Search for the original source of this file and check the publication date.' },
    { icon: '📰', text: 'Look for independent reports, fact-checks, or other copies of the same content.' },
    { icon: '▶️', text: 'If video: compare against an original recording from a reliable source.' },
    { icon: '🖼️', text: isHighConcern ? 'Run a reverse image search to trace the media origin.' : 'Consider a reverse image search if context is unclear.' },
    { icon: '🔬', text: 'For high-stakes decisions, seek review from a trained journalist or forensic specialist.' },
    { icon: '🤖', text: 'Try additional tools such as Hive Moderation, AI or Not, or FotoForensics for independent checks.' },
  ];
  nextStepsGrid.innerHTML = steps.map(s => `
    <div class="next-step-item">
      <span class="next-step-icon" aria-hidden="true">${s.icon}</span>
      <span>${escHtml(s.text)}</span>
    </div>
  `).join('');

  resultsPanel.hidden = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildMetadataRows(exif, px, fr, audio, file) {
  const rows = [];
  if (file) {
    rows.push(['File name', file.name]);
    rows.push(['File type (MIME)', file.type]);
    rows.push(['File size', formatBytes(file.size)]);
    rows.push(['Last modified', new Date(file.lastModified).toISOString()]);
  }
  if (exif) {
    if (exif.make)     rows.push(['Camera make', exif.make]);
    if (exif.model)    rows.push(['Camera model', exif.model]);
    if (exif.software) rows.push(['Software', exif.software]);
    if (exif.dateTime) rows.push(['Date/Time (EXIF)', exif.dateTime]);
    if (exif.comment)  rows.push(['Image comment', exif.comment]);
    if (exif.resolutionX) rows.push(['Resolution', `${exif.resolutionX} × ${exif.resolutionY} DPI`]);
    rows.push(['GPS data', exif.hasGps ? 'Present' : 'Not found']);
    rows.push(['XMP data', exif.hasXmp ? 'Present' : 'Not found']);
  }
  if (px) {
    rows.push(['Dimensions', `${px.width} × ${px.height} px`]);
    rows.push(['Megapixels', px.megapixels]);
    rows.push(['Mean luminance', px.meanLuma]);
    rows.push(['Luminance std dev', px.stdDev]);
    rows.push(['Edge density', px.edgeDensity]);
    rows.push(['Block artefact score', px.blockArtefact]);
  }
  if (fr && !fr.error) {
    rows.push(['Video duration', `${fr.duration?.toFixed(2)}s`]);
    rows.push(['Video dimensions', `${fr.width} × ${fr.height} px`]);
    rows.push(['Frames sampled', String(fr.frameCount)]);
  }
  if (audio && !audio.error) {
    rows.push(['Audio duration', `${audio.duration}s`]);
    rows.push(['Sample rate', `${audio.sampleRate} Hz`]);
    rows.push(['Channels', String(audio.channels)]);
    rows.push(['RMS loudness', `${audio.rmsDb} dB`]);
    rows.push(['Peak loudness', `${audio.peakDb} dB`]);
    rows.push(['Zero-crossing rate', audio.zcr]);
    rows.push(['Silence ratio', `${audio.silenceRatio}%`]);
    rows.push(['Spectral centroid', `${audio.spectralCentroid} Hz`]);
    rows.push(['HF energy (>4kHz)', `${audio.hfRatio}%`]);
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════
   COPY REPORT
   ═══════════════════════════════════════════════════════════════ */
copyReportBtn.addEventListener('click', () => {
  if (!analysisResults) return;
  const r = analysisResults;
  const lines = [
    `MediaShield AI — Analysis Report`,
    `Generated: ${new Date().toISOString()}`,
    `File: ${r.file?.name}  (${r.file ? formatBytes(r.file.size) : '?'})`,
    ``,
    `VERDICT: ${r.tag}`,
    `Headline: ${r.headline}`,
    `Signal score: ${r.riskScore}/100  (uncertainty range: ${r.confidenceRange})`,
    ``,
    `Summary: ${r.summary}`,
    ``,
    `SIGNALS:`,
    ...r.signals.map(s => `  [${s.statusLabel.toUpperCase()}] ${s.name}: ${s.body}${s.value ? `\n    Value: ${s.value}` : ''}`),
    ``,
    `DISCLAIMER: This report was produced by an automated inspection workflow. Results are not`,
    `definitive proof of authenticity or manipulation. Seek independent verification for high-stakes decisions.`,
  ];
  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showToast('✅ Report copied to clipboard'))
    .catch(() => showToast('❌ Could not copy to clipboard'));
});

/* ═══════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
