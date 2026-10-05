# MediaShield AI — Architecture & Documentation

## File Structure

```
CIE PROJECT/
├── index.html        — Semantic HTML shell, accessible markup
├── styles.css        — Design system, components, animations
├── app.js            — All analysis logic (browser-local)
└── README.md         — This file
```

## Analysis Modules

### Image Analysis

| Check | Method | API |
|-------|--------|-----|
| File signature | Magic byte inspection | DataView |
| EXIF metadata | Custom binary parser | FileReader + DataView |
| AI software tag | EXIF Software field keyword match | — |
| GPS data presence | EXIF IFD pointer detection | — |
| Pixel statistics | Mean luminance, std deviation | Canvas 2D + getImageData |
| Edge density | Sobel-like gradient approximation | Canvas pixel data |
| Compression artefacts | 8x8 block mean comparison | Canvas pixel data |
| Colour correlation | R-G, R-B channel cross-correlation | Canvas pixel data |
| Power-of-2 dimensions | Dimension modulo check | HTMLImageElement |

### Video Analysis

| Check | Method | API |
|-------|--------|-----|
| Container format | Binary header (ftyp, RIFF, EBML) | DataView |
| Duration and dimensions | Native media element | HTMLVideoElement |
| Frame sampling | Seek + canvas capture (up to 6 frames) | HTMLVideoElement + Canvas 2D |
| Frame luminance consistency | Std dev across sampled frames | Canvas pixel data |
| Audio-video sync | Not available — requires ML | — |
| Face consistency | Not available — requires ML | — |

### Audio Analysis

| Check | Method | API |
|-------|--------|-----|
| File signature | Magic byte inspection | DataView |
| Decode and properties | Audio buffer decode | Web Audio API |
| RMS loudness | Root mean square of samples | AudioBuffer.getChannelData |
| Peak amplitude | Sample maximum | — |
| Silence ratio | Sample amplitude threshold | — |
| Zero-crossing rate | Sign change detection | — |
| Spectral centroid | DFT over central segment | Custom 2048-point DFT |
| HF energy ratio | Energy above 4 kHz vs total | Spectrum analysis |
| AI speech classification | Not available — requires ML | — |
| Speaker identification | Not performed — by design | — |

## Signal Scoring

Signals are scored on a 0-100 scale using a rule-based heuristic system.
The score is NOT a validated ML confidence value.

| Score range | Assessment |
|-------------|-----------|
| 0-15 | Low concern — no strong signals |
| 16-40 | Possible signals — some flags detected |
| 41-70 | Multiple signals — warrants review |
| 71-100 | Significant signals — independent verification recommended |

All scores are presented with a +/- 20 point uncertainty range.

## Known Limitations

1. **No ML inference** — All scoring is rule-based heuristics.
2. **False positives** — Compressed or platform-processed real media can trigger signals.
3. **False negatives** — Many AI-generated images pass all technical checks.
4. **EXIF only for JPEG** — PNG and WEBP metadata parsing is not fully implemented.
5. **Video frame limit** — Only up to 6 frames are sampled.
6. **No face detection** — Requires a dedicated on-device model.
7. **Metadata forgery** — EXIF can be manually crafted; presence is not proof of authenticity.

## Privacy Architecture

- All processing is browser-local. No data is sent to any server.
- Files are held in memory only for the duration of analysis.
- Clearing the file or closing the tab removes all data.
- No analytics, tracking, or third-party scripts are loaded.

## Intended Use

MediaShield AI is designed as a first-pass media inspection aid for:
- Students and educators learning about synthetic media
- Journalists and fact-checkers performing initial triage
- Researchers studying AI-generated content signals
- General users wanting to inspect unfamiliar media

NOT suitable as a sole tool for legal proceedings, publishing decisions, or identifying individuals.

## Suggested Models for Future Integration

| Module | Suggested model/library | License |
|--------|------------------------|---------|
| Image AI detection | Hive Moderation API, AI or Not | Commercial |
| Face manipulation | FaceForensics++ models | Research |
| Audio synthesis | SpeechBrain anti-spoofing | Apache 2.0 |
| Video deepfake | DFDC baseline models | Research |
| On-device inference | TensorFlow.js / ONNX Runtime Web | Apache 2.0 |

## Evaluation Criteria

- False-positive rate on real, unedited media
- False-negative rate on known AI-generated media
- Performance after JPEG compression (quality 30-80)
- Performance after social media re-encoding
- Calibration of uncertainty ranges vs actual error rates
- Accessibility audit (WCAG 2.1 AA)
- Performance on mobile devices (LCP, INP)
