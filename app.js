/* global firebase */

(() => {
  const LS_USER_ID_KEY = "gigaba_overlay_user_id";
  const layoutKey = (userId) => `layout_${userId}`;
  const profileKey = (userId) => `profile_${userId}`;

  const DEFAULT_LAYOUT = {
    timer: { visible: true, side: "top", scale: 1.0 },
    point: { visible: true, side: "right", scale: 1.0 },
  };

  const DEFAULT_PROFILE = {
    name: "サンプル名",
    color: "#7c5cff",
    iconImage: "",
  };

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function uuidFallback() {
    // RFC4122-ish v4 (fallback). crypto.randomUUID がある環境では使わない。
    const rnd = (n) => Math.floor(Math.random() * n);
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = rnd(16);
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreateUserId() {
    let id = localStorage.getItem(LS_USER_ID_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : uuidFallback();
      localStorage.setItem(LS_USER_ID_KEY, id);
    }
    return id;
  }

  function loadLayout(userId) {
    const raw = localStorage.getItem(layoutKey(userId));
    const parsed = raw ? safeJsonParse(raw, null) : null;
    const merged = {
      timer: { ...DEFAULT_LAYOUT.timer, ...(parsed?.timer || {}) },
      point: { ...DEFAULT_LAYOUT.point, ...(parsed?.point || {}) },
    };
    merged.timer.visible = !!merged.timer.visible;
    merged.point.visible = !!merged.point.visible;
    return merged;
  }

  function saveLayout(userId, layout) {
    localStorage.setItem(layoutKey(userId), JSON.stringify(layout));
  }

  function loadProfile(userId) {
    const raw = localStorage.getItem(profileKey(userId));
    const parsed = raw ? safeJsonParse(raw, null) : null;
    const merged = { ...DEFAULT_PROFILE, ...(parsed || {}) };
    merged.name = (merged.name || "").toString().slice(0, 24) || DEFAULT_PROFILE.name;
    merged.color = (merged.color || "").toString() || DEFAULT_PROFILE.color;
    merged.iconImage = (merged.iconImage || "").toString();
    return merged;
  }

  function saveProfile(userId, profile) {
    localStorage.setItem(profileKey(userId), JSON.stringify(profile));
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  function qsa(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function getParam(name) {
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(sec).padStart(2, "0");
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${mm}:${ss}`;
  }

  function isFirebaseConfigReady() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || typeof cfg !== "object") return false;
    const apiKey = String(cfg.apiKey || "");
    const dbUrl = String(cfg.databaseURL || "");
    if (!apiKey || apiKey.includes("YOUR_")) return false;
    if (!dbUrl || dbUrl.includes("YOUR_")) return false;
    return true;
  }

  function initFirebaseOnce() {
    if (!isFirebaseConfigReady()) return null;
    if (!firebase?.apps?.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    return {
      db: firebase.database(),
      auth: firebase.auth(),
    };
  }

  async function ensureAuthed() {
    const fb = initFirebaseOnce();
    if (!fb) return null;
    const { auth } = fb;
    if (auth.currentUser?.uid) return auth.currentUser;
    try {
      await auth.signInAnonymously();
      return auth.currentUser;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Firebase Authentication（匿名）を有効化してください。Console → Authentication → Sign-in method → Anonymous");
      return null;
    }
  }

  function applyOverlayLayout(itemEl, part) {
    if (!itemEl) return;
    const sideClasses = ["side--top", "side--bottom", "side--left", "side--right"];
    itemEl.classList.remove(...sideClasses);

    const visible = !!part.visible;
    itemEl.classList.toggle("hidden", !visible);
    if (!visible) return;

    const side = ["top", "bottom", "left", "right"].includes(part.side) ? part.side : "top";
    itemEl.classList.add(`side--${side}`);

    const scale = clamp(Number(part.scale || 1), 0.5, 2.0);
    itemEl.style.setProperty("--scale", String(scale));
  }

  function setOverlayAccent(itemEl, color) {
    if (!itemEl) return;
    const box = itemEl.querySelector(".overlayBox");
    if (!box) return;
    box.style.borderColor = color;
  }

  function setOverlayBackgroundImage(itemEl, dataUrl) {
    if (!itemEl) return;
    const box = itemEl.querySelector(".overlayBox");
    if (!box) return;
    const url = (dataUrl || "").toString();
    if (!url) {
      box.style.backgroundImage = "";
      return;
    }
    // Readability overlay + image
    box.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35)), url("${url}")`;
  }

  function copyToClipboard(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      );
    }
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return Promise.resolve(ok);
  }

  async function readClipboardText() {
    if (!navigator.clipboard?.readText) throw new Error("Clipboard readText not available");
    return await navigator.clipboard.readText();
  }

  function dispatchInput(el) {
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function initHome() {
    qs("#createRoomBtn")?.addEventListener("click", async () => {
      const fb = initFirebaseOnce();
      if (!fb) {
        alert("Firebase設定が未入力です。firebaseConfig.js を設定してください。");
        return;
      }
      const authed = await ensureAuthed();
      if (!authed) return;
      const roomId = await createRoom(fb.db, authed.uid);
      location.href = `./room.html?room=${encodeURIComponent(roomId)}`;
    });

    const modal = qs("#joinModal");
    const openBtn = qs("#openJoinModalBtn");
    const closeBtn = qs("#closeJoinModalBtn");
    const input = qs("#joinRoomIdInput");
    const goBtn = qs("#joinGoBtn");
    const pasteBtn = qs("#pasteJoinRoomIdBtn");

    const close = () => {
      modal?.classList.add("hidden");
      modal?.setAttribute("aria-hidden", "true");
    };
    const open = () => {
      modal?.classList.remove("hidden");
      modal?.setAttribute("aria-hidden", "false");
      setTimeout(() => input?.focus(), 0);
    };

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    modal?.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.dataset?.close) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !(modal?.classList.contains("hidden"))) close();
    });

    const nav = () => {
      const roomId = (input?.value || "").trim() || "test";
      if (roomId !== "test" && !/^\d{6}$/.test(roomId)) {
        alert("ルームIDは6桁の数字、または test を入力してください。");
        return;
      }
      location.href = `./overlay.html?room=${encodeURIComponent(roomId)}`;
    };
    goBtn?.addEventListener("click", nav);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nav();
    });

    pasteBtn?.addEventListener("click", async () => {
      try {
        const t = (await readClipboardText()).trim();
        if (!t) return;
        // accept "test" or digits
        if (t.toLowerCase() === "test") {
          input.value = "test";
        } else {
          const digits = t.replace(/\D/g, "").slice(0, 6);
          input.value = digits;
        }
        dispatchInput(input);
      } catch {
        alert("クリップボードの読み取りに失敗しました。ブラウザ設定/HTTPS/localhost を確認し、手動で貼り付けてください。");
      }
    });
  }

  async function createRoom(db, hostId) {
    const roomsRef = db.ref("rooms");
    for (let i = 0; i < 6; i++) {
      const roomId = String(Math.floor(100000 + Math.random() * 900000));
      const roomRef = roomsRef.child(roomId);
      // eslint-disable-next-line no-await-in-loop
      const snap = await roomRef.once("value");
      if (snap.exists()) continue;
      // eslint-disable-next-line no-await-in-loop
      await roomRef.set({
        hostId,
        timer: { duration: 300, startedAt: 0, running: false },
        players: {},
      });
      return roomId;
    }
    // fallback: last try (overwrite is unlikely; better than failing)
    const roomId = String(Math.floor(100000 + Math.random() * 900000));
    await roomsRef.child(roomId).set({
      hostId,
      timer: { duration: 300, startedAt: 0, running: false },
      players: {},
    });
    return roomId;
  }

  function readDurationInput() {
    const v = Number(qs("#durationSec")?.value);
    if (!Number.isFinite(v)) return null;
    if (v < 0) return null;
    return Math.floor(v);
  }

  function computeRemainingSeconds(timer) {
    const duration = Number(timer?.duration || 0);
    const startedAt = Number(timer?.startedAt || 0);
    const running = !!timer?.running;
    if (!running) return duration;
    if (!startedAt) return duration;
    const elapsed = (Date.now() - startedAt) / 1000;
    return clamp(duration - elapsed, 0, duration);
  }

  async function initRoom() {
    const roomId = getParam("room");
    setText(qs("#roomIdView"), roomId || "(missing)");
    if (!roomId) {
      alert("room パラメータがありません。例: room.html?room=123456");
      return;
    }
    if (roomId) {
      const a = qs("#overlayLink");
      if (a) a.href = `./overlay.html?room=${encodeURIComponent(roomId)}`;
    }

    const userId = getOrCreateUserId(); // local UUID (players/{uid})
    const fb = initFirebaseOnce();
    if (!fb) {
      alert("Firebase設定が未入力です。firebaseConfig.js を設定してください。");
      return;
    }

    const authed = await ensureAuthed();
    if (!authed) return;

    const roomRef = fb.db.ref(`rooms/${roomId}`);
    const hostIdSnap = await roomRef.child("hostId").once("value");
    const hostId = hostIdSnap.val();
    const isHost = hostId === authed.uid;
    const warning = qs("#hostWarning");
    warning?.classList.toggle("hidden", isHost);

    const controls = [qs("#timerStartBtn"), qs("#timerStopBtn"), qs("#timerResetBtn"), qs("#durationSec")].filter(Boolean);
    for (const el of controls) el.disabled = !isHost;

    let timerState = { duration: 0, startedAt: 0, running: false };
    roomRef.child("timer").on("value", (snap) => {
      timerState = snap.val() || { duration: 0, startedAt: 0, running: false };
    });

    const playersListEl = qs("#playersList");
    const playersEmptyEl = qs("#playersEmpty");
    roomRef.child("players").on("value", (snap) => {
      const players = snap.val() || {};
      const entries = Object.entries(players);
      if (playersEmptyEl) playersEmptyEl.classList.toggle("hidden", entries.length > 0);
      if (!playersListEl) return;
      playersListEl.innerHTML = "";

      entries
        .sort((a, b) => String(a[1]?.name || "").localeCompare(String(b[1]?.name || "")))
        .forEach(([uid, p]) => {
          const row = document.createElement("div");
          row.className = "playerRow";

          const meta = document.createElement("div");
          meta.className = "playerMeta";

          const icon = document.createElement("div");
          icon.className = "playerIcon";
          icon.textContent = "";
          if (p?.iconImage) {
            icon.style.backgroundImage = `url("${p.iconImage}")`;
          } else {
            icon.style.backgroundImage = "";
            icon.textContent = " ";
          }
          if (p?.color) icon.style.borderColor = p.color;

          const text = document.createElement("div");
          text.style.minWidth = "0";

          const name = document.createElement("div");
          name.className = "playerName";
          name.textContent = p?.name || uid;
          if (p?.color) name.style.color = p.color;

          const score = document.createElement("div");
          score.className = "playerScore mono";
          score.textContent = `${Number(p?.score || 0)}pt`;

          text.appendChild(name);
          text.appendChild(score);

          meta.appendChild(icon);
          meta.appendChild(text);

          const actions = document.createElement("div");
          actions.className = "playerActions";

          const plus = document.createElement("button");
          plus.className = "btn btnIcon";
          plus.textContent = "+";
          plus.disabled = !isHost;
          plus.addEventListener("click", () => {
            roomRef
              .child(`players/${uid}/score`)
              .transaction((cur) => (Number(cur || 0) || 0) + 1);
          });

          const minus = document.createElement("button");
          minus.className = "btn btnIcon";
          minus.textContent = "−";
          minus.disabled = !isHost;
          minus.addEventListener("click", () => {
            roomRef
              .child(`players/${uid}/score`)
              .transaction((cur) => (Number(cur || 0) || 0) - 1);
          });

          actions.appendChild(minus);
          actions.appendChild(plus);

          row.appendChild(meta);
          row.appendChild(actions);
          playersListEl.appendChild(row);
        });
    });

    // Timer controls (host only)
    qs("#timerStartBtn")?.addEventListener("click", async () => {
      if (!isHost) return;
      const input = readDurationInput();
      const duration = input != null ? input : Number(timerState?.duration || 0);
      await roomRef.child("timer").set({
        duration: Math.max(0, Math.floor(duration)),
        startedAt: Date.now(),
        running: true,
      });
    });

    qs("#timerStopBtn")?.addEventListener("click", async () => {
      if (!isHost) return;
      const remaining = Math.ceil(computeRemainingSeconds(timerState));
      await roomRef.child("timer").set({
        duration: Math.max(0, remaining),
        startedAt: 0,
        running: false,
      });
    });

    qs("#timerResetBtn")?.addEventListener("click", async () => {
      if (!isHost) return;
      const input = readDurationInput();
      const duration = input != null ? input : 300;
      await roomRef.child("timer").set({
        duration: Math.max(0, Math.floor(duration)),
        startedAt: 0,
        running: false,
      });
    });

    // Local render loop (no writes)
    const bigEl = qs("#timerBig");
    const tick = () => {
      const remaining = computeRemainingSeconds(timerState);
      setText(bigEl, formatTime(remaining));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function buildOverlayUrl(roomId) {
    const url = new URL("./overlay.html", location.href);
    url.searchParams.set("room", roomId);
    return url.toString();
  }

  function initConfig() {
    const userId = getOrCreateUserId();
    let layout = loadLayout(userId);
    let profile = loadProfile(userId);

    const nameEl = qs("#displayName");
    const colorEl = qs("#displayColor");
    if (nameEl) nameEl.value = profile.name;
    if (colorEl) colorEl.value = profile.color;
    const iconFileEl = qs("#displayIconFile");
    const clearIconBtn = qs("#clearIconBtn");
    const pasteNameBtn = qs("#pasteDisplayNameBtn");

    // Visible radios
    const setRadio = (name, value) => {
      const el = qs(`input[name="${name}"][value="${value}"]`);
      if (el) el.checked = true;
    };
    setRadio("timerVisible", layout.timer.visible ? "on" : "off");
    setRadio("pointVisible", layout.point.visible ? "on" : "off");
    setRadio("timerSide", layout.timer.side);
    setRadio("pointSide", layout.point.side);

    const timerScaleEl = qs("#timerScale");
    const pointScaleEl = qs("#pointScale");
    const timerScaleView = qs("#timerScaleView");
    const pointScaleView = qs("#pointScaleView");
    if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
    if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);

    const sideError = qs("#sideError");
    const saveStatus = qs("#saveStatus");

    const previewTimer = qs("#previewTimer");
    const previewPoint = qs("#previewPoint");
    const previewName = qs("#previewName");
    const previewScore = qs("#previewScore");
    if (previewScore) previewScore.textContent = "100pt";

    // If persisted layout is conflicting, fix it silently.
    if (layout.timer.side === layout.point.side) {
      const all = ["top", "bottom", "left", "right"];
      const alt = all.find((s) => s !== layout.timer.side) || "right";
      layout.point.side = alt;
      setRadio("pointSide", layout.point.side);
    }

    let lastValidTimerSide = layout.timer.side;
    let lastValidPointSide = layout.point.side;

    function enforceSideConstraint(changed) {
      const t = layout.timer.side;
      const p = layout.point.side;
      const conflict = t === p;
      sideError?.classList.toggle("hidden", !conflict);
      if (!conflict) {
        lastValidTimerSide = layout.timer.side;
        lastValidPointSide = layout.point.side;
        return true;
      }

      // revert the one user just changed (to last valid)
      if (changed === "timer") {
        layout.timer.side = lastValidTimerSide;
        setRadio("timerSide", layout.timer.side);
      } else if (changed === "point") {
        layout.point.side = lastValidPointSide;
        setRadio("pointSide", layout.point.side);
      }
      sideError?.classList.remove("hidden");
      return false;
    }

    function disableConflictingSideOptions() {
      const t = layout.timer.side;
      const p = layout.point.side;
      qsa('input[name="timerSide"]').forEach((el) => {
        el.disabled = el.value === p && !el.checked;
      });
      qsa('input[name="pointSide"]').forEach((el) => {
        el.disabled = el.value === t && !el.checked;
      });
    }

    function renderPreview() {
      applyOverlayLayout(previewTimer, layout.timer);
      applyOverlayLayout(previewPoint, layout.point);
      if (previewName) previewName.textContent = profile.name || DEFAULT_PROFILE.name;
      setOverlayAccent(previewPoint, profile.color || DEFAULT_PROFILE.color);
      setOverlayAccent(previewTimer, profile.color || DEFAULT_PROFILE.color);
      setOverlayBackgroundImage(previewPoint, profile.iconImage || "");
      disableConflictingSideOptions();
      if (timerScaleView) timerScaleView.textContent = `scale: ${Number(layout.timer.scale).toFixed(1)}`;
      if (pointScaleView) pointScaleView.textContent = `scale: ${Number(layout.point.scale).toFixed(1)}`;
    }

    // Handlers
    qsa('input[name="timerVisible"]').forEach((el) =>
      el.addEventListener("change", () => {
        layout.timer.visible = el.value === "on";
        renderPreview();
      }),
    );
    qsa('input[name="pointVisible"]').forEach((el) =>
      el.addEventListener("change", () => {
        layout.point.visible = el.value === "on";
        renderPreview();
      }),
    );
    qsa('input[name="timerSide"]').forEach((el) =>
      el.addEventListener("change", () => {
        if (!el.checked) return;
        layout.timer.side = el.value;
        enforceSideConstraint("timer");
        renderPreview();
      }),
    );
    qsa('input[name="pointSide"]').forEach((el) =>
      el.addEventListener("change", () => {
        if (!el.checked) return;
        layout.point.side = el.value;
        enforceSideConstraint("point");
        renderPreview();
      }),
    );

    timerScaleEl?.addEventListener("input", () => {
      layout.timer.scale = clamp(Number(timerScaleEl.value), 0.5, 2.0);
      renderPreview();
    });
    pointScaleEl?.addEventListener("input", () => {
      layout.point.scale = clamp(Number(pointScaleEl.value), 0.5, 2.0);
      renderPreview();
    });

    const onProfileInput = () => {
      profile = {
        name: (nameEl?.value || "").toString().slice(0, 24) || DEFAULT_PROFILE.name,
        color: (colorEl?.value || "").toString() || DEFAULT_PROFILE.color,
        iconImage: (profile.iconImage || "").toString(),
      };
      renderPreview();
    };
    nameEl?.addEventListener("input", onProfileInput);
    colorEl?.addEventListener("input", onProfileInput);

    iconFileEl?.addEventListener("change", () => {
      const f = iconFileEl.files?.[0];
      if (!f) return;
      if (!f.type.startsWith("image/")) {
        alert("画像ファイルを選択してください。");
        iconFileEl.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        profile.iconImage = String(reader.result || "");
        renderPreview();
      };
      reader.readAsDataURL(f);
    });
    clearIconBtn?.addEventListener("click", () => {
      profile.iconImage = "";
      if (iconFileEl) iconFileEl.value = "";
      renderPreview();
    });

    qs("#saveBtn")?.addEventListener("click", () => {
      const ok = layout.timer.side !== layout.point.side;
      sideError?.classList.toggle("hidden", ok);
      if (!ok) return;
      saveLayout(userId, layout);
      saveProfile(userId, profile);
      if (saveStatus) {
        saveStatus.textContent = "保存しました";
        setTimeout(() => {
          if (saveStatus.textContent === "保存しました") saveStatus.textContent = "";
        }, 900);
      }
    });

    qs("#resetBtn")?.addEventListener("click", () => {
      localStorage.removeItem(layoutKey(userId));
      localStorage.removeItem(profileKey(userId));
      layout = loadLayout(userId);
      profile = loadProfile(userId);
      location.reload();
    });

    const roomIdForLinkEl = qs("#roomIdForLink");
    const overlayUrlEl = qs("#overlayUrl");
    const pasteRoomBtn = qs("#pasteRoomIdForLinkBtn");
    const updateOverlayUrl = () => {
      const raw = (roomIdForLinkEl?.value || "test").trim() || "test";
      const url = buildOverlayUrl(raw);
      if (overlayUrlEl) overlayUrlEl.value = url;
    };
    roomIdForLinkEl?.addEventListener("input", updateOverlayUrl);
    updateOverlayUrl();

    pasteNameBtn?.addEventListener("click", async () => {
      try {
        const t = (await readClipboardText()).trim();
        if (!t) return;
        if (nameEl) {
          nameEl.value = t.slice(0, 24);
          dispatchInput(nameEl);
        }
      } catch {
        alert("クリップボードの読み取りに失敗しました。ブラウザ設定/HTTPS/localhost を確認し、手動で貼り付けてください。");
      }
    });

    pasteRoomBtn?.addEventListener("click", async () => {
      try {
        const t = (await readClipboardText()).trim();
        if (!t) return;
        if (!roomIdForLinkEl) return;
        if (t.toLowerCase() === "test") {
          roomIdForLinkEl.value = "test";
        } else {
          roomIdForLinkEl.value = t.replace(/\D/g, "").slice(0, 6);
        }
        dispatchInput(roomIdForLinkEl);
      } catch {
        alert("クリップボードの読み取りに失敗しました。ブラウザ設定/HTTPS/localhost を確認し、手動で貼り付けてください。");
      }
    });

    qs("#copyOverlayLinkBtn")?.addEventListener("click", async () => {
      const url = overlayUrlEl?.value || buildOverlayUrl("test");
      await copyToClipboard(url);
    });

    renderPreview();
  }

  function initOverlay() {
    const userId = getOrCreateUserId();
    const layout = loadLayout(userId);
    const profile = loadProfile(userId);
    const roomId = (getParam("room") || "test").trim();

    const timerEl = qs("#ovTimer");
    const timerValEl = qs("#ovTimerValue");
    const pointEl = qs("#ovPoint");
    const nameEl = qs("#ovName");
    const scoreEl = qs("#ovScore");

    applyOverlayLayout(timerEl, layout.timer);
    applyOverlayLayout(pointEl, layout.point);
    setOverlayAccent(timerEl, profile.color);
    setOverlayAccent(pointEl, profile.color);
    setOverlayBackgroundImage(pointEl, profile.iconImage || "");

    if (nameEl) nameEl.textContent = profile.name || DEFAULT_PROFILE.name;

    let timerState = { duration: 300, startedAt: 0, running: false };
    let playerState = { name: profile.name, score: 100, color: profile.color, iconImage: profile.iconImage };

    const isTest = !roomId || roomId === "test";

    if (!isTest) {
      const fb = initFirebaseOnce();
      if (fb) {
        ensureAuthed().then((authed) => {
          if (!authed) return;
          const roomRef = fb.db.ref(`rooms/${roomId}`);
          const timerRef = roomRef.child("timer");
          const playerRef = roomRef.child(`players/${userId}`);

          timerRef.on("value", (snap) => {
            timerState = snap.val() || timerState;
          });

          playerRef.on("value", (snap) => {
            const v = snap.val();
            if (!v) return;
            playerState = v;
          });

          // upsert player identity (scoreは上書きしない)
          playerRef.once("value").then((snap) => {
            if (!snap.exists()) {
              playerRef.set({
                authUid: authed.uid,
                name: profile.name,
                score: 0,
                color: profile.color,
                iconImage: profile.iconImage || "",
              });
              return;
            }
            playerRef.update({
              authUid: authed.uid,
              name: profile.name,
              color: profile.color,
              iconImage: profile.iconImage || "",
            });
          });
        });
      } else {
        // Firebase未設定でも“表示のみ”は継続（ただしroom同期は不可）
        // console.warn("Firebase config not ready");
      }
    }

    const tick = () => {
      const remaining = computeRemainingSeconds(timerState);
      if (timerValEl) timerValEl.textContent = formatTime(remaining);

      const score = Number(playerState?.score || 0);
      const pname = playerState?.name || profile.name || DEFAULT_PROFILE.name;
      const pcolor = playerState?.color || profile.color || DEFAULT_PROFILE.color;
      const pimg = (playerState?.iconImage || profile.iconImage || "").toString();

      if (nameEl) nameEl.textContent = pname;
      if (scoreEl) scoreEl.textContent = `${score}pt`;
      setOverlayAccent(pointEl, pcolor);
      setOverlayAccent(timerEl, pcolor);
      setOverlayBackgroundImage(pointEl, pimg);

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // レイアウト変更を即反映（別タブでconfig保存した場合など）
    window.addEventListener("storage", (e) => {
      if (e.key !== layoutKey(userId) && e.key !== profileKey(userId)) return;
      const newLayout = loadLayout(userId);
      const newProfile = loadProfile(userId);
      applyOverlayLayout(timerEl, newLayout.timer);
      applyOverlayLayout(pointEl, newLayout.point);
      setOverlayAccent(timerEl, newProfile.color);
      setOverlayAccent(pointEl, newProfile.color);
    });
  }

  function main() {
    const page = document.body?.dataset?.page || "";
    if (page === "home") initHome();
    else if (page === "room") initRoom();
    else if (page === "config") initConfig();
    else if (page === "overlay") initOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();

