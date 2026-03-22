/**
 * TabForge - script.js
 */

const STORAGE_KEY = "tabforge_data";

// Default Data Structure
const defaultData = {
  groups: [
    {
      id: generateId(),
      title: "Work",
      memo: "Project tasks...",
      x: 100,
      y: 100,
      isPinned: false,
      links: [{ id: generateId(), title: "GitHub", url: "https://github.com" }],
    },
  ],
  notes: [] // Array of { id, text, color, x, y, width, height }
};

// State
let appData = null;
let currentSortables = [];
let gridSortable = null;
let isSavingLocally = false;

// DOM Elements
const bentoGrid = document.getElementById("bento-grid");

// Modals
const modalAddGroup = document.getElementById("add-group-modal");
const modalAddLink = document.getElementById("add-link-modal");
const modalEditLink = document.getElementById("edit-link-modal");

// Buttons
const btnShowAddGroup = document.getElementById("add-group-btn");
const btnShowAddLink = document.getElementById("add-link-btn");
const btnTidyUp = document.getElementById("tidy-up-btn");
const btnAddNote = document.getElementById("add-note-btn");

const btnCancelGroup = document.getElementById("cancel-group-btn");
const btnSaveGroup = document.getElementById("save-group-btn");

const btnCancelLink = document.getElementById("cancel-link-btn");
const btnSaveLink = document.getElementById("save-link-btn");

const btnCancelEditLink = document.getElementById("cancel-edit-link-btn");
const btnSaveEditLink = document.getElementById("save-edit-link-btn");

// Inputs
const inputGroupTitle = document.getElementById("group-title");
const inputLinkTitle = document.getElementById("link-title");
const inputLinkUrl = document.getElementById("link-url");
const selectLinkGroup = document.getElementById("link-group-select");

const inputEditLinkId = document.getElementById("edit-link-id");
const inputEditLinkGroupId = document.getElementById("edit-link-group-id");
const inputEditLinkTitle = document.getElementById("edit-link-title");
const inputEditLinkUrl = document.getElementById("edit-link-url");

// Utilities
function generateId() {
  return "id_" + Math.random().toString(36).substr(2, 9);
}

function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  }
}

// Data Management
async function loadData() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (result[STORAGE_KEY]) {
          resolve(result[STORAGE_KEY]);
        } else {
          resolve(JSON.parse(JSON.stringify(defaultData)));
        }
      });
    });
  } else {
    // Fallback for local testing without extension APIs
    const localData = localStorage.getItem(STORAGE_KEY);
    const parsed = localData
      ? JSON.parse(localData)
      : JSON.parse(JSON.stringify(defaultData));
    
    // Backup migration
    if (!parsed.notes) parsed.notes = [];
    return parsed;
  }
}

async function saveData() {
  isSavingLocally = true;
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: appData }, () => {
        setTimeout(() => { isSavingLocally = false; }, 300);
        resolve();
      });
    });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    setTimeout(() => { isSavingLocally = false; }, 300);
    return Promise.resolve();
  }
}

// Rendering
function render() {
  bentoGrid.innerHTML = "";

  // Clean up old instances
  currentSortables.forEach((s) => s.destroy());
  currentSortables = [];
  if (gridSortable) {
    gridSortable.destroy();
  }

  appData.groups.forEach((group) => {
    // Default coords for legacy data
    if (group.x === undefined) group.x = 40 + (Math.random() * 50);
    if (group.y === undefined) group.y = 40 + (Math.random() * 50);

    const card = document.createElement("div");
    card.className = "bento-card";
    card.dataset.groupId = group.id;
    card.style.left = `${group.x}px`;
    card.style.top = `${group.y}px`;

    if (group.isPinned) card.classList.add("is-pinned");

    // Header
    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `
      <div class="group-title" title="Double click to edit">${escapeHTML(group.title)}</div>
      <div class="group-actions">
        <button class="pin-group-btn" title="${group.isPinned ? 'Unpin Group' : 'Pin Group'}">
          📌
        </button>
        <button class="delete-group-btn" title="Delete Group">&#10005;</button>
      </div>
    `;

    // Make window draggable
    makeDraggable(card, header, group);

    // Title double click to edit
    const titleEl = header.querySelector(".group-title");
    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "group-title-input";
      input.value = group.title;
      
      const saveTitle = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== group.title) {
          group.title = newTitle;
          titleEl.textContent = newTitle;
          saveData();
        } else {
          titleEl.textContent = group.title;
        }
        input.replaceWith(titleEl);
      };

      input.addEventListener("blur", saveTitle);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
        } else if (e.key === "Escape") {
          input.value = group.title; // revert
          input.blur();
        }
      });

      titleEl.replaceWith(input);
      input.focus();
      input.select();
    });

    const pinBtn = header.querySelector(".pin-group-btn");
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      group.isPinned = !group.isPinned;
      saveData().then(render);
    });

    header.querySelector(".delete-group-btn").addEventListener("click", (e) => {
      e.stopPropagation(); // prevent drag
      if (confirm(`Delete group "${group.title}"?`)) {
        deleteGroup(group.id);
      }
    });

    // Memo
    const memo = document.createElement("textarea");
    memo.className = "group-memo";
    memo.placeholder = "Add a memo...";
    memo.rows = 1;
    memo.value = group.memo || "";
    
    // Auto resize utility
    const autoResize = () => {
      memo.style.height = 'auto'; // Reset to get accurate scrollHeight
      memo.style.height = memo.scrollHeight + 'px';
    };
    
    memo.addEventListener("input", autoResize);
    // Initial size calculation requires it to be in DOM, wait till render finishes:
    setTimeout(autoResize, 0);

    // FIX: Only save if the target is exactly this memo textarea (prevent bubbling issues)
    memo.addEventListener("change", (e) => {
      if (e.target === memo) {
        group.memo = e.target.value;
        saveData();
      }
    });

    // Links List
    const linksList = document.createElement("ul");
    linksList.className = "links-list";
    linksList.dataset.groupId = group.id;

    group.links.forEach((link) => {
      const li = document.createElement("li");
      li.className = "link-item";
      li.dataset.linkId = link.id;
      li.dataset.tooltip = link.title;

      li.innerHTML = `
        <div class="link-actions">
          <button class="action-btn edit-btn" title="Edit Link">✎</button>
          <button class="action-btn delete-btn" title="Delete Link">&#10005;</button>
        </div>
        <img src="${getFaviconUrl(link.url)}" class="link-favicon" alt="" loading="lazy">
        <div class="link-content" data-url="${escapeHTML(link.url)}">
          <span class="link-title">${escapeHTML(link.title)}</span>
        </div>
      `;

      // Custom drag vs click detection for navigation
      let startX = 0, startY = 0, isDragging = false;
      li.addEventListener("mousedown", (e) => {
        if (e.target.closest(".link-actions")) return;
        startX = e.clientX;
        startY = e.clientY;
        isDragging = false;
      });
      li.addEventListener("mousemove", (e) => {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
          isDragging = true;
        }
      });
      li.addEventListener("click", (e) => {
        if (e.target.closest(".link-actions")) return;
        if (!isDragging) {
          window.open(link.url, "_blank");
        }
      });

      li.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteLink(group.id, link.id);
      });

      li.querySelector(".edit-btn").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditLinkModal(group.id, link.id);
      });

      linksList.appendChild(li);
    });

    card.appendChild(header);
    card.appendChild(memo);
    card.appendChild(linksList);

    bentoGrid.appendChild(card);

    // Initialize Sortable for links inside this group
    const sortable = new Sortable(linksList, {
      group: "shared-links", // allows dragging between lists
      animation: 150,
      ghostClass: "sortable-ghost",
      filter: '.delete-link-btn', // Prevent drag only on delete button
      preventOnFilter: false,
      emptyInsertThreshold: 20, // help dropping into empty lists
      onEnd: handleLinkDragEnd,
    });
    currentSortables.push(sortable);
  }); // <-- End of groups.forEach

  // Render Sticky Notes
  if (appData.notes) {
    appData.notes.forEach(note => {
      const noteEl = document.createElement("div");
      noteEl.className = `sticky-note ${note.color}`;
      noteEl.dataset.noteId = note.id;
      noteEl.style.left = `${note.x}px`;
      noteEl.style.top = `${note.y}px`;
      if (note.width) noteEl.style.width = `${note.width}px`;
      if (note.height) noteEl.style.height = `${note.height}px`;

      const header = document.createElement("div");
      header.className = "note-header";
      
      const controls = document.createElement("div");
      controls.className = "note-controls";
      
      // Color picker
      const colors = [
        'note-lemon', 'note-sky', 'note-rose', 'note-mint', 'note-lavender',
        'note-dark-navy', 'note-dark-bordeaux', 'note-dark-moss', 'note-dark-charcoal', 'note-dark-amber'
      ];
      const picker = document.createElement("div");
      picker.className = "color-picker";
      
      colors.forEach(c => {
        const dot = document.createElement("div");
        dot.className = `color-dot ${c}`;
        dot.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(`--${c}`);
        dot.addEventListener("mousedown", (e) => {
          e.stopPropagation(); // prevent drag
          note.color = c;
          noteEl.className = `sticky-note ${note.color}`;
          saveData();
        });
        picker.appendChild(dot);
      });
      
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-group-btn";
      deleteBtn.innerHTML = "&#10005;";
      deleteBtn.style.padding = "0 4px";
      deleteBtn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (confirm("Delete this note?")) {
          appData.notes = appData.notes.filter(n => n.id !== note.id);
          saveData().then(render);
        }
      });

      controls.appendChild(picker);
      controls.appendChild(deleteBtn);
      header.appendChild(controls);

      const textarea = document.createElement("textarea");
      textarea.className = "note-textarea";
      textarea.value = note.text || "";
      textarea.placeholder = "Type your note here...";
      
      textarea.addEventListener("change", (e) => {
        note.text = e.target.value;
        saveData();
      });

      // Save dimensions on resize
      let resizeTimeout;
      new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (noteEl.offsetWidth !== note.width || noteEl.offsetHeight !== note.height) {
            note.width = noteEl.offsetWidth;
            note.height = noteEl.offsetHeight;
            saveData();
          }
        }, 500);
      }).observe(noteEl);

      noteEl.appendChild(header);
      noteEl.appendChild(textarea);
      bentoGrid.appendChild(noteEl);

      makeDraggable(noteEl, header, note);
    });
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );
}

// Drag & Drop Handlers for Links
function handleLinkDragEnd(evt) {
  const itemEl = evt.item;
  const fromGroupId = evt.from.dataset.groupId;
  const toGroupId = evt.to.dataset.groupId;
  const newIndex = evt.newIndex;
  const oldIndex = evt.oldIndex;

  if (fromGroupId === toGroupId && newIndex === oldIndex) return;

  const fromGroup = appData.groups.find((g) => g.id === fromGroupId);
  const toGroup = appData.groups.find((g) => g.id === toGroupId);

  const [movedLink] = fromGroup.links.splice(oldIndex, 1);
  toGroup.links.splice(newIndex, 0, movedLink);

  saveData();
}

// Custom Drag for Groups
function makeDraggable(card, header, group) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.addEventListener("mousedown", dragStart);

  function dragStart(e) {
    if (e.target.closest('.delete-group-btn') || e.target.closest('.pin-group-btn')) return;
    if (group.isPinned || card.classList.contains("is-pinned")) return; // Disable drag if pinned
    
    // Bring to front
    document.querySelectorAll('.bento-card').forEach(c => c.style.zIndex = 1);
    card.style.zIndex = 10;
    
    // Optimization: disable transitions during drag for zero lag
    card.style.transition = 'none';

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = card.offsetLeft;
    initialTop = card.offsetTop;

    document.addEventListener("mousemove", drag, { passive: false });
    document.addEventListener("mouseup", dragEnd);
  }

  function drag(e) {
    if (!isDragging) return;
    if (group.isPinned) { dragEnd(); return; } // Failsafe
    e.preventDefault();
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Boundary logic
    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;
    
    if (newTop < 0) newTop = 0;
    if (newLeft < 0) newLeft = 0;

    // Use transform for hardware accelerated dragging if needed, but left/top is okay without transition
    card.style.left = `${newLeft}px`;
    card.style.top = `${newTop}px`;
  }

  function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", drag);
    document.removeEventListener("mouseup", dragEnd);

    // Restore transition
    card.style.transition = '';

    // Save new pos
    group.x = parseInt(card.style.left, 10);
    group.y = parseInt(card.style.top, 10);
    saveData();
  }
}

// Operations
function deleteGroup(groupId) {
  appData.groups = appData.groups.filter((g) => g.id !== groupId);
  saveData().then(render);
}

function deleteLink(groupId, linkId) {
  const group = appData.groups.find((g) => g.id === groupId);
  if (group) {
    group.links = group.links.filter((l) => l.id !== linkId);
    saveData().then(render);
  }
}

// Modal Logic
function openAddGroupModal() {
  inputGroupTitle.value = "";
  modalAddGroup.classList.remove("hidden");
  setTimeout(() => inputGroupTitle.focus(), 100);
}

function closeAddGroupModal() {
  modalAddGroup.classList.add("hidden");
}

function openAddLinkModal() {
  inputLinkTitle.value = "";
  inputLinkUrl.value = "";

  // Populate custom groups dropdown
  const customSelectDropdown = document.getElementById("custom-link-group-select");
  const selectSelected = customSelectDropdown.querySelector(".select-selected");
  const selectItems = customSelectDropdown.querySelector(".select-items");
  const hiddenGroupInput = document.getElementById("link-group-select");

  selectItems.innerHTML = "";
  if (appData.groups.length === 0) {
    alert("Please create a group first!");
    return;
  }

  // Handle dropdown toggle explicitly inside modal open setup to refresh
  selectSelected.onclick = (e) => {
    e.stopPropagation(); // prevent document listener from immediately closing it
    customSelectDropdown.classList.toggle("active");
    selectItems.classList.toggle("select-hide");
  };

  appData.groups.forEach((g, index) => {
    const item = document.createElement("div");
    item.textContent = g.title;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      hiddenGroupInput.value = g.id;
      selectSelected.innerHTML = `${escapeHTML(g.title)} <span style="font-size:10px;">▼</span>`;
      customSelectDropdown.classList.remove("active");
      selectItems.classList.add("select-hide");
    });
    selectItems.appendChild(item);

    // Default select first group
    if (index === 0) {
      hiddenGroupInput.value = g.id;
      selectSelected.innerHTML = `${escapeHTML(g.title)} <span style="font-size:10px;">▼</span>`;
    }
  });

  modalAddLink.classList.remove("hidden");
  setTimeout(() => inputLinkTitle.focus(), 100);
}

function closeAddLinkModal() {
  modalAddLink.classList.add("hidden");
}

function openEditLinkModal(groupId, linkId) {
  const group = appData.groups.find(g => g.id === groupId);
  if (!group) return;
  const link = group.links.find(l => l.id === linkId);
  if (!link) return;

  inputEditLinkId.value = link.id;
  inputEditLinkGroupId.value = group.id;
  inputEditLinkTitle.value = link.title;
  inputEditLinkUrl.value = link.url;

  modalEditLink.classList.remove("hidden");
  setTimeout(() => inputEditLinkTitle.focus(), 100);
}

function closeEditLinkModal() {
  modalEditLink.classList.add("hidden");
}

// Event Listeners
btnTidyUp.addEventListener("click", () => {
  const allCards = Array.from(bentoGrid.children).filter(el => el.classList.contains('bento-card') || el.classList.contains('sticky-note'));
  if (allCards.length === 0) return;

  const cardsToMove = allCards.filter(c => !c.classList.contains('is-pinned'));
  if (cardsToMove.length === 0) return;

  cardsToMove.forEach(c => c.classList.add('animating'));

  const containerWidth = bentoGrid.clientWidth;
  const cardWidth = 320;
  const gap = 24;
  const cols = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));

  // Combine ONLY unpinned groups and notes for sorting
  let unpinnedItems = [
    ...appData.groups.filter(g => !g.isPinned),
    ...(appData.notes || []) // Notes don't have pinned state yet
  ];
  
  // Sort items based on their current DOM visual positions
  unpinnedItems.sort((a, b) => (a.y * 1000 + a.x) - (b.y * 1000 + b.x));

  const colHeights = new Array(cols).fill(0);

  // Initialize colHeights with pinned items to avoid overlapping them (basic collision avoidance)
  appData.groups.filter(g => g.isPinned).forEach(g => {
    const colIndex = Math.min(cols - 1, Math.max(0, Math.floor((g.x + cardWidth / 2) / (cardWidth + gap))));
    const domCard = bentoGrid.querySelector(`[data-group-id="${g.id}"]`);
    if (domCard) {
      const bottomEdge = g.y + domCard.offsetHeight;
      if (bottomEdge > colHeights[colIndex]) {
        colHeights[colIndex] = bottomEdge + gap;
      }
    }
  });

  unpinnedItems.forEach((item) => {
    let minCol = 0;
    let minH = colHeights[0];
    for (let i = 1; i < cols; i++) {
      if (colHeights[i] < minH) {
        minH = colHeights[i];
        minCol = i;
      }
    }

    const isNote = appData.notes && appData.notes.includes(item);
    const domCard = bentoGrid.querySelector(isNote ? `[data-note-id="${item.id}"]` : `[data-group-id="${item.id}"]`);
    const itemHeight = domCard ? domCard.offsetHeight : (isNote ? 200 : 200);

    // Simplistic wrap logic for tidy up, though width varies
    item.x = minCol * (cardWidth + gap);
    item.y = minH;

    if (domCard) {
      domCard.style.left = `${item.x}px`;
      domCard.style.top = `${item.y}px`;
    }

    colHeights[minCol] += itemHeight + gap;
  });

  saveData();

  setTimeout(() => {
    cardsToMove.forEach(c => c.classList.remove('animating'));
  }, 400);
});

let isPlacementMode = false;

btnAddNote.addEventListener("click", (e) => {
  e.stopPropagation();
  if (isPlacementMode) return;
  isPlacementMode = true;

  document.body.style.cursor = "crosshair";

  const placeNote = (evt) => {
    // Cancel if clicked outside of bento grid area (like header)
    if (evt.target.closest('header') || evt.target.closest('.modal') || evt.target.closest('.bento-card') || evt.target.closest('.sticky-note')) {
      cleanup();
      return;
    }

    evt.preventDefault();

    const rect = bentoGrid.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (!appData.notes) appData.notes = [];
    appData.notes.push({
      id: generateId(),
      text: "",
      color: "note-sky",
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: 200,
      height: 200
    });

    cleanup();
    saveData().then(render);
  };

  const cleanup = () => {
    isPlacementMode = false;
    document.body.style.cursor = "";
    document.removeEventListener("click", placeNote);
  };

  setTimeout(() => {
    document.addEventListener("click", placeNote);
  }, 10);
});

btnShowAddGroup.addEventListener("click", openAddGroupModal);
btnCancelGroup.addEventListener("click", closeAddGroupModal);

btnSaveGroup.addEventListener("click", () => {
  const title = inputGroupTitle.value.trim();
  if (!title) return;

  const newGroup = {
    id: generateId(),
    title,
    memo: "",
    x: 100 + (Math.random() * 50),
    y: 100 + (Math.random() * 50),
    isPinned: false,
    links: [],
  };

  appData.groups.push(newGroup);
  saveData().then(() => {
    closeAddGroupModal();
    render();
  });
});

btnShowAddLink.addEventListener("click", openAddLinkModal);
btnCancelLink.addEventListener("click", closeAddLinkModal);

btnSaveLink.addEventListener("click", () => {
  const title = inputLinkTitle.value.trim();
  const url = inputLinkUrl.value.trim();
  const groupId = selectLinkGroup.value;

  if (!title || !url || !groupId) return;

  // Add http if missing
  let finalUrl = url;
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = "https://" + finalUrl;
  }

  const group = appData.groups.find((g) => g.id === groupId);
  if (group) {
    group.links.push({
      id: generateId(),
      title,
      url: finalUrl,
    });

    saveData().then(() => {
      closeAddLinkModal();
      render();
    });
  }
});

btnCancelEditLink.addEventListener("click", closeEditLinkModal);

btnSaveEditLink.addEventListener("click", () => {
  const groupId = inputEditLinkGroupId.value;
  const linkId = inputEditLinkId.value;
  const title = inputEditLinkTitle.value.trim();
  const url = inputEditLinkUrl.value.trim();

  if (!title || !url) return;

  let finalUrl = url;
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = "https://" + finalUrl;
  }

  const group = appData.groups.find((g) => g.id === groupId);
  if (group) {
    const link = group.links.find((l) => l.id === linkId);
    if (link) {
      link.title = title;
      link.url = finalUrl;
      saveData().then(() => {
        closeEditLinkModal();
        render();
      });
    }
  }
});



// Close modals on background click, and custom selects on body click
document.addEventListener("click", (e) => {
  // Close Custom Selects
  const customSelects = document.querySelectorAll(".custom-select");
  customSelects.forEach((cs) => {
    if (!cs.contains(e.target)) {
      cs.classList.remove("active");
      cs.querySelector(".select-items").classList.add("select-hide");
    }
  });
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) {
      closeAddGroupModal();
      closeAddLinkModal();
      closeEditLinkModal();
    }
  });
});

// Init
async function init() {
  appData = await loadData();
  render();

  // Listen for storage changes from other tabs to sync
  if (
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.onChanged
  ) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area === "sync" &&
        changes[STORAGE_KEY] &&
        changes[STORAGE_KEY].newValue
      ) {
        if (!isSavingLocally) {
          appData = changes[STORAGE_KEY].newValue;
          render();
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
