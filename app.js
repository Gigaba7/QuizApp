/* global firebase */

(() => {
  const LS_USER_ID_KEY = "gigaba_overlay_user_id";
  const layoutKey = (userId) => `layout_${userId}`;
  const profileKey = (userId) => `profile_${userId}`;

  const DEFAULT_LAYOUT = {
    timer: { visible: true, side: "top", scale: 1.0 },
    point: { visible: true, side: "right", scale: 1.0, twoLine: false },
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
    merged.point.twoLine = !!merged.point.twoLine;
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

  function createOverlayAccessToken(mode) {
    const token = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : uuidFallback()).replace(/-/g, "");
    const key = `overlay_access_${token}`;
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), mode: mode || "open" }));
    return token;
  }

  function consumeOverlayAccessToken(token) {
    if (!token) return null;
    const key = `overlay_access_${token}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    localStorage.removeItem(key); // one-time
    const data = safeJsonParse(raw, null);
    const ts = Number(data?.ts || 0);
    const mode = String(data?.mode || "open");
    if (!ts) return null;
    if (Date.now() - ts > 2 * 60 * 1000) return null; // TTL 2 min
    return { mode };
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

  function nowMs() {
    return Date.now();
  }

  function serverTimestamp() {
    return firebase?.database?.ServerValue?.TIMESTAMP || nowMs();
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
      sessionStorage.setItem("last_room", roomId);
      const t = createOverlayAccessToken("join");
      location.href = `./overlay.html?room=${encodeURIComponent(roomId)}&access=${encodeURIComponent(t)}`;
    };
    goBtn?.addEventListener("click", nav);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nav();
    });

    // Display settings (moved here)
    initDisplaySettingsOnHome();

    // Best-effort cleanup of stale rooms (runs once on home load; no per-second writes)
    // If auth/config isn't ready, skip silently.
    try {
      const fb = initFirebaseOnce();
      if (fb) {
        const authed = await ensureAuthed();
        if (authed) cleanupStaleRooms(fb.db);
      }
    } catch {
      // ignore
    }
  }

  async function cleanupStaleRooms(db) {
    const roomsRef = db.ref("rooms");
    const now = nowMs();
    const hardTtl = 24 * 60 * 60 * 1000; // 24h
    const emptyTtl = 6 * 60 * 60 * 1000; // 6h

    // 1) Hard TTL delete by lastActiveAt
    const cutoffHard = now - hardTtl;
    const snapHard = await roomsRef.orderByChild("lastActiveAt").endAt(cutoffHard).limitToFirst(200).once("value");
    const hard = snapHard.val() || {};
    await Promise.all(
      Object.entries(hard).map(([roomId]) => roomsRef.child(roomId).remove()),
    );

    // 2) Empty+inactive delete: older than emptyTtl AND no players AND timer not running
    const cutoffEmpty = now - emptyTtl;
    const snapMaybe = await roomsRef.orderByChild("lastActiveAt").endAt(cutoffEmpty).limitToFirst(200).once("value");
    const maybe = snapMaybe.val() || {};
    const deletions = [];
    for (const [roomId, room] of Object.entries(maybe)) {
      const players = room?.players || {};
      const hasPlayers = Object.keys(players).length > 0;
      const running = !!room?.timer?.running;
      if (!hasPlayers && !running) deletions.push(roomsRef.child(roomId).remove());
    }
    await Promise.all(deletions);
  }

  function initDisplaySettingsOnHome() {
    const userId = getOrCreateUserId();
    let layout = loadLayout(userId);
    let profile = loadProfile(userId);

    const nameEl = qs("#dsDisplayName");
    const paletteEl = qs("#dsColorPalette");
    const imgEl = qs("#dsImage");
    const clearImgBtn = qs("#dsClearImageBtn");

    const timerScaleEl = qs("#dsTimerScale");
    const pointScaleEl = qs("#dsPointScale");
    const pointTwoLineEl = qs("#dsPointTwoLine");

    const resetBtn = qs("#dsResetBtn");
    const sideError = qs("#dsSideError");

    const testCountEl = qs("#dsTestUserCount");
    const openTestBtn = qs("#dsOpenTestBtn");

    const setRadio = (name, value) => {
      const el = qs(`input[name="${name}"][value="${value}"]`);
      if (el) el.checked = true;
    };

    // init UI
    if (nameEl) nameEl.value = profile.name || DEFAULT_PROFILE.name;
    if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
    if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);
    if (pointTwoLineEl) pointTwoLineEl.checked = !!layout.point.twoLine;

    setRadio("dsTimerVisible", layout.timer.visible ? "on" : "off");
    setRadio("dsPointVisible", layout.point.visible ? "on" : "off");
    setRadio("dsTimerSide", layout.timer.side);
    setRadio("dsPointSide", layout.point.side);

    // test user count
    let testUserCount = Number(localStorage.getItem("test_user_count") || "3") || 3;
    testUserCount = clamp(testUserCount, 1, 12);
    if (testCountEl) testCountEl.value = String(testUserCount);

    function enforceSideConstraint(changed) {
      const conflict = layout.timer.side === layout.point.side;
      sideError?.classList.toggle("hidden", !conflict);
      if (!conflict) return true;
      const all = ["top", "bottom", "left", "right"];
      if (changed === "timer") {
        const alt = all.find((s) => s !== layout.point.side) || "top";
        layout.timer.side = alt;
        setRadio("dsTimerSide", layout.timer.side);
      } else if (changed === "point") {
        const alt = all.find((s) => s !== layout.timer.side) || "right";
        layout.point.side = alt;
        setRadio("dsPointSide", layout.point.side);
      }
      sideError?.classList.remove("hidden");
      return false;
    }

    function disableConflictingSideOptions() {
      const t = layout.timer.side;
      const p = layout.point.side;
      qsa('input[name="dsTimerSide"]').forEach((el) => {
        el.disabled = el.value === p && !el.checked;
      });
      qsa('input[name="dsPointSide"]').forEach((el) => {
        el.disabled = el.value === t && !el.checked;
      });
    }

    function saveAll() {
      saveLayout(userId, layout);
      saveProfile(userId, profile);
      disableConflictingSideOptions();
    }

    nameEl?.addEventListener("input", () => {
      profile.name = (nameEl.value || "").toString().slice(0, 24) || DEFAULT_PROFILE.name;
      saveProfile(userId, profile);
    });

    function renderPaletteSelected() {
      if (!paletteEl) return;
      const cur = (profile.color || DEFAULT_PROFILE.color).toLowerCase();
      paletteEl.querySelectorAll(".colorSwatch").forEach((btn) => {
        const c = String(btn.getAttribute("data-color") || "").toLowerCase();
        btn.classList.toggle("is-selected", !!c && c === cur);
        if (c) btn.style.background = c;
      });
    }

    paletteEl?.addEventListener("click", (e) => {
      const t = e.target;
      if (!t?.classList?.contains("colorSwatch")) return;
      const c = String(t.getAttribute("data-color") || "");
      if (!c) return;
      profile.color = c;
      renderPaletteSelected();
      saveProfile(userId, profile);
    });

    imgEl?.addEventListener("change", () => {
      const f = imgEl.files?.[0];
      if (!f) return;
      if (!f.type.startsWith("image/")) {
        alert("画像ファイルを選択してください。");
        imgEl.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        profile.iconImage = String(reader.result || "");
        saveProfile(userId, profile);
      };
      reader.readAsDataURL(f);
    });
    clearImgBtn?.addEventListener("click", () => {
      profile.iconImage = "";
      if (imgEl) imgEl.value = "";
      saveProfile(userId, profile);
    });

    qsa('input[name="dsTimerVisible"]').forEach((el) =>
      el.addEventListener("change", () => {
        layout.timer.visible = el.value === "on";
        saveLayout(userId, layout);
      }),
    );
    qsa('input[name="dsPointVisible"]').forEach((el) =>
      el.addEventListener("change", () => {
        layout.point.visible = el.value === "on";
        saveLayout(userId, layout);
      }),
    );
    qsa('input[name="dsTimerSide"]').forEach((el) =>
      el.addEventListener("change", () => {
        if (!el.checked) return;
        layout.timer.side = el.value;
        enforceSideConstraint("timer");
        disableConflictingSideOptions();
        saveLayout(userId, layout);
      }),
    );
    qsa('input[name="dsPointSide"]').forEach((el) =>
      el.addEventListener("change", () => {
        if (!el.checked) return;
        layout.point.side = el.value;
        enforceSideConstraint("point");
        disableConflictingSideOptions();
        saveLayout(userId, layout);
      }),
    );

    timerScaleEl?.addEventListener("input", () => {
      layout.timer.scale = clamp(Number(timerScaleEl.value), 0.5, 2.0);
      saveLayout(userId, layout);
    });
    pointScaleEl?.addEventListener("input", () => {
      layout.point.scale = clamp(Number(pointScaleEl.value), 0.5, 2.0);
      saveLayout(userId, layout);
    });

    pointTwoLineEl?.addEventListener("change", () => {
      layout.point.twoLine = !!pointTwoLineEl.checked;
      saveLayout(userId, layout);
    });

    testCountEl?.addEventListener("input", () => {
      testUserCount = clamp(Number(testCountEl.value || 1), 1, 12);
      localStorage.setItem("test_user_count", String(testUserCount));
    });

    openTestBtn?.addEventListener("click", () => {
      sessionStorage.setItem("last_room", "test");
      const t = createOverlayAccessToken("open");
      window.open(`./overlay.html?room=test&access=${encodeURIComponent(t)}`, "_blank", "noreferrer");
    });

    resetBtn?.addEventListener("click", () => {
      localStorage.removeItem(layoutKey(userId));
      localStorage.removeItem(profileKey(userId));
      location.reload();
    });

    disableConflictingSideOptions();
    renderPaletteSelected();

    // ensure persisted (auto-save) baseline
    saveAll();
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
        flags: { hostPointVisible: true },
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        timer: { duration: 300, startedAt: 0, running: false },
        players: {},
      });
      return roomId;
    }
    // fallback: last try (overwrite is unlikely; better than failing)
    const roomId = String(Math.floor(100000 + Math.random() * 900000));
    await roomsRef.child(roomId).set({
      hostId,
      flags: { hostPointVisible: true },
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
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
    roomRef.child("lastActiveAt").set(serverTimestamp());
    const hostIdSnap = await roomRef.child("hostId").once("value");
    const hostId = hostIdSnap.val();
    const isHost = hostId === authed.uid;
    const warning = qs("#hostWarning");
    warning?.classList.toggle("hidden", isHost);

    const controls = [qs("#timerStartBtn"), qs("#timerStopBtn"), qs("#timerResetBtn"), qs("#durationSec")].filter(Boolean);
    for (const el of controls) el.disabled = !isHost;

    // Host display settings modal (local layout + profile; profile is synced to Firebase players/{uid})
    const openSettingsBtn = qs("#roomOpenSettingsBtn");
    openSettingsBtn?.toggleAttribute("disabled", !isHost);
    const modal = qs("#roomAdjustModal");
    const closeBtn = qs("#roomAdjustCloseBtn");
    const openModal = () => {
      if (!isHost) return;
      modal?.classList.remove("hidden");
      modal?.setAttribute("aria-hidden", "false");
      setTimeout(() => qs("#rmDsDisplayName")?.focus(), 0);
    };
    const closeModal = () => {
      modal?.classList.add("hidden");
      modal?.setAttribute("aria-hidden", "true");
    };
    openSettingsBtn?.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.dataset?.close) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !(modal?.classList.contains("hidden"))) closeModal();
    });

    // Ensure host has a player entry (so host point can be shown/hidden and profile sync works)
    let hostProfile = loadProfile(userId);
    const hostPlayerRef = roomRef.child(`players/${userId}`);
    hostPlayerRef.once("value").then((snap) => {
      if (!snap.exists()) {
        hostPlayerRef.set({
          authUid: authed.uid,
          name: hostProfile.name,
          score: 0,
          color: hostProfile.color,
          iconImage: hostProfile.iconImage || "",
          joinedAt: serverTimestamp(),
          order: serverTimestamp(),
        });
        return;
      }
      hostPlayerRef.update({
        authUid: authed.uid,
        name: hostProfile.name,
        color: hostProfile.color,
        iconImage: hostProfile.iconImage || "",
      });
    });

    const syncHostProfile = () => {
      hostProfile = loadProfile(userId);
      hostPlayerRef.update({
        authUid: authed.uid,
        name: hostProfile.name,
        color: hostProfile.color,
        iconImage: hostProfile.iconImage || "",
      });
      roomRef.child("lastActiveAt").set(serverTimestamp());
    };

    const initHostSettingsControls = () => {
      const nameEl = qs("#rmDsDisplayName");
      const paletteEl = qs("#rmDsColorPalette");
      const imgEl = qs("#rmDsImage");
      const clearImgBtn = qs("#rmDsClearImageBtn");
      const sideError = qs("#rmDsSideError");
      const resetBtn = qs("#rmDsResetBtn");
      const timerScaleEl = qs("#rmDsTimerScale");
      const pointScaleEl = qs("#rmDsPointScale");
      const pointTwoLineEl = qs("#rmDsPointTwoLine");

      let layout = loadLayout(userId);
      let profile = loadProfile(userId);

      const setRadio = (name, value) => {
        const el = qs(`input[name="${name}"][value="${value}"]`);
        if (el) el.checked = true;
      };

      const renderPaletteSelected = () => {
        if (!paletteEl) return;
        const cur = (profile.color || DEFAULT_PROFILE.color).toLowerCase();
        paletteEl.querySelectorAll(".colorSwatch").forEach((btn) => {
          const c = String(btn.getAttribute("data-color") || "").toLowerCase();
          btn.classList.toggle("is-selected", !!c && c === cur);
          if (c) btn.style.background = c;
        });
      };

      const enforceSideConstraint = (changed) => {
        const conflict = layout.timer.side === layout.point.side;
        sideError?.classList.toggle("hidden", !conflict);
        if (!conflict) return true;
        const all = ["top", "bottom", "left", "right"];
        if (changed === "timer") {
          const alt = all.find((s) => s !== layout.point.side) || "top";
          layout.timer.side = alt;
          setRadio("rmDsTimerSide", layout.timer.side);
        } else if (changed === "point") {
          const alt = all.find((s) => s !== layout.timer.side) || "right";
          layout.point.side = alt;
          setRadio("rmDsPointSide", layout.point.side);
        }
        sideError?.classList.remove("hidden");
        return false;
      };

      const disableConflictingSideOptions = () => {
        const t = layout.timer.side;
        const p = layout.point.side;
        qsa('input[name="rmDsTimerSide"]').forEach((el) => {
          el.disabled = el.value === p && !el.checked;
        });
        qsa('input[name="rmDsPointSide"]').forEach((el) => {
          el.disabled = el.value === t && !el.checked;
        });
      };

      const persist = () => {
        saveLayout(userId, layout);
        saveProfile(userId, profile);
        syncHostProfile();
      };

      // init values
      if (nameEl) nameEl.value = profile.name || DEFAULT_PROFILE.name;
      if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
      if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);
      if (pointTwoLineEl) pointTwoLineEl.checked = !!layout.point.twoLine;
      setRadio("rmDsTimerVisible", layout.timer.visible ? "on" : "off");
      setRadio("rmDsPointVisible", layout.point.visible ? "on" : "off");
      setRadio("rmDsTimerSide", layout.timer.side);
      setRadio("rmDsPointSide", layout.point.side);
      renderPaletteSelected();
      disableConflictingSideOptions();

      nameEl?.addEventListener("input", () => {
        profile.name = (nameEl.value || "").toString().slice(0, 24) || DEFAULT_PROFILE.name;
        persist();
      });
      paletteEl?.addEventListener("click", (e) => {
        const t = e.target;
        if (!t?.classList?.contains("colorSwatch")) return;
        const c = String(t.getAttribute("data-color") || "");
        if (!c) return;
        profile.color = c;
        renderPaletteSelected();
        persist();
      });

      imgEl?.addEventListener("change", () => {
        const f = imgEl.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
          alert("画像ファイルを選択してください。");
          imgEl.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          profile.iconImage = String(reader.result || "");
          persist();
        };
        reader.readAsDataURL(f);
      });
      clearImgBtn?.addEventListener("click", () => {
        profile.iconImage = "";
        if (imgEl) imgEl.value = "";
        persist();
      });

      qsa('input[name="rmDsTimerVisible"]').forEach((el) =>
        el.addEventListener("change", () => {
          layout.timer.visible = el.value === "on";
          saveLayout(userId, layout);
        }),
      );
      qsa('input[name="rmDsPointVisible"]').forEach((el) =>
        el.addEventListener("change", () => {
          layout.point.visible = el.value === "on";
          saveLayout(userId, layout);
        }),
      );
      qsa('input[name="rmDsTimerSide"]').forEach((el) =>
        el.addEventListener("change", () => {
          if (!el.checked) return;
          layout.timer.side = el.value;
          enforceSideConstraint("timer");
          disableConflictingSideOptions();
          saveLayout(userId, layout);
        }),
      );
      qsa('input[name="rmDsPointSide"]').forEach((el) =>
        el.addEventListener("change", () => {
          if (!el.checked) return;
          layout.point.side = el.value;
          enforceSideConstraint("point");
          disableConflictingSideOptions();
          saveLayout(userId, layout);
        }),
      );
      timerScaleEl?.addEventListener("input", () => {
        layout.timer.scale = clamp(Number(timerScaleEl.value), 0.5, 2.0);
        saveLayout(userId, layout);
      });
      pointScaleEl?.addEventListener("input", () => {
        layout.point.scale = clamp(Number(pointScaleEl.value), 0.5, 2.0);
        saveLayout(userId, layout);
      });
      pointTwoLineEl?.addEventListener("change", () => {
        layout.point.twoLine = !!pointTwoLineEl.checked;
        saveLayout(userId, layout);
      });

      resetBtn?.addEventListener("click", () => {
        localStorage.removeItem(layoutKey(userId));
        localStorage.removeItem(profileKey(userId));
        layout = loadLayout(userId);
        profile = loadProfile(userId);
        persist();
        // reflect UI
        if (nameEl) nameEl.value = profile.name || DEFAULT_PROFILE.name;
        setRadio("rmDsTimerVisible", layout.timer.visible ? "on" : "off");
        setRadio("rmDsPointVisible", layout.point.visible ? "on" : "off");
        setRadio("rmDsTimerSide", layout.timer.side);
        setRadio("rmDsPointSide", layout.point.side);
        if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
        if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);
        if (pointTwoLineEl) pointTwoLineEl.checked = !!layout.point.twoLine;
        renderPaletteSelected();
        disableConflictingSideOptions();
      });
    };

    initHostSettingsControls();

    let timerState = { duration: 0, startedAt: 0, running: false };
    roomRef.child("timer").on("value", (snap) => {
      timerState = snap.val() || { duration: 0, startedAt: 0, running: false };
    });

    // Host-controlled overlay flags (host's own point only)
    const hostPointVisibleToggle = qs("#hostPointVisibleToggle");
    if (hostPointVisibleToggle) hostPointVisibleToggle.disabled = !isHost;
    const hostPointRef = roomRef.child("flags/hostPointVisible");
    // Backward compat: if old flags/pointsVisible exists, treat it as initial value
    roomRef.child("flags").on("value", (snap) => {
      const flags = snap.val() || {};
      const v = flags.hostPointVisible;
      const legacy = flags.pointsVisible;
      const visible = v == null ? (legacy == null ? true : !!legacy) : !!v;
      if (hostPointVisibleToggle) hostPointVisibleToggle.checked = visible;
    });
    hostPointVisibleToggle?.addEventListener("change", () => {
      if (!isHost) return;
      hostPointRef.set(!!hostPointVisibleToggle.checked);
      roomRef.child("lastActiveAt").set(serverTimestamp());
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
        .sort((a, b) => {
          const ao = Number(a[1]?.order ?? a[1]?.joinedAt ?? 0);
          const bo = Number(b[1]?.order ?? b[1]?.joinedAt ?? 0);
          if (ao !== bo) return ao - bo;
          return String(a[1]?.name || "").localeCompare(String(b[1]?.name || ""));
        })
        .forEach(([uid, p], idx, sorted) => {
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

          const up = document.createElement("button");
          up.className = "btn btnIconSmall";
          up.textContent = "▲";
          up.title = "上へ";
          up.disabled = !isHost || idx === 0;
          up.addEventListener("click", async () => {
            if (!isHost) return;
            const prevUid = sorted[idx - 1]?.[0];
            if (!prevUid) return;
            const curOrder = Number(players?.[uid]?.order ?? players?.[uid]?.joinedAt ?? nowMs());
            const prevOrder = Number(players?.[prevUid]?.order ?? players?.[prevUid]?.joinedAt ?? nowMs() - 1);
            const updates = {};
            updates[`players/${uid}/order`] = prevOrder;
            updates[`players/${prevUid}/order`] = curOrder;
            await roomRef.update(updates);
            await roomRef.child("lastActiveAt").set(serverTimestamp());
          });

          const down = document.createElement("button");
          down.className = "btn btnIconSmall";
          down.textContent = "▼";
          down.title = "下へ";
          down.disabled = !isHost || idx === sorted.length - 1;
          down.addEventListener("click", async () => {
            if (!isHost) return;
            const nextUid = sorted[idx + 1]?.[0];
            if (!nextUid) return;
            const curOrder = Number(players?.[uid]?.order ?? players?.[uid]?.joinedAt ?? nowMs());
            const nextOrder = Number(players?.[nextUid]?.order ?? players?.[nextUid]?.joinedAt ?? nowMs() + 1);
            const updates = {};
            updates[`players/${uid}/order`] = nextOrder;
            updates[`players/${nextUid}/order`] = curOrder;
            await roomRef.update(updates);
            await roomRef.child("lastActiveAt").set(serverTimestamp());
          });

          const delta = document.createElement("input");
          delta.className = "input mono deltaInput";
          delta.type = "number";
          delta.min = "1";
          delta.step = "1";
          delta.value = "1";
          delta.title = "増減量";

          const plus = document.createElement("button");
          plus.className = "btn btnIcon";
          plus.textContent = "+";
          plus.disabled = !isHost;
          plus.addEventListener("click", () => {
            const d = Math.max(1, Math.floor(Number(delta.value || 1)));
            roomRef
              .child(`players/${uid}/score`)
              .transaction((cur) => (Number(cur || 0) || 0) + d);
            roomRef.child("lastActiveAt").set(serverTimestamp());
          });

          const minus = document.createElement("button");
          minus.className = "btn btnIcon";
          minus.textContent = "−";
          minus.disabled = !isHost;
          minus.addEventListener("click", () => {
            const d = Math.max(1, Math.floor(Number(delta.value || 1)));
            roomRef
              .child(`players/${uid}/score`)
              .transaction((cur) => (Number(cur || 0) || 0) - d);
            roomRef.child("lastActiveAt").set(serverTimestamp());
          });

          const del = document.createElement("button");
          del.className = "btn btnIcon btn--danger";
          del.textContent = "✕";
          del.title = "プレイヤーを削除";
          del.disabled = !isHost;
          del.addEventListener("click", async () => {
            if (!isHost) return;
            const pname = String(p?.name || uid);
            const ok = confirm(`プレイヤー「${pname}」を削除しますか？\n（overlayの表示からも消えます）`);
            if (!ok) return;
            await roomRef.child(`players/${uid}`).remove();
            await roomRef.child("lastActiveAt").set(serverTimestamp());
          });

          actions.appendChild(up);
          actions.appendChild(down);
          actions.appendChild(minus);
          actions.appendChild(delta);
          actions.appendChild(plus);
          actions.appendChild(del);

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
      await roomRef.child("lastActiveAt").set(serverTimestamp());
    });

    qs("#timerStopBtn")?.addEventListener("click", async () => {
      if (!isHost) return;
      const remaining = Math.ceil(computeRemainingSeconds(timerState));
      await roomRef.child("timer").set({
        duration: Math.max(0, remaining),
        startedAt: 0,
        running: false,
      });
      await roomRef.child("lastActiveAt").set(serverTimestamp());
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
      await roomRef.child("lastActiveAt").set(serverTimestamp());
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
    // Settings moved to index.html
    location.replace("./index.html#displaySettings");
  }

  function initOverlay() {
    const userId = getOrCreateUserId();
    let layout = loadLayout(userId);
    let profile = loadProfile(userId);
    const roomId = (getParam("room") || "test").trim();

    const timerEl = qs("#ovTimer");
    const timerValEl = qs("#ovTimerValue");
    const pointEl = qs("#ovPoint");
    const playersEl = qs("#ovPlayers");

    applyOverlayLayout(timerEl, layout.timer);
    applyOverlayLayout(pointEl, layout.point);
    setOverlayAccent(timerEl, profile.color);

    let timerState = { duration: 300, startedAt: 0, running: false };
    let playersState = {};
    let hostAuthUid = "";
    let hostPointVisible = true;
    let hostPointsVisible = true;

    const isTest = !roomId || roomId === "test";

    let testUserCount = Number(localStorage.getItem("test_user_count") || "3") || 3;
    testUserCount = clamp(testUserCount, 1, 12);

    function renderPlayers(players) {
      if (!playersEl) return;
      const entries = Object.entries(players || {});
      entries.sort((a, b) => {
        const ao = Number(a[1]?.order ?? a[1]?.joinedAt ?? 0);
        const bo = Number(b[1]?.order ?? b[1]?.joinedAt ?? 0);
        if (ao !== bo) return ao - bo;
        return String(a[1]?.name || "").localeCompare(String(b[1]?.name || ""));
      });
      playersEl.innerHTML = "";

      const fitNameOnly = (cardEl, nameEl, scoreEl) => {
        if (!cardEl || !nameEl || !scoreEl) return;
        const base = 34;
        const min = 22; // lower than this: rely on "…" ellipsis instead of further shrinking
        const gap = 12; // must match CSS gap
        nameEl.style.fontSize = `${base}px`;

        const cardRect = cardEl.getBoundingClientRect();
        const scoreRect = scoreEl.getBoundingClientRect();
        const maxName = Math.max(80, Math.floor(cardRect.width - scoreRect.width - gap - 28)); // 28 ~= padding
        nameEl.style.maxWidth = `${maxName}px`;

        for (let size = base; size >= min; size -= 1) {
          nameEl.style.fontSize = `${size}px`;
          const nRect = nameEl.getBoundingClientRect();
          const sRect = scoreEl.getBoundingClientRect();
          if (nRect.right + gap <= sRect.left) break;
        }
      };

      for (const [uid, p] of entries) {
        // hide only host player's card when hostPointVisible=false
        if (!hostPointVisible && hostAuthUid && String(p?.authUid || "") === hostAuthUid) continue;

        const card = document.createElement("div");
        card.className = `pointCard${layout.point.twoLine ? " is-twoLine" : ""}`;
        const color = String(p?.color || DEFAULT_PROFILE.color);
        card.style.borderColor = color;

        const img = String(p?.iconImage || "");
        if (img) {
          card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35)), url("${img}")`;
        } else {
          card.style.backgroundImage = "";
        }

        const row = document.createElement("div");
        row.className = "pointRow";

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = String(p?.name || uid);
        name.style.color = color;

        const score = document.createElement("span");
        score.className = "score";
        score.textContent = `${Number(p?.score || 0)}pt`;

        row.appendChild(name);
        row.appendChild(score);
        card.appendChild(row);
        playersEl.appendChild(card);

        // after insertion (layout available), shrink only the name when needed.
        if (layout.point.twoLine) {
          // fit name within card width; if too small, rely on ellipsis
          const base = 40;
          const min = 22;
          name.style.maxWidth = `${Math.max(100, Math.floor(card.getBoundingClientRect().width - 28))}px`;
          for (let size = base; size >= min; size -= 1) {
            name.style.fontSize = `${size}px`;
            if (name.scrollWidth <= name.clientWidth + 1) break;
          }
        } else {
          fitNameOnly(card, name, score);
        }
      }
    }

    function applyAll() {
      applyOverlayLayout(timerEl, layout.timer);
      applyOverlayLayout(pointEl, { ...layout.point, visible: !!layout.point.visible && !!hostPointsVisible });
      setOverlayAccent(timerEl, profile.color);

      if (isTest) {
        const dummy = {};
        for (let i = 1; i <= testUserCount; i++) {
          dummy[`test_${i}`] = {
            name: i === 1 ? profile.name || DEFAULT_PROFILE.name : `Player ${i}`,
            score: 100 - (i - 1) * 7,
            color: profile.color || DEFAULT_PROFILE.color,
            iconImage: profile.iconImage || "",
          };
        }
        renderPlayers(dummy);
      } else {
        renderPlayers(playersState);
      }
    }

    // Join-only gear (hide when opened directly / OBS)
    const gearBtn = qs("#ovGearBtn");
    const access = getParam("access") || "";
    const accessInfo = consumeOverlayAccessToken(access);
    const showGear = !!accessInfo;
    gearBtn?.classList.toggle("hidden", !showGear);

    // Adjust modal (overlay)
    const adjustModal = qs("#ovAdjustModal");
    const adjustCloseBtn = qs("#ovAdjustCloseBtn");
    const modalHomeBtn = qs("#ovDsHomeBtn");
    const modalLeaveBtn = qs("#ovDsLeaveBtn");
    const closeAdjust = () => {
      adjustModal?.classList.add("hidden");
      adjustModal?.setAttribute("aria-hidden", "true");
    };
    const openAdjust = () => {
      adjustModal?.classList.remove("hidden");
      adjustModal?.setAttribute("aria-hidden", "false");
      setTimeout(() => qs("#ovDsDisplayName")?.focus(), 0);
    };
    adjustCloseBtn?.addEventListener("click", closeAdjust);
    adjustModal?.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.dataset?.close) closeAdjust();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !(adjustModal?.classList.contains("hidden"))) closeAdjust();
    });

    // Firebase refs for syncing profile changes live
    let playerRefForSync = null;
    let authedUidForSync = null;
    const syncProfileToFirebase = () => {
      if (isTest) return;
      if (!playerRefForSync || !authedUidForSync) return;
      playerRefForSync.update({
        authUid: authedUidForSync,
        name: profile.name,
        color: profile.color,
        iconImage: profile.iconImage || "",
      });
    };

    const initAdjustModalControls = () => {
      const nameEl = qs("#ovDsDisplayName");
      const paletteEl = qs("#ovDsColorPalette");
      const imgEl = qs("#ovDsImage");
      const clearImgBtn = qs("#ovDsClearImageBtn");
      const sideError = qs("#ovDsSideError");
      const resetBtn = qs("#ovDsResetBtn");
      const timerScaleEl = qs("#ovDsTimerScale");
      const pointScaleEl = qs("#ovDsPointScale");
      const pointTwoLineEl = qs("#ovDsPointTwoLine");

      const setRadio = (name, value) => {
        const el = qs(`input[name="${name}"][value="${value}"]`);
        if (el) el.checked = true;
      };

      const renderPaletteSelected = () => {
        if (!paletteEl) return;
        const cur = (profile.color || DEFAULT_PROFILE.color).toLowerCase();
        paletteEl.querySelectorAll(".colorSwatch").forEach((btn) => {
          const c = String(btn.getAttribute("data-color") || "").toLowerCase();
          btn.classList.toggle("is-selected", !!c && c === cur);
          if (c) btn.style.background = c;
        });
      };

      const enforceSideConstraint = (changed) => {
        const conflict = layout.timer.side === layout.point.side;
        sideError?.classList.toggle("hidden", !conflict);
        if (!conflict) return true;
        const all = ["top", "bottom", "left", "right"];
        if (changed === "timer") {
          const alt = all.find((s) => s !== layout.point.side) || "top";
          layout.timer.side = alt;
          setRadio("ovDsTimerSide", layout.timer.side);
        } else if (changed === "point") {
          const alt = all.find((s) => s !== layout.timer.side) || "right";
          layout.point.side = alt;
          setRadio("ovDsPointSide", layout.point.side);
        }
        sideError?.classList.remove("hidden");
        return false;
      };

      const disableConflictingSideOptions = () => {
        const t = layout.timer.side;
        const p = layout.point.side;
        qsa('input[name="ovDsTimerSide"]').forEach((el) => {
          el.disabled = el.value === p && !el.checked;
        });
        qsa('input[name="ovDsPointSide"]').forEach((el) => {
          el.disabled = el.value === t && !el.checked;
        });
      };

      // init UI values
      if (nameEl) nameEl.value = profile.name || DEFAULT_PROFILE.name;
      if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
      if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);
      if (pointTwoLineEl) pointTwoLineEl.checked = !!layout.point.twoLine;
      setRadio("ovDsTimerVisible", layout.timer.visible ? "on" : "off");
      setRadio("ovDsPointVisible", layout.point.visible ? "on" : "off");
      setRadio("ovDsTimerSide", layout.timer.side);
      setRadio("ovDsPointSide", layout.point.side);
      renderPaletteSelected();
      disableConflictingSideOptions();

      // handlers (auto save)
      nameEl?.addEventListener("input", () => {
        profile.name = (nameEl.value || "").toString().slice(0, 24) || DEFAULT_PROFILE.name;
        saveProfile(userId, profile);
        syncProfileToFirebase();
        applyAll();
      });
      paletteEl?.addEventListener("click", (e) => {
        const t = e.target;
        if (!t?.classList?.contains("colorSwatch")) return;
        const c = String(t.getAttribute("data-color") || "");
        if (!c) return;
        profile.color = c;
        saveProfile(userId, profile);
        syncProfileToFirebase();
        renderPaletteSelected();
        applyAll();
      });

      imgEl?.addEventListener("change", () => {
        const f = imgEl.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
          alert("画像ファイルを選択してください。");
          imgEl.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          profile.iconImage = String(reader.result || "");
          saveProfile(userId, profile);
          syncProfileToFirebase();
          applyAll();
        };
        reader.readAsDataURL(f);
      });
      clearImgBtn?.addEventListener("click", () => {
        profile.iconImage = "";
        if (imgEl) imgEl.value = "";
        saveProfile(userId, profile);
        syncProfileToFirebase();
        applyAll();
      });

      qsa('input[name="ovDsTimerVisible"]').forEach((el) =>
        el.addEventListener("change", () => {
          layout.timer.visible = el.value === "on";
          saveLayout(userId, layout);
          applyAll();
        }),
      );
      qsa('input[name="ovDsPointVisible"]').forEach((el) =>
        el.addEventListener("change", () => {
          layout.point.visible = el.value === "on";
          saveLayout(userId, layout);
          applyAll();
        }),
      );
      qsa('input[name="ovDsTimerSide"]').forEach((el) =>
        el.addEventListener("change", () => {
          if (!el.checked) return;
          layout.timer.side = el.value;
          enforceSideConstraint("timer");
          disableConflictingSideOptions();
          saveLayout(userId, layout);
          applyAll();
        }),
      );
      qsa('input[name="ovDsPointSide"]').forEach((el) =>
        el.addEventListener("change", () => {
          if (!el.checked) return;
          layout.point.side = el.value;
          enforceSideConstraint("point");
          disableConflictingSideOptions();
          saveLayout(userId, layout);
          applyAll();
        }),
      );
      timerScaleEl?.addEventListener("input", () => {
        layout.timer.scale = clamp(Number(timerScaleEl.value), 0.5, 2.0);
        saveLayout(userId, layout);
        applyAll();
      });
      pointScaleEl?.addEventListener("input", () => {
        layout.point.scale = clamp(Number(pointScaleEl.value), 0.5, 2.0);
        saveLayout(userId, layout);
        applyAll();
      });
      pointTwoLineEl?.addEventListener("change", () => {
        layout.point.twoLine = !!pointTwoLineEl.checked;
        saveLayout(userId, layout);
        applyAll();
      });

      resetBtn?.addEventListener("click", () => {
        localStorage.removeItem(layoutKey(userId));
        localStorage.removeItem(profileKey(userId));
        layout = loadLayout(userId);
        profile = loadProfile(userId);
        saveLayout(userId, layout);
        saveProfile(userId, profile);
        syncProfileToFirebase();
        applyAll();
        // reflect UI
        if (nameEl) nameEl.value = profile.name || DEFAULT_PROFILE.name;
        setRadio("ovDsTimerVisible", layout.timer.visible ? "on" : "off");
        setRadio("ovDsPointVisible", layout.point.visible ? "on" : "off");
        setRadio("ovDsTimerSide", layout.timer.side);
        setRadio("ovDsPointSide", layout.point.side);
        if (timerScaleEl) timerScaleEl.value = String(layout.timer.scale);
        if (pointScaleEl) pointScaleEl.value = String(layout.point.scale);
        if (pointTwoLineEl) pointTwoLineEl.checked = !!layout.point.twoLine;
        renderPaletteSelected();
        disableConflictingSideOptions();
      });
    };
    if (showGear) {
      const mode = accessInfo?.mode || "open"; // "join" shows leave
      modalLeaveBtn?.classList.toggle("hidden", mode !== "join");

      gearBtn?.addEventListener("click", openAdjust);
      modalHomeBtn?.addEventListener("click", () => {
        closeAdjust();
        location.href = "./index.html";
      });
      modalLeaveBtn?.addEventListener("click", () => {
        closeAdjust();
        location.href = "./index.html";
      });
    }

    if (!isTest) {
      const fb = initFirebaseOnce();
      if (fb) {
        ensureAuthed().then((authed) => {
          if (!authed) return;
          const roomRef = fb.db.ref(`rooms/${roomId}`);
          const hostIdRef = roomRef.child("hostId");
          const timerRef = roomRef.child("timer");
          const playerRef = roomRef.child(`players/${userId}`);
          const playersRef = roomRef.child("players");
          const flagsRef = roomRef.child("flags");
          const lastActiveRef = roomRef.child("lastActiveAt");

          // mark active once on open (no per-second writes)
          lastActiveRef.set(serverTimestamp());

          timerRef.on("value", (snap) => {
            timerState = snap.val() || timerState;
          });

          hostIdRef.on("value", (snap) => {
            hostAuthUid = String(snap.val() || "");
            applyAll();
          });

          flagsRef.on("value", (snap) => {
            const flags = snap.val() || {};
            const v = flags.hostPointVisible;
            const legacy = flags.pointsVisible;
            hostPointVisible = v == null ? (legacy == null ? true : !!legacy) : !!v;
            applyAll();
          });

          playersRef.on("value", (snap) => {
            playersState = snap.val() || {};
            applyAll();
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
                joinedAt: serverTimestamp(),
                order: serverTimestamp(),
              });
              // remove player entry on disconnect (requires rules allowing self delete)
              playerRef.onDisconnect().remove();
              lastActiveRef.onDisconnect().set(serverTimestamp());
              playerRefForSync = playerRef;
              authedUidForSync = authed.uid;
              syncProfileToFirebase();
              return;
            }
            playerRef.update({
              authUid: authed.uid,
              name: profile.name,
              color: profile.color,
              iconImage: profile.iconImage || "",
            });
            playerRef.onDisconnect().remove();
            lastActiveRef.onDisconnect().set(serverTimestamp());
            playerRefForSync = playerRef;
            authedUidForSync = authed.uid;
          });

          if (showGear) initAdjustModalControls();
        });
      } else {
        // Firebase未設定でも“表示のみ”は継続（ただしroom同期は不可）
        // console.warn("Firebase config not ready");
      }
    }

    // In test mode (no Firebase), still allow opening the adjust modal if gear is visible
    if (isTest && showGear) initAdjustModalControls();

    const tick = () => {
      const remaining = computeRemainingSeconds(timerState);
      if (timerValEl) timerValEl.textContent = formatTime(remaining);

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // レイアウト変更を即反映（別タブでconfig保存した場合など）
    window.addEventListener("storage", (e) => {
      if (e.key !== layoutKey(userId) && e.key !== profileKey(userId)) return;
      layout = loadLayout(userId);
      profile = loadProfile(userId);
      testUserCount = clamp(Number(localStorage.getItem("test_user_count") || "3") || 3, 1, 12);
      syncProfileToFirebase();
      applyAll();
    });

    applyAll();
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

