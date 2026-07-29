const API_BASE = localStorage.getItem("classReflectApiBase") || "";
const TEACHER_ID = localStorage.getItem("classReflectTeacherId") || "demo-teacher";

const FLOW = ["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"];
const state = createInitialState();

const el = {
  libraryView: document.querySelector("#libraryView"),
  workspaceView: document.querySelector("#workspaceView"),
  lessonList: document.querySelector("#lessonList"),
  startAnalysis: document.querySelector("#startAnalysis"),
  showLibrary: document.querySelector("#showLibrary"),
  videoInput: document.querySelector("#videoInput"),
  videoName: document.querySelector("#videoName"),
  classVideo: document.querySelector("#classVideo"),
  uploadEmpty: document.querySelector("#uploadEmpty"),
  evidenceChip: document.querySelector("#evidenceChip"),
  segmentTabs: document.querySelector("#segmentTabs"),
  recordEditor: document.querySelector("#recordEditor"),
  saveStatus: document.querySelector("#saveStatus"),
  flowSteps: document.querySelector("#flowSteps"),
  conversation: document.querySelector("#conversation"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  newAnalysis: document.querySelector("#newAnalysis"),
  editRecord: document.querySelector("#editRecord"),
  markImportant: document.querySelector("#markImportant"),
  markConfusing: document.querySelector("#markConfusing"),
  reanalyzeSegment: document.querySelector("#reanalyzeSegment")
};

render();
loadLibrary();

el.startAnalysis.addEventListener("click", () => startNewAnalysis());
el.showLibrary.addEventListener("click", () => showLibrary());

el.videoInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await uploadVideo(file);
});

el.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = el.taskInput.value.trim();
  if (!value) return;
  state.goal = value;
  state.messages.push({ role: "teacher", text: value });
  el.taskInput.value = "";
  syncStep();
  render();
});

el.recordEditor.addEventListener("input", () => {
  state.dirty = true;
  el.saveStatus.textContent = "有未保存修改";
});

el.recordEditor.addEventListener("blur", () => saveCurrentSection());
el.newAnalysis.addEventListener("click", () => {
  startNewAnalysis();
});
el.editRecord.addEventListener("click", () => el.recordEditor.focus());
el.markImportant.addEventListener("click", () => tagCurrentSection("重点"));
el.markConfusing.addEventListener("click", () => tagCurrentSection("困惑"));
el.reanalyzeSegment.addEventListener("click", () => rebuildSections());

document.querySelector("#prevSegment").addEventListener("click", () => selectSection(Math.max(0, state.currentSectionIndex - 1)));
document.querySelector("#nextSegment").addEventListener("click", () => selectSection(Math.min(state.sections.length - 1, state.currentSectionIndex + 1)));

function createInitialState() {
  const saved = readActiveSession();
  return {
    lessonId: saved?.lessonId || null,
    videoId: saved?.videoId || null,
    taskId: saved?.taskId || null,
    videoUrl: saved?.videoUrl || null,
    fileName: saved?.fileName || "",
    uploadProgress: 0,
    audioProgress: 0,
    audioStatus: "idle",
    audioError: "",
    processingStatus: saved?.processingStatus || "idle",
    error: "",
    step: saved?.step || 1,
    goal: saved?.goal || "",
    messages: [],
    sections: [],
    evidenceCards: [],
    library: [],
    libraryError: "",
    view: saved?.lessonId ? "workspace" : "library",
    currentSectionIndex: 0,
    dirty: false,
    pollTimer: null
  };
}

function readActiveSession() {
  try {
    const saved = JSON.parse(localStorage.getItem("classReflectActiveSession") || "null");
    if (["uploading", "queued", "running", "failed", "ready"].includes(saved?.processingStatus)) return saved;
  } catch {}
  return null;
}

async function uploadVideo(file) {
  try {
    Object.assign(state, {
      fileName: file.name,
      uploadProgress: 0,
      audioProgress: 0,
      audioStatus: "preparing",
      audioError: "",
      processingStatus: "uploading",
      error: "",
      view: "workspace"
    });
    state.videoUrl = URL.createObjectURL(file);
    syncStep();
    render();

    const lesson = await api("/api/lessons", {
      method: "POST",
      body: {
        lesson_title: state.goal || "课堂视频复盘",
        course_title: "课堂复盘"
      }
    });
    state.lessonId = lesson.id;

    const uploadInfo = await api(`/api/lessons/${lesson.id}/videos/upload-url`, {
      method: "POST",
      body: {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream"
      }
    });
    state.videoId = uploadInfo.video_id;

    const videoUpload = putFile(uploadInfo.upload_url, file, uploadInfo.headers?.["Content-Type"] || file.type || "application/octet-stream", (progress) => {
      state.uploadProgress = progress;
      render();
    });
    const audioUpload = uploadAudioFromVideoFile(file);

    await videoUpload;
    await audioUpload;

    const task = await api(`/api/videos/${state.videoId}/complete-upload`, { method: "POST" });
    state.taskId = task.task_id;
    state.processingStatus = "queued";
    saveSession();
    pollStatus();
  } catch (error) {
    fail(error.message || "上传失败");
  }
}

async function uploadAudioFromVideoFile(file) {
  if (!state.videoId) return;
  try {
    state.audioStatus = "extracting";
    render();
    const audioBlob = await extractWavFromMediaFile(file);
    const uploadInfo = await api(`/api/videos/${state.videoId}/audio-upload-url`, {
      method: "POST",
      body: { mime_type: "audio/wav" }
    });
    state.audioStatus = "uploading";
    render();
    await putFile(uploadInfo.upload_url, audioBlob, uploadInfo.headers?.["Content-Type"] || "audio/wav", (progress) => {
      state.audioProgress = progress;
      render();
    });
    await api(`/api/videos/${state.videoId}/complete-audio-upload`, { method: "POST" });
    state.audioStatus = "uploaded";
    render();
  } catch (error) {
    state.audioStatus = "fallback";
    state.audioError = error.message || "浏览器无法生成音频，worker 会从视频抽取";
    render();
  }
}

async function pollStatus() {
  if (!state.lessonId) return;
  clearTimeout(state.pollTimer);
  try {
    const status = await api(`/api/lessons/${state.lessonId}/status`);
    const task = status.task;
    state.processingStatus = task?.status || "idle";
    state.error = task?.error_message || "";
    if (state.processingStatus === "completed") {
      await loadLesson();
      state.processingStatus = "ready";
      loadLibrary();
    }
    syncStep();
    saveSession();
    render();
    if (["queued", "running"].includes(state.processingStatus)) {
      state.pollTimer = setTimeout(pollStatus, 2500);
    }
  } catch (error) {
    fail(error.message || "无法读取处理状态");
  }
}

async function extractWavFromMediaFile(file) {
  if (!window.AudioContext && !window.webkitAudioContext) {
    throw new Error("当前浏览器不支持本地音频解码");
  }
  if (file.size > 600 * 1024 * 1024) {
    throw new Error("视频较大，改由 worker 从视频抽取音频");
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContextClass();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return encodeWav(decoded, 16000);
  } finally {
    if (audioContext.close) await audioContext.close();
  }
}

function encodeWav(audioBuffer, targetSampleRate) {
  const channelData = mixToMono(audioBuffer);
  const samples = resampleLinear(channelData, audioBuffer.sampleRate, targetSampleRate);
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

function mixToMono(audioBuffer) {
  const length = audioBuffer.length;
  const output = new Float32Array(length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const input = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) output[index] += input[index] / audioBuffer.numberOfChannels;
  }
  return output;
}

function resampleLinear(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

async function loadLesson() {
  const lesson = await api(`/api/lessons/${state.lessonId}`);
  state.sections = (lesson.sections || []).map(normalizeSection);
  state.evidenceCards = lesson.evidence_cards || [];
  state.videoUrl = lesson.playback_url || state.videoUrl;
  state.currentSectionIndex = 0;
}

async function saveCurrentSection() {
  if (!state.dirty) return;
  const section = state.sections[state.currentSectionIndex];
  if (!section?.id) return;
  try {
    const saved = await api(`/api/sections/${section.id}`, {
      method: "PATCH",
      body: { edited_summary_text: el.recordEditor.value }
    });
    state.sections[state.currentSectionIndex] = normalizeSection(saved);
    state.dirty = false;
    el.saveStatus.textContent = "已保存到后端";
  } catch (error) {
    el.saveStatus.textContent = `保存失败：${error.message}`;
  }
}

async function rebuildSections() {
  if (!state.lessonId) return;
  try {
    el.saveStatus.textContent = "正在按最新逐字稿重建分段...";
    const result = await api(`/api/lessons/${state.lessonId}/rebuild-sections`, { method: "POST" });
    state.sections = (result.sections || []).map(normalizeSection);
    state.currentSectionIndex = 0;
    render();
  } catch (error) {
    el.saveStatus.textContent = `重建失败：${error.message}`;
  }
}

function tagCurrentSection(tag) {
  const section = state.sections[state.currentSectionIndex];
  if (!section) return;
  section.tags = Array.from(new Set([...(section.tags || []), tag]));
  el.saveStatus.textContent = `已标记：${tag}`;
  renderSegments();
}

function selectSection(index) {
  if (!state.sections[index]) return;
  state.currentSectionIndex = index;
  state.dirty = false;
  render();
}

function syncStep() {
  if (state.processingStatus === "uploading" || state.processingStatus === "queued" || state.processingStatus === "running") state.step = 2;
  else if (state.processingStatus === "failed") state.step = 2;
  else if (state.sections.length) state.step = 3;
  else if (state.goal) state.step = 1;
  else state.step = 1;
}

async function loadLibrary() {
  try {
    const data = await api("/api/lessons");
    state.library = data.lessons || [];
    state.libraryError = "";
  } catch (error) {
    state.libraryError = error.message || "无法读取视频库";
    state.library = [];
  }
  renderLibrary();
}

async function openLesson(lessonId) {
  const lesson = await api(`/api/lessons/${lessonId}`);
  state.lessonId = lessonId;
  state.videoId = lesson.video?.id || null;
  state.taskId = null;
  state.fileName = lesson.video?.file_name || "";
  state.processingStatus = lesson.lesson?.status === "ready" ? "ready" : lesson.video?.processing_status || lesson.lesson?.status || "idle";
  state.videoUrl = lesson.playback_url;
  state.sections = (lesson.sections || []).map(normalizeSection);
  state.evidenceCards = lesson.evidence_cards || [];
  state.currentSectionIndex = 0;
  state.view = "workspace";
  syncStep();
  saveSession();
  render();
  if (["queued", "running", "processing"].includes(state.processingStatus)) pollStatus();
}

async function deleteLesson(lessonId) {
  if (!confirm("确定删除这条课堂视频和相关记录吗？")) return;
  await api(`/api/lessons/${lessonId}`, { method: "DELETE" });
  if (state.lessonId === lessonId) startNewAnalysis({ stayInLibrary: true });
  await loadLibrary();
}

function startNewAnalysis({ stayInLibrary = false } = {}) {
  localStorage.removeItem("classReflectActiveSession");
  const next = createInitialState();
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, next, { view: stayInLibrary ? "library" : "workspace" });
  render();
}

function showLibrary() {
  state.view = "library";
  render();
  loadLibrary();
}

function render() {
  renderShell();
  renderVideo();
  renderSegments();
  renderRecord();
  renderFlow();
  renderConversation();
}

function renderShell() {
  const view = state.view || (state.lessonId ? "workspace" : "library");
  el.libraryView.hidden = view !== "library";
  el.workspaceView.hidden = view !== "workspace";
}

function renderLibrary() {
  if (!el.lessonList) return;
  if (state.libraryError) {
    el.lessonList.innerHTML = `<div class="empty-library">读取失败：${escapeHtml(state.libraryError)}</div>`;
    return;
  }
  if (!state.library?.length) {
    el.lessonList.innerHTML = `<div class="empty-library">还没有课堂视频。点击“上传新视频”开始第一条复盘。</div>`;
    return;
  }
  el.lessonList.innerHTML = state.library.map((lesson) => `
    <article class="lesson-row">
      <div>
        <strong>${escapeHtml(lesson.lesson_title || "课堂视频复盘")}</strong>
        <p>${escapeHtml(lesson.file_name || "未上传视频")}</p>
        <span>${formatDate(lesson.updated_at || lesson.created_at)} · ${lesson.segment_count || 0} 条逐字稿 · ${lesson.section_count || 0} 个课堂片段</span>
      </div>
      <div class="lesson-status">
        <span class="status-pill">${escapeHtml(statusLabel(lesson))}</span>
        <button class="light-button" type="button" data-open="${lesson.id}">打开</button>
        <button class="danger-button" type="button" data-delete="${lesson.id}">删除</button>
      </div>
    </article>
  `).join("");
  el.lessonList.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openLesson(button.dataset.open));
  });
  el.lessonList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteLesson(button.dataset.delete));
  });
}

function renderVideo() {
  el.videoName.textContent = state.fileName || "上传课堂视频";
  el.uploadEmpty.style.display = state.videoUrl ? "none" : "grid";
  el.classVideo.style.display = state.videoUrl ? "block" : "none";
  if (state.videoUrl && el.classVideo.src !== state.videoUrl) el.classVideo.src = state.videoUrl;
  const section = state.sections[state.currentSectionIndex];
  el.evidenceChip.textContent = section ? `语音证据 ${clock(section.startMs)} - ${clock(section.endMs)}` : `上传进度 ${state.uploadProgress}%`;
}

function renderSegments() {
  el.segmentTabs.innerHTML = "";
  if (!state.sections.length) {
    el.segmentTabs.innerHTML = `<button class="segment-tab active" type="button"><span>等待转写</span><strong>上传后生成课堂记录</strong></button>`;
    return;
  }
  state.sections.forEach((section, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `segment-tab ${index === state.currentSectionIndex ? "active" : ""}`;
    button.innerHTML = `<span>${clock(section.startMs)}-${clock(section.endMs)}</span><strong>${section.title}</strong>`;
    button.addEventListener("click", () => selectSection(index));
    el.segmentTabs.appendChild(button);
  });
}

function renderRecord() {
  const section = state.sections[state.currentSectionIndex];
  el.recordEditor.disabled = !section;
  el.recordEditor.value = section ? section.text : "上传视频并完成语音转文字后，这里会生成带时间轴的大段课堂记录。你只需要编辑有问题的段落，不需要逐句确认。";
  el.saveStatus.textContent = section ? "失焦后保存修改" : "等待处理";
}

function renderFlow() {
  el.flowSteps.innerHTML = FLOW.map((label, index) => {
    const number = index + 1;
    const className = number < state.step ? "done" : number === state.step ? "active" : "";
    return `<li class="${className}"><span>${number < state.step ? "✓" : number}</span>${label}</li>`;
  }).join("");
}

function renderConversation() {
  const cards = [];
  if (!state.goal) cards.push(ai("你想重点复盘什么问题？例如：提问后学生思考时间是否足够。"));
  else cards.push(user(state.goal));

  if (!state.videoId) cards.push(ai("请上传课堂视频。第一版只做语音转文字、时间轴记录和基础报告，不做视频 OCR。"));
  else cards.push(aiStatus());

  if (state.sections.length) {
    cards.push(ai("我已生成大段课堂记录。你可以直接修改整段内容，不需要逐句确认。修改后会保存到后端。"));
    cards.push(processCard("校订原文", `${state.sections.length} 个课堂片段`, "带时间轴，可用于判断语速和长停顿。"));
  }

  if (!state.evidenceCards.length && state.sections.length) {
    cards.push(processCard("基础记录已就绪", "尚未运行真实 AI 教学分析", "下一步应接入 modules/analysis，由 LLM 从大段记录中拆出关键证据段落。"));
  }

  if (state.error) cards.push(processCard("处理失败", state.error, "可以从当前失败步骤重试，不需要重新上传视频。"));
  el.conversation.innerHTML = cards.join("");
}

function ai(text) {
  return `<div class="message ai"><strong>Agent</strong><p>${escapeHtml(text)}</p></div>`;
}

function user(text) {
  return `<div class="message user"><p>${escapeHtml(text)}</p></div>`;
}

function aiStatus() {
  const audioLabel = {
    idle: "",
    preparing: "；音频通道准备中",
    extracting: "；正在本地生成 ASR 音频",
    uploading: `；音频上传 ${state.audioProgress}%`,
    uploaded: "；音频已上传，可优先转写",
    fallback: `；音频通道回退：${state.audioError}`
  }[state.audioStatus] || "";
  const label = {
    uploading: `视频上传中 ${state.uploadProgress}%${audioLabel}`,
    queued: "已入队，等待处理",
    running: "正在抽音频、转写并写入数据库",
    ready: "处理完成",
    failed: "处理失败"
  }[state.processingStatus] || "视频已选择";
  return processCard("处理过程", label, "上传、对象存储、音频抽取、ASR 和写库都是后端真实状态。");
}

function processCard(title, value, note) {
  return `<div class="process-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(value)}</p><span>${escapeHtml(note)}</span></div>`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-teacher-id": TEACHER_ID,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `请求失败 ${response.status}`);
  return data;
}

function putFile(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("无法连接对象存储上传地址")));
    xhr.onerror = () => reject(new Error("无法连接对象存储上传地址"));
    xhr.send(file);
  });
}

function normalizeSection(section) {
  return {
    id: section.id,
    startMs: section.start_ms ?? section.startMs ?? 0,
    endMs: section.end_ms ?? section.endMs ?? 0,
    title: section.title || "课堂片段",
    text: section.edited_summary_text || section.summary_text || section.text || "",
    tags: Array.isArray(section.tags) ? section.tags : []
  };
}

function fail(message) {
  state.processingStatus = "failed";
  state.error = message;
  syncStep();
  saveSession();
  render();
}

function saveSession() {
  localStorage.setItem("classReflectActiveSession", JSON.stringify({
    lessonId: state.lessonId,
    videoId: state.videoId,
    taskId: state.taskId,
    fileName: state.fileName,
    processingStatus: state.processingStatus,
    step: state.step,
    goal: state.goal
  }));
}

function statusLabel(lesson) {
  if (lesson.error_message) return `失败：${lesson.error_message}`;
  if (lesson.processing_status === "completed" || lesson.status === "ready") return "已完成";
  if (lesson.processing_status === "queued" || lesson.status === "processing") return "处理中";
  if (lesson.upload_status === "uploaded") return "已上传";
  return "未完成";
}

function formatDate(value) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function clock(ms) {
  const total = Math.floor(Number(ms || 0) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}
