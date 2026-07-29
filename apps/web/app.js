const API_BASE = localStorage.getItem("classReflectApiBase") || "";
const TEACHER_ID = localStorage.getItem("classReflectTeacherId") || "demo-teacher";

const FLOW = ["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"];
const state = createInitialState();

const el = {
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
  localStorage.removeItem("classReflectActiveSession");
  Object.assign(state, createInitialState());
  render();
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
    processingStatus: saved?.processingStatus || "idle",
    error: "",
    step: saved?.step || 1,
    goal: saved?.goal || "",
    messages: [],
    sections: [],
    evidenceCards: [],
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
    Object.assign(state, { fileName: file.name, uploadProgress: 0, processingStatus: "uploading", error: "" });
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

    await putFile(uploadInfo.upload_url, file, uploadInfo.headers?.["Content-Type"] || file.type || "application/octet-stream", (progress) => {
      state.uploadProgress = progress;
      render();
    });

    const task = await api(`/api/videos/${state.videoId}/complete-upload`, { method: "POST" });
    state.taskId = task.task_id;
    state.processingStatus = "queued";
    saveSession();
    pollStatus();
  } catch (error) {
    fail(error.message || "上传失败");
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

function render() {
  renderVideo();
  renderSegments();
  renderRecord();
  renderFlow();
  renderConversation();
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
  const label = {
    uploading: `视频上传中 ${state.uploadProgress}%`,
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

function clock(ms) {
  const total = Math.floor(Number(ms || 0) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}
