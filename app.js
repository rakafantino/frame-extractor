const MAX_FRAMES = 1000;
const SEEK_TIMEOUT_MS = 9000;

const els = {
  videoInput: document.querySelector("#videoInput"),
  dropzone: document.querySelector("#dropzone"),
  videoPreview: document.querySelector("#videoPreview"),
  videoMeta: document.querySelector("#videoMeta"),
  fileName: document.querySelector("#fileName"),
  durationText: document.querySelector("#durationText"),
  startInput: document.querySelector("#startInput"),
  endInput: document.querySelector("#endInput"),
  fpsInput: document.querySelector("#fpsInput"),
  prefixInput: document.querySelector("#prefixInput"),
  qualityField: document.querySelector("#qualityField"),
  qualityInput: document.querySelector("#qualityInput"),
  qualityValue: document.querySelector("#qualityValue"),
  estimateText: document.querySelector("#estimateText"),
  constraintText: document.querySelector("#constraintText"),
  extractButton: document.querySelector("#extractButton"),
  zipButton: document.querySelector("#zipButton"),
  resetButton: document.querySelector("#resetButton"),
  clearButton: document.querySelector("#clearButton"),
  progressWrap: document.querySelector("#progressWrap"),
  progressText: document.querySelector("#progressText"),
  progressCount: document.querySelector("#progressCount"),
  progressBar: document.querySelector("#progressBar"),
  statusText: document.querySelector("#statusText"),
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
  framesGrid: document.querySelector("#framesGrid"),
};

let videoUrl = "";
let frames = [];
let currentFile = null;
let isExtracting = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function selectedFormat() {
  return document.querySelector('input[name="format"]:checked').value;
}

function extensionFor(format) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[format];
}

function safePrefix(value) {
  const cleaned = value
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "frame";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0 detik";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2).replace(/\.00$/, "");
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

function getRange() {
  const duration = els.videoPreview.duration || 0;
  const start = Math.max(0, Number(els.startInput.value) || 0);
  const endInput = Number(els.endInput.value);
  const end = Math.min(duration || endInput || 0, Number.isFinite(endInput) ? endInput : duration);
  const fps = Math.max(0.1, Number(els.fpsInput.value) || 1);
  const span = Math.max(0, end - start);
  const count = Math.max(0, Math.floor(span * fps));
  return { start, end, fps, span, count, duration };
}

function setStatus(message, isWarning = false) {
  els.statusText.textContent = message;
  els.statusText.classList.toggle("warn", isWarning);
}

function updateEstimate() {
  const { start, end, fps, count, duration } = getRange();
  const hasVideo = Boolean(currentFile && duration);
  const format = selectedFormat();

  els.qualityField.hidden = format === "image/png";
  els.estimateText.textContent = `Estimasi: ${count.toLocaleString("id-ID")} frame`;
  els.constraintText.textContent = `Batas praktis: ${MAX_FRAMES.toLocaleString("id-ID")} frame`;

  const invalidRange = !hasVideo || end <= start || count < 1;
  const tooMany = count > MAX_FRAMES;
  els.extractButton.disabled = invalidRange || tooMany || isExtracting;

  if (!hasVideo) {
    setStatus("Pilih video untuk mulai.");
  } else if (end <= start) {
    setStatus("End harus lebih besar dari start.", true);
  } else if (count < 1) {
    setStatus("Naikkan FPS atau perpanjang rentang waktu.", true);
  } else if (tooMany) {
    setStatus(`Terlalu banyak frame. Turunkan FPS atau pendekkan rentang waktu.`, true);
  } else {
    setStatus(
      `Siap extract ${count.toLocaleString("id-ID")} frame dari ${formatDuration(start)} sampai ${formatDuration(end)} pada ${fps} fps.`,
    );
  }
}

function clearFrames() {
  frames.forEach((frame) => URL.revokeObjectURL(frame.url));
  frames = [];
  els.framesGrid.replaceChildren();
  els.emptyState.hidden = false;
  els.resultCount.textContent = "Belum ada frame";
  els.zipButton.disabled = true;
  els.clearButton.disabled = true;
}

function resetApp() {
  clearFrames();
  currentFile = null;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = "";
  els.videoInput.value = "";
  els.videoPreview.removeAttribute("src");
  els.videoPreview.load();
  els.videoMeta.hidden = true;
  els.fileName.textContent = "Belum ada video";
  els.durationText.textContent = "0 detik";
  els.startInput.value = "0";
  els.endInput.value = "10";
  els.fpsInput.value = "1";
  els.prefixInput.value = "frame";
  els.progressWrap.hidden = true;
  updateEstimate();
}

function setProgress(done, total, label) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressWrap.hidden = false;
  els.progressBar.value = percent;
  els.progressText.textContent = label;
  els.progressCount.textContent = `${percent}%`;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("video/")) {
    setStatus("File harus berupa video.", true);
    return;
  }

  clearFrames();
  currentFile = file;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  els.videoPreview.src = videoUrl;
  els.videoMeta.hidden = false;
  els.fileName.textContent = file.name;
  els.durationText.textContent = "Membaca durasi...";
  setStatus("Memuat metadata video...");
}

function waitForEvent(target, eventName, timeoutMs = SEEK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout saat menunggu ${eventName}.`));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };

    const onEvent = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Browser gagal membaca video ini."));
    };

    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seekTo(video, time) {
  const clampedTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - clampedTime) < 0.004 && video.readyState >= 2) return;
  const pending = waitForEvent(video, "seeked");
  video.currentTime = clampedTime;
  await pending;
}

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal membuat gambar dari frame."))),
      format,
      quality,
    );
  });
}

function renderFrameCard(frame) {
  const card = document.createElement("article");
  card.className = "frame-card";

  const image = document.createElement("img");
  image.src = frame.url;
  image.alt = `${frame.name} pada ${formatDuration(frame.time)}`;
  image.loading = "lazy";

  const footer = document.createElement("footer");
  const name = document.createElement("span");
  name.className = "frame-name";
  name.textContent = frame.name;

  const time = document.createElement("span");
  time.className = "frame-time";
  time.textContent = formatDuration(frame.time);

  const link = document.createElement("a");
  link.className = "download-link";
  link.href = frame.url;
  link.download = frame.name;
  link.textContent = "Download";

  footer.append(name, time, link);
  card.append(image, footer);
  els.framesGrid.append(card);
}

async function extractFrames() {
  if (isExtracting) return;

  const { start, fps, count } = getRange();
  if (!currentFile || count < 1 || count > MAX_FRAMES) return;

  isExtracting = true;
  els.extractButton.disabled = true;
  els.zipButton.disabled = true;
  clearFrames();
  els.emptyState.hidden = true;

  const video = els.videoPreview;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  const format = selectedFormat();
  const extension = extensionFor(format);
  const quality = Number(els.qualityInput.value);
  const prefix = safePrefix(els.prefixInput.value || currentFile.name);
  const pad = String(count).length;

  try {
    await video.pause();
    await seekTo(video, start);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (!canvas.width || !canvas.height) {
      throw new Error("Resolusi video belum terbaca.");
    }

    for (let index = 0; index < count; index += 1) {
      const time = start + index / fps;
      setProgress(index, count, `Extract frame ${index + 1} dari ${count}`);
      await seekTo(video, time);

      if (format === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, format, quality);
      const name = `${prefix}_${String(index + 1).padStart(pad, "0")}.${extension}`;
      const frame = {
        blob,
        name,
        time,
        url: URL.createObjectURL(blob),
      };
      frames.push(frame);
      renderFrameCard(frame);

      if (index % 8 === 0) await sleep(0);
    }

    setProgress(count, count, "Selesai");
    els.emptyState.hidden = true;
    els.resultCount.textContent = `${frames.length.toLocaleString("id-ID")} frame siap`;
    els.zipButton.disabled = frames.length === 0;
    els.clearButton.disabled = frames.length === 0;
    setStatus("Frame berhasil diekstrak. Kamu bisa download per frame atau ZIP.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    isExtracting = false;
    updateEstimate();
  }
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function writeUint16(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, stamp.time);
    writeUint16(local, 12, stamp.date);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, stamp.time);
    writeUint16(central, 14, stamp.date);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralDirectory.push(central);

    offset += local.length + data.length;
  }

  const centralStart = offset;
  chunks.push(...centralDirectory);
  const centralSize = centralDirectory.reduce((total, item) => total + item.length, 0);

  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, centralStart);
  writeUint16(end, 20, 0);
  chunks.push(end);

  return new Blob(chunks, { type: "application/zip" });
}

async function downloadZip() {
  if (!frames.length) return;
  els.zipButton.disabled = true;
  setStatus("Membuat ZIP...");

  try {
    const blob = await createZip(frames);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safePrefix(els.prefixInput.value || "frames")}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("ZIP siap di-download.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    els.zipButton.disabled = frames.length === 0;
  }
}

els.videoInput.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

els.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropzone.classList.add("is-dragging");
});

els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("is-dragging");
});

els.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropzone.classList.remove("is-dragging");
  loadFile(event.dataTransfer.files?.[0]);
});

els.videoPreview.addEventListener("loadedmetadata", () => {
  const duration = els.videoPreview.duration;
  els.durationText.textContent = formatDuration(duration);
  els.endInput.value = Math.min(10, duration).toFixed(2).replace(/\.00$/, "");
  updateEstimate();
});

[
  els.startInput,
  els.endInput,
  els.fpsInput,
  els.prefixInput,
  els.qualityInput,
  ...document.querySelectorAll('input[name="format"]'),
].forEach((input) => {
  input.addEventListener("input", () => {
    els.qualityValue.textContent = Number(els.qualityInput.value).toFixed(2);
    updateEstimate();
  });
});

els.extractButton.addEventListener("click", extractFrames);
els.zipButton.addEventListener("click", downloadZip);
els.resetButton.addEventListener("click", resetApp);
els.clearButton.addEventListener("click", () => {
  clearFrames();
  setStatus("Hasil dibersihkan.");
});

updateEstimate();
