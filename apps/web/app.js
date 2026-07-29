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
  saveRecord: document.querySelector("#saveRecord"),
  markImportant: document.querySelector("#markImportant"),
  markConfusing: document.querySelector("#markConfusing"),
  reanalyzeSegment: document.querySelector("#reanalyzeSegment"),
  recordTabs: document.querySelectorAll(".record-tab")
};

render();
bootstrap();

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
el.saveRecord.addEventListener("click", () => saveCurrentSection({ force: true }));
el.newAnalysis.addEventListener("click", () => {
  startNewAnalysis();
});
el.editRecord.addEventListener("click", () => el.recordEditor.focus());
el.markImportant.addEventListener("click", () => tagCurrentSection("重点"));
el.markConfusing.addEventListener("click", () => tagCurrentSection("困惑"));
el.reanalyzeSegment.addEventListener("click", () => rebuildSections());
el.recordTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.recordView = button.dataset.view || "zh";
    state.dirty = false;
    state.lastRenderedSectionId = null;
    render();
  });
});

document.querySelector("#prevSegment").addEventListener("click", () => selectSection(Math.max(0, state.currentSectionIndex - 1)));
document.querySelector("#nextSegment").addEventListener("click", () => selectSection(Math.min(state.sections.length - 1, state.currentSectionIndex + 1)));

async function bootstrap() {
  await loadLibrary();
  if (state.lessonId && state.view === "workspace") {
    try {
      await openLesson(state.lessonId);
    } catch (error) {
      fail(error.message || "无法恢复上次任务");
    }
  }
}

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
    transcriptSegments: [],
    evidenceCards: [],
    report: null,
    analysisStatus: "idle",
    analysisError: "",
    translationStatus: "idle",
    translationError: "",
    recordView: "zh",
    workflowSteps: [],
    resume: null,
    library: [],
    libraryError: "",
    view: saved?.lessonId ? "workspace" : "library",
    currentSectionIndex: 0,
    dirty: false,
    lastRenderedSectionId: null,
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
    const workflow = status.workflow;
    state.processingStatus = task?.status || "idle";
    state.error = task?.error_message || "";
    state.workflowSteps = status.steps || [];
    state.resume = status.resume || null;
    if (workflow?.id) state.workflowRunId = workflow.id;
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
  state.transcriptSegments = lesson.transcript_segments || [];
  state.sections = (lesson.sections || []).map((section) => normalizeSection(section, state.transcriptSegments));
  state.evidenceCards = lesson.evidence_cards || [];
  state.report = null;
  state.videoUrl = lesson.playback_url || state.videoUrl;
  state.currentSectionIndex = 0;
  state.dirty = false;
  state.lastRenderedSectionId = null;
}

async function saveCurrentSection({ force = false } = {}) {
  if (state.recordView !== "zh") {
    if (force) el.saveStatus.textContent = "译文视图仅供查看，请回到原文记录后编辑保存";
    return;
  }
  if (!state.dirty && !force) return;
  const section = state.sections[state.currentSectionIndex];
  if (!section?.id) return;
  try {
    el.saveStatus.textContent = "正在保存...";
    const saved = await api(`/api/sections/${section.id}`, {
      method: "PATCH",
      body: { edited_summary_text: el.recordEditor.value, review_status: "已校订" }
    });
    state.sections[state.currentSectionIndex] = normalizeSection(saved, state.transcriptSegments);
    state.dirty = false;
    state.lastRenderedSectionId = saved.id;
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
    state.sections = (result.sections || []).map((section) => normalizeSection(section, state.transcriptSegments));
    state.currentSectionIndex = 0;
    render();
  } catch (error) {
    el.saveStatus.textContent = `重建失败：${error.message}`;
  }
}

async function tagCurrentSection(tag) {
  const section = state.sections[state.currentSectionIndex];
  if (!section) return;
  const tags = Array.from(new Set([...(section.tags || []), tag]));
  try {
    const saved = await api(`/api/sections/${section.id}`, {
      method: "PATCH",
      body: { tags, review_status: section.reviewStatus || "待校订" }
    });
    state.sections[state.currentSectionIndex] = normalizeSection(saved);
    el.saveStatus.textContent = `已标记：${tag}`;
    renderSegments();
  } catch (error) {
    el.saveStatus.textContent = `标记失败：${error.message}`;
  }
}

async function selectSection(index) {
  if (!state.sections[index]) return;
  await saveCurrentSection();
  state.currentSectionIndex = index;
  state.dirty = false;
  state.lastRenderedSectionId = null;
  render();
}

function syncStep() {
  if (state.processingStatus === "uploading" || state.processingStatus === "queued" || state.processingStatus === "running") state.step = 2;
  else if (state.processingStatus === "failed") state.step = 2;
  else if (state.report) state.step = 6;
  else if (state.evidenceCards.some((card) => ["已接受", "已修改"].includes(card.review_status))) state.step = 5;
  else if (state.evidenceCards.length) state.step = 4;
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
  const status = await api(`/api/lessons/${lessonId}/status`);
  state.lessonId = lessonId;
  state.videoId = lesson.video?.id || null;
  state.taskId = null;
  state.fileName = lesson.video?.file_name || "";
  state.processingStatus = status.task?.status || (lesson.lesson?.status === "ready" ? "ready" : lesson.video?.processing_status || lesson.lesson?.status || "idle");
  if (state.processingStatus === "completed") state.processingStatus = "ready";
  state.error = status.task?.error_message || lesson.video?.error_message || "";
  state.workflowSteps = status.steps || [];
  state.resume = status.resume || null;
  state.videoUrl = lesson.playback_url;
  state.transcriptSegments = lesson.transcript_segments || [];
  state.sections = (lesson.sections || []).map((section) => normalizeSection(section, state.transcriptSegments));
  state.evidenceCards = lesson.evidence_cards || [];
  state.report = null;
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
  if (!section) {
    el.recordEditor.readOnly = false;
    el.recordEditor.value = "上传视频并完成语音转文字后，这里会生成带时间轴的大段课堂记录。你只需要编辑有问题的段落，不需要逐句确认。";
    el.saveStatus.textContent = "等待处理";
    state.lastRenderedSectionId = null;
    return;
  }
  if (!state.dirty || state.lastRenderedSectionId !== section.id) {
    el.recordEditor.value = sectionTextForView(section, state.recordView);
    state.lastRenderedSectionId = section.id;
  }
  el.recordTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.recordView);
  });
  const editable = state.recordView === "zh";
  el.recordEditor.readOnly = !editable;
  el.saveStatus.textContent = state.dirty
    ? "有未保存修改"
    : editable ? `${section.reviewStatus || "待校订"} · 可整段编辑后保存` : "译文视图暂不直接编辑";
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
    cards.push(translationCard());
  }

  if (!state.evidenceCards.length && state.sections.length) {
    const run = `<button class="primary-button inline-action" type="button" data-run-analysis>开始多 Agent 分析</button>`;
    const note = state.analysisStatus === "running"
      ? "事实观察 Agent、证据分析 Agent、改进建议 Agent 正在协作生成候选证据卡。"
      : `将从已校订大段记录中拆出关键证据段落。${run}`;
    cards.push(processCard("基础记录已就绪", state.analysisStatus === "running" ? "正在运行多 Agent 分析" : "尚未运行真实 AI 教学分析", note, { htmlNote: true }));
  }

  if (state.evidenceCards.length) {
    cards.push(ai("我已生成候选证据卡。请逐条接受、修改或驳回；只有已接受/已修改的内容会进入报告。"));
    cards.push(...state.evidenceCards.map(renderEvidenceCard));
    const acceptedCount = state.evidenceCards.filter((card) => ["已接受", "已修改"].includes(card.review_status)).length;
    cards.push(processCard("生成教学报告", `${acceptedCount} 条已确认`, `<button class="primary-button inline-action" type="button" data-generate-report>${state.report ? "重新生成报告" : "生成报告"}</button>${state.report ? `<small class="report-ready">报告已生成，报告文件已保存到对象存储。</small>` : ""}`, { htmlNote: true }));
  }

  if (state.report?.markdown_content) {
    cards.push(processCard("报告预览", "已生成教学报告", `<pre class="report-preview">${escapeHtml(state.report.markdown_content)}</pre>`, { htmlNote: true }));
  }

  if (state.analysisError) {
    cards.push(processCard("AI 分析失败", state.analysisError, "请确认 LLM 配置有效，或调整复盘问题后重试。"));
  }

  if (state.error) cards.push(processCard("处理失败", state.error, "可以从当前失败步骤重试，不需要重新上传视频。"));
  el.conversation.innerHTML = cards.join("");
  el.conversation.querySelectorAll("[data-retry-video]").forEach((button) => {
    button.addEventListener("click", () => retryProcessing());
  });
  el.conversation.querySelectorAll("[data-run-analysis]").forEach((button) => {
    button.addEventListener("click", () => runAnalysis());
  });
  el.conversation.querySelectorAll("[data-translate-lesson]").forEach((button) => {
    button.addEventListener("click", () => translateLesson());
  });
  el.conversation.querySelectorAll("[data-review-card]").forEach((button) => {
    button.addEventListener("click", () => reviewEvidence(button.dataset.reviewCard, button.dataset.reviewStatus));
  });
  el.conversation.querySelectorAll("[data-generate-report]").forEach((button) => {
    button.addEventListener("click", () => generateReport());
  });
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
  const steps = renderBackendSteps();
  const retry = state.resume?.can_retry && state.videoId
    ? `<button class="primary-button inline-action" type="button" data-retry-video="${state.videoId}">${escapeHtml(state.resume.retry_label || "继续处理")}</button>`
    : "";
  return processCard("处理过程", label, `上传、对象存储、音频抽取、ASR 和写库都是后端真实状态。${steps}${retry}`, { htmlNote: true });
}

function processCard(title, value, note, options = {}) {
  return `<div class="process-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(value)}</p><div class="process-note">${options.htmlNote ? note : escapeHtml(note)}</div></div>`;
}

function renderEvidenceCard(card) {
  const conclusion = card.edited_conclusion || card.conclusion;
  const status = card.review_status || "待复核";
  return `
    <div class="evidence-card">
      <div class="evidence-card-head">
        <strong>${escapeHtml(card.evidence_type || "证据")}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <p>${escapeHtml(conclusion)}</p>
      <blockquote>${escapeHtml(card.quote_text || "暂无原文引用")}</blockquote>
      <small>${clock(card.start_ms)}-${clock(card.end_ms)} · ${escapeHtml(card.confidence_label || "需要复核")}</small>
      ${card.suggestion ? `<div class="suggestion">${escapeHtml(card.suggestion)}</div>` : ""}
      <div class="card-actions">
        <button class="light-button" type="button" data-review-card="${card.id}" data-review-status="已接受">接受</button>
        <button class="light-button" type="button" data-review-card="${card.id}" data-review-status="已修改">修改后接受</button>
        <button class="danger-button" type="button" data-review-card="${card.id}" data-review-status="已驳回">驳回</button>
      </div>
    </div>
  `;
}

function translationCard() {
  const translatedCount = state.transcriptSegments.filter((segment) => segment.translated_text).length;
  const totalCount = state.transcriptSegments.length;
  const hasTranslations = translatedCount > 0;
  const label = state.translationStatus === "running"
    ? "正在生成中文翻译"
    : hasTranslations ? `已翻译 ${translatedCount}/${totalCount} 条` : "未生成中文翻译";
  const actionLabel = hasTranslations ? "补全/重新生成翻译" : "生成中文翻译";
  const error = state.translationError ? `<small class="error-text">${escapeHtml(state.translationError)}</small>` : "";
  const button = state.translationStatus === "running"
    ? ""
    : `<button class="primary-button inline-action" type="button" data-translate-lesson>${actionLabel}</button>`;
  return processCard("中文翻译", label, `英文或双语课堂需要时再生成；中文课可以不翻译。${button}${error}`, { htmlNote: true });
}

function renderBackendSteps() {
  if (!state.workflowSteps?.length) return "";
  return `<ol class="backend-steps">${state.workflowSteps.map((step) => `
    <li class="${escapeHtml(step.status)}">
      <b>${escapeHtml(step.label || step.key)}</b>
      <em>${escapeHtml(stepStatusLabel(step.status))}</em>
      ${step.error_message ? `<small>${escapeHtml(step.error_message)}</small>` : ""}
    </li>
  `).join("")}</ol>`;
}

async function retryProcessing() {
  if (!state.videoId) return;
  try {
    state.error = "";
    state.processingStatus = "queued";
    render();
    const task = await api(`/api/videos/${state.videoId}/retry-processing`, { method: "POST" });
    state.taskId = task.task_id;
    state.processingStatus = task.status || "queued";
    saveSession();
    pollStatus();
  } catch (error) {
    fail(error.message || "继续处理失败");
  }
}

async function translateLesson() {
  if (!state.lessonId) return;
  try {
    state.translationStatus = "running";
    state.translationError = "";
    render();
    await api(`/api/lessons/${state.lessonId}/translate`, {
      method: "POST",
      body: { force: false }
    });
    await loadLesson();
    state.translationStatus = "completed";
    state.recordView = "both";
    render();
  } catch (error) {
    state.translationStatus = "failed";
    state.translationError = error.message || "翻译失败";
    render();
  }
}

async function runAnalysis() {
  if (!state.lessonId) return;
  try {
    state.analysisStatus = "running";
    state.analysisError = "";
    render();
    const result = await api(`/api/lessons/${state.lessonId}/analyze`, {
      method: "POST",
      body: { goal: state.goal }
    });
    state.evidenceCards = result.evidence_cards || [];
    state.analysisStatus = "completed";
    syncStep();
    render();
  } catch (error) {
    state.analysisStatus = "failed";
    state.analysisError = error.message || "AI 分析失败";
    render();
  }
}

async function reviewEvidence(cardId, reviewStatus) {
  if (!cardId) return;
  try {
    const saved = await api(`/api/evidence-cards/${cardId}/review`, {
      method: "PATCH",
      body: { review_status: reviewStatus }
    });
    state.evidenceCards = state.evidenceCards.map((card) => card.id === cardId ? saved : card);
    syncStep();
    render();
  } catch (error) {
    state.analysisError = error.message || "复核保存失败";
    render();
  }
}

async function generateReport() {
  if (!state.lessonId) return;
  try {
    const report = await api(`/api/lessons/${state.lessonId}/reports`, { method: "POST" });
    state.report = report;
    syncStep();
    render();
  } catch (error) {
    state.analysisError = error.message || "报告生成失败";
    render();
  }
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

function normalizeSection(section, transcriptSegments = []) {
  const segments = transcriptSegments.filter((segment) =>
    Number(segment.start_ms) >= Number(section.start_ms) &&
    Number(segment.end_ms) <= Number(section.end_ms)
  );
  return {
    id: section.id,
    startMs: section.start_ms ?? section.startMs ?? 0,
    endMs: section.end_ms ?? section.endMs ?? 0,
    title: section.title || "课堂片段",
    text: section.edited_summary_text || section.summary_text || section.text || "",
    translatedText: formatTranslatedSegments(segments),
    bilingualText: formatBilingualSegments(segments),
    tags: Array.isArray(section.tags) ? section.tags : [],
    reviewStatus: section.review_status || "待校订"
  };
}

function sectionTextForView(section, view) {
  if (view === "en") return section.translatedText || "还没有生成中文翻译。";
  if (view === "both") return section.bilingualText || section.translatedText || section.text;
  return section.text;
}

function formatTranslatedSegments(segments) {
  return segments
    .filter((segment) => segment.translated_text)
    .map((segment) => `${clock(segment.start_ms)}-${clock(segment.end_ms)} ${segment.speaker_label || "未知"}：${segment.translated_text}`)
    .join("\n");
}

function formatBilingualSegments(segments) {
  return segments
    .map((segment) => {
      const original = `${clock(segment.start_ms)}-${clock(segment.end_ms)} ${segment.speaker_label || "未知"}：${segment.original_text || ""}`;
      const translated = segment.translated_text ? `中文：${segment.translated_text}` : "中文：未生成";
      return `${original}\n${translated}`;
    })
    .join("\n\n");
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
  if (lesson.workflow_status === "failed") return `失败：${lesson.workflow_error_message || lesson.error_message || "处理失败"}`;
  if (lesson.workflow_status === "running") return `处理中：${stepStatusName(lesson.workflow_current_step)}`;
  if (lesson.error_message) return `失败：${lesson.error_message}`;
  if (lesson.processing_status === "completed" || lesson.status === "ready") return "已完成";
  if (lesson.processing_status === "queued" || lesson.status === "processing") return "处理中";
  if (lesson.upload_status === "uploaded") return "已上传";
  return "未完成";
}

function stepStatusLabel(status) {
  return {
    waiting: "等待",
    queued: "排队",
    running: "进行中",
    completed: "完成",
    failed: "失败"
  }[status] || status || "等待";
}

function stepStatusName(key) {
  return {
    verify_upload: "校验上传",
    download_video: "读取视频",
    extract_audio: "抽取音频",
    upload_audio: "保存音频",
    asr: "语音转文字",
    build_sections: "生成大段记录",
    write_transcript: "写入数据库",
    completed: "完成"
  }[key] || "处理";
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
