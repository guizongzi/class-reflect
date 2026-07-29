const sampleSegments = [
  {
    id: "seg-1",
    start: "00:00",
    end: "04:30",
    startSeconds: 0,
    endSeconds: 270,
    title: "导入",
    zh: "教师先回顾上节课分数的意义，用生活中的分蛋糕和分纸条例子引入本节课主题。学生能够跟随教师回忆基本概念，但回答主要集中在少数学生。该段主要用于建立课堂情境。",
    en: "The teacher reviews the meaning of fractions and introduces the lesson through everyday examples.",
    tags: ["已转写"]
  },
  {
    id: "seg-2",
    start: "04:30",
    end: "09:10",
    startSeconds: 270,
    endSeconds: 550,
    title: "概念回顾",
    zh: "教师通过提问复习单位“1”和平均分的关系。学生先回答“平均分”，教师随后追问为什么必须平均分。该段有提问和反馈，但教师等待时间较短。",
    en: "The teacher asks students to explain the relation between the unit one and equal division.",
    tags: ["待复查"]
  },
  {
    id: "seg-3",
    start: "11:20",
    end: "14:50",
    startSeconds: 680,
    endSeconds: 890,
    title: "分数单位讲解",
    zh: "教师通过复习分数的意义引入分数单位的概念。首先展示把 3/5 平均分成 4 份的图示，引导学生观察每份的大小，并提出问题：“每一份是它的几分之几？”学生经过约 2.1 秒后回答。教师进一步说明把单位“1”平均分成若干份，表示其中一份的数叫作分数单位。随后教师举例说明 1/2 的分数单位是 1/2，1/4 的分数单位是 1/4，并继续追问“3/5 的分数单位是什么”。",
    en: "In this segment, the teacher introduces fractional units through a review of fractions. After asking what each part represents, students answer after about 2.1 seconds.",
    tags: ["重点", "待校订"],
    evidence: true
  },
  {
    id: "seg-4",
    start: "14:50",
    end: "20:40",
    startSeconds: 890,
    endSeconds: 1240,
    title: "巩固练习",
    zh: "教师安排学生判断多个分数的分数单位，并请个别学生口头说明理由。学生能给出答案，但对理由的解释不够完整，教师主要通过补充说明完成讲解。",
    en: "Students practice identifying fractional units and explain their reasoning.",
    tags: []
  },
  {
    id: "seg-5",
    start: "20:40",
    end: "28:10",
    startSeconds: 1240,
    endSeconds: 1690,
    title: "拓展应用",
    zh: "教师将分数单位与后续通分、比较大小联系起来，提示学生注意知识之间的关联。课堂最后有简短总结，但学生自我表达时间有限。",
    en: "The teacher connects fractional units with later topics such as common denominators and comparison.",
    tags: []
  }
];

const flowSteps = ["对话发起", "处理过程", "校订原文", "核对证据", "人工复核", "生成报告"];
const processItems = ["视频上传完成", "音频抽取完成", "语音识别完成", "课堂分段完成", "AI分析完成", "报告草稿生成完成"];
const storeKey = "classroom-review-mvp-v2";
const apiBase = localStorage.getItem("classReflectApiBase") || "";

const state = loadState();

const els = {
  videoInput: document.querySelector("#videoInput"),
  videoName: document.querySelector("#videoName"),
  classVideo: document.querySelector("#classVideo"),
  videoStage: document.querySelector("#videoStage"),
  evidenceChip: document.querySelector("#evidenceChip"),
  lessonTitle: document.querySelector("#lessonTitle"),
  segmentTabs: document.querySelector("#segmentTabs"),
  prevSegment: document.querySelector("#prevSegment"),
  nextSegment: document.querySelector("#nextSegment"),
  recordEditor: document.querySelector("#recordEditor"),
  saveStatus: document.querySelector("#saveStatus"),
  conversation: document.querySelector("#conversation"),
  flowSteps: document.querySelector("#flowSteps"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  newAnalysis: document.querySelector("#newAnalysis"),
  editRecord: document.querySelector("#editRecord"),
  markImportant: document.querySelector("#markImportant"),
  markConfusing: document.querySelector("#markConfusing"),
  reanalyzeSegment: document.querySelector("#reanalyzeSegment")
};

function loadState() {
  const fallback = {
    task: "帮我找出课堂提问后学生思考时间不足的片段。",
    videoName: "",
    currentStep: 4,
    selectedSegmentId: "seg-3",
    view: "zh",
    segments: sampleSegments,
    findingStatus: "待复核",
    acceptedCount: 2,
    lastAction: "",
    lessonId: "",
    videoId: "",
    taskId: "",
    uploadProgress: 0,
    backendMode: false
  };

  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(storeKey) || "{}") };
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(storeKey, JSON.stringify({
    task: state.task,
    videoName: state.videoName,
    currentStep: state.currentStep,
    selectedSegmentId: state.selectedSegmentId,
    view: state.view,
    segments: state.segments,
    findingStatus: state.findingStatus,
    acceptedCount: state.acceptedCount,
    lastAction: state.lastAction,
    lessonId: state.lessonId,
    videoId: state.videoId,
    taskId: state.taskId,
    uploadProgress: state.uploadProgress,
    backendMode: state.backendMode
  }));
}

function selectedSegment() {
  return state.segments.find((segment) => segment.id === state.selectedSegmentId) || state.segments[0];
}

function renderFlow() {
  els.flowSteps.innerHTML = "";
  flowSteps.forEach((label, index) => {
    const stepNumber = index + 1;
    const item = document.createElement("li");
    item.className = `flow-step ${stepNumber < state.currentStep ? "done" : ""} ${stepNumber === state.currentStep ? "active" : ""}`;
    item.innerHTML = `
      <span class="step-dot">${stepNumber < state.currentStep ? "✓" : stepNumber}</span>
      <span>${label}</span>
    `;
    item.addEventListener("click", () => {
      if (stepNumber <= Math.max(state.currentStep, 1)) {
        state.currentStep = stepNumber;
        persist();
        renderAll();
      }
    });
    els.flowSteps.appendChild(item);
  });
}

function renderSegments() {
  els.segmentTabs.innerHTML = "";
  state.segments.forEach((segment) => {
    const button = document.createElement("button");
    const tags = [
      segment.evidence ? "has-evidence" : "",
      segment.tags.includes("重点") ? "is-important" : "",
      segment.id === state.selectedSegmentId ? "active" : ""
    ].filter(Boolean).join(" ");
    button.className = `segment-tab ${tags}`;
    button.type = "button";
    button.innerHTML = `<strong>${segment.start}-${segment.end}</strong>${segment.title}`;
    button.addEventListener("click", () => selectSegment(segment.id, true));
    els.segmentTabs.appendChild(button);
  });
}

function renderRecord() {
  const segment = selectedSegment();
  const zh = segment.zh;
  const en = segment.en;
  const text = {
    zh,
    en,
    both: `中文记录：\n${zh}\n\nEnglish original:\n${en}`
  }[state.view];
  els.recordEditor.value = text;
  document.querySelectorAll(".record-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  });
  els.evidenceChip.textContent = `语音证据 ${segment.start} - ${segment.end}`;
  els.videoStage.classList.toggle("has-evidence", Boolean(segment.evidence));
}

function renderVideoMeta() {
  els.videoName.textContent = state.videoName ? "更换视频" : "上传课堂视频";
  if (state.backendMode && state.uploadProgress > 0 && state.uploadProgress < 100) {
    els.lessonTitle.textContent = `正在直传 Cloudflare R2：${state.uploadProgress}%`;
  } else if (state.backendMode && state.uploadProgress === 100) {
    els.lessonTitle.textContent = "视频已进入 Cloudflare R2，后端正在处理";
  } else {
    els.lessonTitle.textContent = state.videoName || "上传课堂视频后开始复盘";
  }
  els.videoStage.classList.toggle("has-video", Boolean(els.classVideo.src));
}

function renderConversation() {
  const status = state.findingStatus;
  const reportText = `已确认 ${state.acceptedCount} 条，将进入报告`;
  els.conversation.innerHTML = `
    ${message("user", state.task, "10:02")}
    ${message("bot", `
      好的，我会基于课堂视频的语音转写查找相关片段。第一版只分析逐字稿，不做视频 OCR 或画面框选。
      <div class="chips">
        ${chip("整节课")}
        ${chip("仅重点片段")}
        ${chip("思考时间 ≤ 3 秒", true)}
        ${chip("只看教师提问")}
      </div>
    `, "10:02")}
    ${message("bot", processCard(), "10:03", true)}
    ${message("bot", "我已整理为 3-5 分钟课堂记录，不需要逐句确认；如有问题可直接编辑整段。", "10:04")}
    ${message("bot", evidenceCard(status), "10:05", true)}
    ${message("bot", reviewCard(status), "10:05", true)}
    ${message("bot", reportCard(reportText), "10:06", true)}
  `;

  bindConversationActions();
}

function message(role, content, time, isHtml = false) {
  const avatar = role === "user" ? `<div class="user-avatar">张</div>` : `<div class="bot-avatar">AI</div>`;
  return `
    <div class="message-row ${role}">
      ${avatar}
      <div class="message-body">
        <span class="message-time">${time}</span>
        <div class="message-bubble">${isHtml ? content : escapeHtml(content)}</div>
      </div>
    </div>
  `;
}

function chip(label, active = false) {
  return `<button class="chip ${active ? "active" : ""}" type="button">${label}</button>`;
}

function processCard() {
  return `
    <div class="embedded-card">
      <strong>处理过程</strong>
      <div class="process-list">
        ${processItems.map((item) => `<div class="process-item"><span class="check-dot">✓</span>${item}</div>`).join("")}
      </div>
    </div>
  `;
}

function evidenceCard(status) {
  const segment = selectedSegment();
  return `
    <div class="embedded-card evidence-card">
      <div class="finding-title">
        <span class="pill danger">证据片段 1/4</span>
        <span class="pill">时间段 ${segment.start}-${segment.end}</span>
        <span class="pill">${status}</span>
      </div>
      <div class="finding-title">
        <strong>提问后学生思考时间不足（≤3秒）</strong>
      </div>
      <div class="quote">
        教师：“每一份是它的几分之几？” 学生约 2.1 秒后回答，低于当前阈值 3 秒。依据来自语音转文字和时间戳。
      </div>
      <div class="finding-actions">
        <button class="finding-button" type="button" data-action="seek">查看依据</button>
        <button class="finding-button" type="button" data-action="condition">修改条件</button>
        <button class="finding-button primary" type="button" data-action="next">下一条证据</button>
      </div>
    </div>
  `;
}

function reviewCard(status) {
  return `
    <div class="embedded-card">
      <strong>是否接受这条发现进入报告？</strong>
      <div class="review-actions" style="margin-top: 12px;">
        <button class="finding-button primary" type="button" data-action="accept">接受</button>
        <button class="finding-button" type="button" data-action="modifyAccept">修改后接受</button>
        <button class="finding-button danger" type="button" data-action="reject">驳回</button>
      </div>
      <p style="color: var(--muted); margin-top: 10px;">当前状态：${status}</p>
    </div>
  `;
}

function reportCard(text) {
  return `
    <div class="embedded-card report-card">
      <strong>${text}</strong>
      <p style="color: var(--muted); margin: 8px 0 12px;">未确认和已驳回内容不会进入报告。</p>
      <button class="finding-button" type="button" data-action="download">预览报告</button>
    </div>
  `;
}

function bindConversationActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function handleAction(action) {
  if (action === "seek") {
    selectSegment("seg-3", true);
    state.currentStep = 4;
    state.lastAction = "已定位到语音证据对应时间点和课堂记录段落。";
  }
  if (action === "condition") {
    state.task = "只看教师提问，并将等待时间不足阈值设为 3 秒。";
    state.lastAction = "已更新分析条件。";
  }
  if (action === "next") {
    state.lastAction = "已切换到下一条证据。";
  }
  if (action === "accept") {
    state.findingStatus = "已接受";
    state.acceptedCount = Math.max(state.acceptedCount, 3);
    state.currentStep = 5;
  }
  if (action === "modifyAccept") {
    state.findingStatus = "已修改";
    state.acceptedCount = Math.max(state.acceptedCount, 3);
    state.currentStep = 5;
    const segment = selectedSegment();
    segment.zh = `${segment.zh}\n\n教师修改：该片段可作为“提问后等待时间偏短”的谨慎证据，建议下次在关键问题后保留 3-5 秒安静思考时间。`;
  }
  if (action === "reject") {
    state.findingStatus = "已驳回";
    state.currentStep = 5;
  }
  if (action === "download") {
    downloadReport();
    return;
  }
  persist();
  renderAll();
}

function selectSegment(id, shouldSeek = false) {
  state.selectedSegmentId = id;
  const segment = selectedSegment();
  if (shouldSeek && els.classVideo.src) {
    els.classVideo.currentTime = segment.startSeconds;
    els.classVideo.play().catch(() => {});
  }
  persist();
  renderAll();
}

function updateCurrentRecord() {
  const segment = selectedSegment();
  if (state.view === "zh") segment.zh = els.recordEditor.value;
  if (state.view === "en") segment.en = els.recordEditor.value;
  if (state.view === "both") {
    segment.zh = els.recordEditor.value.split("English original:")[0].replace("中文记录：", "").trim();
  }
  els.saveStatus.textContent = `已自动保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  persist();
}

async function uploadVideoThroughBackend(file) {
  const lesson = await requestJson("/api/lessons", {
    method: "POST",
    body: JSON.stringify({
      course_title: "五年级数学",
      lesson_title: "分数的意义和分数单位",
      grade: "五年级",
      subject: "数学"
    })
  });

  const upload = await requestJson(`/api/lessons/${lesson.id}/videos/upload-url`, {
    method: "POST",
    body: JSON.stringify({
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream"
    })
  });

  state.backendMode = true;
  state.lessonId = lesson.id;
  state.videoId = upload.video_id;
  state.uploadProgress = 1;
  persist();
  renderAll();

  await putFileWithProgress(upload.upload_url, file, upload.headers || {}, (progress) => {
    state.uploadProgress = progress;
    persist();
    renderVideoMeta();
  });

  const task = await requestJson(`/api/videos/${upload.video_id}/complete-upload`, { method: "POST" });
  state.taskId = task.task_id;
  state.uploadProgress = 100;
  state.currentStep = 2;
  persist();
  renderAll();
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `API 请求失败：${response.status}`);
  }
  return response.json();
}

function putFileWithProgress(url, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 上传失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("无法连接对象存储上传地址"));
    xhr.send(file);
  });
}

function downloadReport() {
  const segment = selectedSegment();
  const content = `# 课堂复盘报告

## 复盘问题
${state.task}

## 已确认发现
- 结论：提问后学生思考时间不足（≤3秒）
- 时间点：${segment.start}-${segment.end}
- 原文依据：教师提出问题后，学生约 2.1 秒后回答。
- 教师复核状态：${state.findingStatus}

## 改进建议
关键问题后建议保留 3-5 秒安静思考时间，再邀请学生回答。

## 产品边界
本报告仅基于语音转文字和时间戳分析，不包含视频 OCR、画面定位或学生注意力判断。`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "课堂复盘报告.md";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function renderAll() {
  renderFlow();
  renderSegments();
  renderRecord();
  renderVideoMeta();
  renderConversation();
}

document.querySelectorAll(".record-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    updateCurrentRecord();
    state.view = tab.dataset.view;
    persist();
    renderAll();
  });
});

els.videoInput.addEventListener("change", () => {
  const file = els.videoInput.files[0];
  if (!file) return;
  state.videoName = file.name;
  els.classVideo.src = URL.createObjectURL(file);
  els.videoStage.classList.add("has-video");
  state.currentStep = Math.max(state.currentStep, 2);
  persist();
  renderAll();
  uploadVideoThroughBackend(file).catch((error) => {
    state.backendMode = false;
    state.uploadProgress = 0;
    els.lessonTitle.textContent = `本地预览模式：${error.message}`;
    persist();
  });
});

els.recordEditor.addEventListener("input", () => {
  window.clearTimeout(els.recordEditor.saveTimer);
  els.recordEditor.saveTimer = window.setTimeout(updateCurrentRecord, 260);
});

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = els.taskInput.value.trim();
  if (!value) return;
  state.task = value;
  state.currentStep = Math.max(state.currentStep, 4);
  els.taskInput.value = "";
  persist();
  renderAll();
});

els.prevSegment.addEventListener("click", () => {
  const index = state.segments.findIndex((segment) => segment.id === state.selectedSegmentId);
  const nextIndex = Math.max(0, index - 1);
  selectSegment(state.segments[nextIndex].id, true);
});

els.nextSegment.addEventListener("click", () => {
  const index = state.segments.findIndex((segment) => segment.id === state.selectedSegmentId);
  const nextIndex = Math.min(state.segments.length - 1, index + 1);
  selectSegment(state.segments[nextIndex].id, true);
});

els.editRecord.addEventListener("click", () => els.recordEditor.focus());
els.markImportant.addEventListener("click", () => {
  const segment = selectedSegment();
  if (!segment.tags.includes("重点")) segment.tags.push("重点");
  persist();
  renderAll();
});
els.markConfusing.addEventListener("click", () => {
  const segment = selectedSegment();
  if (!segment.tags.includes("困惑")) segment.tags.push("困惑");
  persist();
  renderAll();
});
els.reanalyzeSegment.addEventListener("click", () => {
  state.currentStep = 4;
  state.findingStatus = "待复核";
  persist();
  renderAll();
});
els.newAnalysis.addEventListener("click", () => {
  localStorage.removeItem(storeKey);
  Object.assign(state, loadState());
  els.classVideo.removeAttribute("src");
  els.videoStage.classList.remove("has-video");
  renderAll();
});

renderAll();
