const uploadEmpty = document.querySelector("#uploadEmpty");
const videoStage = document.querySelector("#videoStage");
const videoInput = document.querySelector("#videoInput");

if (uploadEmpty && videoStage && videoInput) {
  const style = document.createElement("style");
  style.textContent = `
    #uploadEmpty { cursor: pointer; }
    #uploadEmpty:focus-visible {
      outline: 3px solid rgba(31, 138, 87, 0.45);
      outline-offset: -6px;
    }
    #videoStage.is-dragging {
      border: 2px dashed var(--accent, #1f8a57);
    }
    #videoStage.is-dragging #uploadEmpty {
      background: rgba(31, 138, 87, 0.16);
    }
  `;
  document.head.appendChild(style);

  uploadEmpty.addEventListener("click", () => {
    videoInput.click();
  });

  uploadEmpty.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      videoInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    videoStage.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!videoStage.classList.contains("has-video")) {
        videoStage.classList.add("is-dragging");
      }
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    videoStage.addEventListener(eventName, (event) => {
      event.preventDefault();
      videoStage.classList.remove("is-dragging");
    });
  });

  videoStage.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    videoInput.files = transfer.files;
    videoInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
