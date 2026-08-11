// =============================================================================
// data-layer.js
// -----------------------------------------------------------------------------
// LỚP TRUY CẬP DỮ LIỆU DUY NHẤT của toàn hệ thống. Mọi file khác (display.js,
// admin) chỉ được gọi qua các hàm export ở đây — không tự import Firestore SDK
// hay đụng vào localStorage trực tiếp ở nơi khác.
//
// Có 2 "backend" phía sau CÙNG MỘT API:
//   1) Firebase thật  — khi firebase-config.js đã được điền (DEMO_MODE=false)
//   2) DEMO (localStorage) — khi chưa cấu hình Firebase, dữ liệu mẫu lấy từ
//      module ./seed-data.js (import tĩnh, không phải fetch), lưu vào
//      localStorage của trình duyệt. Nhờ vậy có thể chạy thử toàn bộ hệ
//      thống mà không cần tài khoản Firebase, kể cả sau khi đã deploy thật.
//
// QUAN TRỌNG: các hàm on*() không bao giờ throw lỗi ra ngoài vòng lặp render —
// nếu mất mạng / lỗi Firestore, ta log lỗi ra console và GIỮ NGUYÊN dữ liệu cũ
// (không gọi callback với dữ liệu rỗng), để màn hình không bị "nháy trắng".
// =============================================================================

import { firebaseConfig, DEMO_MODE } from "./firebase-config.js";
import { THEMES, mergeTheme } from "./themes.js";
import { SEED_DATA } from "./seed-data.js";

/** true nếu đang chạy chế độ DEMO (không có Firebase). */
export const DEMO = DEMO_MODE;

// -----------------------------------------------------------------------------
// Hằng số & khóa localStorage (chỉ dùng trong DEMO_MODE)
// -----------------------------------------------------------------------------
const LS_PREFIX = "hbt_"; // Hanabi & Toro
const KEYS = {
  settings: LS_PREFIX + "settings",
  menu: LS_PREFIX + "menu",
  themes: LS_PREFIX + "themes",
  status: LS_PREFIX + "status",
  media: LS_PREFIX + "media",
  auth: LS_PREFIX + "auth_user",
  seeded: LS_PREFIX + "seeded_v1",
};

const DEFAULT_SETTINGS = {
  themeId: "hanabi",
  rotationSeconds: 10,
  itemsPerPage: 6,
  transition: "fade",
  distribution: "auto",
  currency: "zł",
  showHeader: true,
  headerText_pl: "MENU",
  effectsLevel: "full",
  revision: 0,
  updatedAt: null,
};

// -----------------------------------------------------------------------------
// Pub/sub nội bộ (cho DEMO_MODE) — mỗi "kind" có 1 tập callback đang lắng nghe
// -----------------------------------------------------------------------------
const subs = {
  settings: new Set(),
  menu: new Set(),
  themes: new Set(),
  status: new Set(),
  media: new Set(),
  auth: new Set(),
};

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("[data-layer] Đọc localStorage lỗi, dùng giá trị mặc định:", key, e);
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Thường do localStorage đầy (quota ~5-10MB) — hay gặp khi lưu nhiều ảnh media.
    console.error("[data-layer] Ghi localStorage lỗi (có thể bộ nhớ đầy):", key, e);
    throw new Error(
      "Không lưu được vào bộ nhớ trình duyệt (có thể đã đầy). Hãy xoá bớt ảnh món ăn cũ rồi thử lại."
    );
  }
}

function sortMenu(list) {
  return [...(list || [])].sort((a, b) => {
    const oa = Number(a.order) || 0;
    const ob = Number(b.order) || 0;
    if (oa !== ob) return oa - ob;
    return String(a.name_pl || "").localeCompare(String(b.name_pl || ""), "pl");
  });
}

/** Ghép preset trong THEMES với các bản ghi đè lưu trong Firestore/localStorage. */
function buildThemesMap(overridesMap) {
  const result = {};
  for (const id of Object.keys(THEMES)) {
    result[id] = mergeTheme(id, overridesMap ? overridesMap[id] : undefined);
  }
  if (overridesMap) {
    for (const id of Object.keys(overridesMap)) {
      if (!result[id]) result[id] = { ...overridesMap[id] };
    }
  }
  return result;
}

// Mỗi "kind" biết cách tự đọc dữ liệu hiện tại của mình từ localStorage.
const READERS = {
  settings: () => readLS(KEYS.settings, DEFAULT_SETTINGS),
  menu: () => sortMenu(readLS(KEYS.menu, [])),
  themes: () => buildThemesMap(readLS(KEYS.themes, {})),
  status: () => readLS(KEYS.status, {}),
  media: () => readLS(KEYS.media, {}),
  auth: () => readLS(KEYS.auth, null),
};

function notify(kind) {
  const data = READERS[kind]();
  subs[kind].forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error(`[data-layer] Lỗi trong callback '${kind}':`, e);
    }
  });
}

/** Đăng ký lắng nghe kiểu DEMO: gọi ngay với dữ liệu hiện có, trả về unsubscribe. */
function demoSubscribe(kind, cb) {
  try {
    cb(READERS[kind]());
  } catch (e) {
    console.error(`[data-layer] Lỗi trong callback '${kind}':`, e);
  }
  subs[kind].add(cb);
  return () => {
    subs[kind].delete(cb);
  };
}

// Đồng bộ đa tab: khi tab admin ghi localStorage, tab hiển thị (hoặc iframe
// xem trước) ở tab/khung khác cùng origin sẽ nhận sự kiện "storage" của
// trình duyệt (sự kiện này KHÔNG bắn ra ở chính tab vừa ghi — vì vậy ta còn
// cần notify() nội bộ ở trên cho phản ứng ngay trong cùng tab).
if (DEMO && typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const KEY_TO_KIND = {};
  Object.keys(READERS).forEach((kind) => {
    KEY_TO_KIND[KEYS[kind]] = kind;
  });
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    const kind = KEY_TO_KIND[e.key];
    if (kind) notify(kind);
  });
}

function ensureSeeded() {
  if (readLS(KEYS.seeded, false)) return;
  // SEED_DATA được import tĩnh từ seed-data.js (nằm ngay trong public/assets/js/,
  // được deploy cùng toàn bộ site) — không còn fetch mạng, không còn phụ thuộc
  // đường dẫn tương đối hay việc phải chạy qua local server chỉ để xem DEMO.
  const seed = SEED_DATA || {};
  writeLS(KEYS.settings, seed.settings || DEFAULT_SETTINGS);
  writeLS(KEYS.menu, seed.menu || []);
  writeLS(KEYS.themes, seed.themes || {});
  writeLS(KEYS.status, {});
  writeLS(KEYS.media, {});
  writeLS(KEYS.seeded, true);
}

function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// -----------------------------------------------------------------------------
// Firebase SDK — nạp động (dynamic import) từ CDN gstatic, CHỈ khi cần dùng.
// Nhờ vậy DEMO_MODE không bao giờ cố kết nối mạng tới Firebase.
// -----------------------------------------------------------------------------
const FB_VERSION = "10.12.2";
let _fbPromise = null;

function loadFirebase() {
  if (_fbPromise) return _fbPromise;
  _fbPromise = (async () => {
    const [appMod, firestoreMod, authMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-auth.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const db = firestoreMod.getFirestore(app);
    const auth = authMod.getAuth(app);
    return { app, db, auth, mods: { firestore: firestoreMod, auth: authMod } };
  })();
  return _fbPromise;
}

/**
 * Đăng ký onSnapshot kiểu Firebase, chịu được việc loadFirebase() còn đang
 * tải (bất đồng bộ) — trả về unsubscribe hoạt động thật ngay cả khi được gọi
 * trước khi Firebase kết nối xong.
 */
function fbSubscribe(setup) {
  let unsub = null;
  let cancelled = false;
  loadFirebase()
    .then((fb) => {
      if (cancelled) return;
      unsub = setup(fb);
    })
    .catch((err) => {
      console.error("[data-layer] Không kết nối được Firebase, giữ dữ liệu cũ:", err);
    });
  return () => {
    cancelled = true;
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (e) {
        /* bỏ qua lỗi khi hủy đăng ký */
      }
    }
  };
}

/**
 * Ước lượng độ lệch giữa đồng hồ máy khách và server bằng cách ghi 1 doc có
 * serverTimestamp() rồi đọc lại, lấy trung điểm round-trip làm mốc so sánh.
 */
async function computeServerOffset(db, firestoreMod) {
  const { doc, setDoc, getDoc, serverTimestamp } = firestoreMod;
  const ref = doc(db, "status", "_offsetProbe");
  const t0 = Date.now();
  await setDoc(ref, { t: serverTimestamp() }, { merge: true });
  const snap = await getDoc(ref);
  const t1 = Date.now();
  const tsField = snap.exists() ? snap.get("t") : null;
  const serverMillis = tsField && typeof tsField.toMillis === "function" ? tsField.toMillis() : Date.now();
  const estimatedLocalAtServerTime = t0 + (t1 - t0) / 2;
  return serverMillis - estimatedLocalAtServerTime;
}

let _serverOffsetMs = 0;
let _initPromise = null;

/**
 * Khởi tạo lớp dữ liệu: seed localStorage (DEMO) hoặc tính serverOffsetMs
 * (Firebase). Rẻ, chỉ chạy 1 lần cho mỗi lần tải trang dù gọi nhiều lần.
 * @returns {Promise<void>}
 */
export function initData() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (DEMO) {
      ensureSeeded();
      _serverOffsetMs = 0; // DEMO chạy 100% phía client, không có "server" riêng
      return;
    }
    try {
      const { db, mods } = await loadFirebase();
      _serverOffsetMs = await computeServerOffset(db, mods.firestore);
    } catch (e) {
      console.error("[data-layer] Không tính được serverOffsetMs, dùng 0:", e);
      _serverOffsetMs = 0;
    }
  })();
  return _initPromise;
}

/** @returns {number} độ lệch (ms) giữa Date.now() cục bộ và giờ server. */
export function getServerOffsetMs() {
  return _serverOffsetMs;
}

// -----------------------------------------------------------------------------
// Realtime subscriptions — mỗi hàm trả về unsubscribe() dùng được thật
// -----------------------------------------------------------------------------

/** cb(settings) mỗi khi settings/global thay đổi. */
export function onSettings(cb) {
  if (DEMO) return demoSubscribe("settings", cb);
  return fbSubscribe(({ db, mods }) => {
    const { doc, onSnapshot } = mods.firestore;
    return onSnapshot(
      doc(db, "settings", "global"),
      (snap) => cb(snap.exists() ? snap.data() : DEFAULT_SETTINGS),
      (err) => console.error("[data-layer] onSettings lỗi, giữ dữ liệu cũ:", err)
    );
  });
}

/** cb(items[]) — TOÀN BỘ món ăn (kể cả ẩn), đã sắp theo (order, name_pl). */
export function onMenu(cb) {
  if (DEMO) return demoSubscribe("menu", cb);
  return fbSubscribe(({ db, mods }) => {
    const { collection, onSnapshot } = mods.firestore;
    return onSnapshot(
      collection(db, "menu"),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cb(sortMenu(items));
      },
      (err) => console.error("[data-layer] onMenu lỗi, giữ dữ liệu cũ:", err)
    );
  });
}

/** cb({id: theme}) — 6 preset trong themes.js đã ghép với bản ghi đè lưu ở Firestore. */
export function onThemes(cb) {
  if (DEMO) return demoSubscribe("themes", cb);
  return fbSubscribe(({ db, mods }) => {
    const { collection, onSnapshot } = mods.firestore;
    return onSnapshot(
      collection(db, "themes"),
      (snap) => {
        const overrides = {};
        snap.docs.forEach((d) => {
          overrides[d.id] = d.data();
        });
        cb(buildThemesMap(overrides));
      },
      (err) => console.error("[data-layer] onThemes lỗi, giữ dữ liệu cũ:", err)
    );
  });
}

/** cb({1:{...},2:{...},3:{...},4:{...}}) — heartbeat của 4 màn hình (dùng cho admin). */
export function onStatus(cb) {
  if (DEMO) return demoSubscribe("status", cb);
  return fbSubscribe(({ db, mods }) => {
    const { collection, onSnapshot } = mods.firestore;
    return onSnapshot(
      collection(db, "status"),
      (snap) => {
        const out = {};
        snap.docs.forEach((d) => {
          const m = /^screen(\d+)$/.exec(d.id);
          if (m) out[m[1]] = d.data();
        });
        cb(out);
      },
      (err) => console.error("[data-layer] onStatus lỗi, giữ dữ liệu cũ:", err)
    );
  });
}

/** cb({mediaId: {dataUrl,w,h,bytes,createdAt}}) — thư viện ảnh nhúng. */
export function onMedia(cb) {
  if (DEMO) return demoSubscribe("media", cb);
  return fbSubscribe(({ db, mods }) => {
    const { collection, onSnapshot } = mods.firestore;
    return onSnapshot(
      collection(db, "media"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        cb(map);
      },
      (err) => console.error("[data-layer] onMedia lỗi, giữ dữ liệu cũ:", err)
    );
  });
}

// -----------------------------------------------------------------------------
// Ghi dữ liệu (CRUD) — chỉ trang admin gọi các hàm này
// -----------------------------------------------------------------------------

/**
 * Lưu (merge) settings/global. Tự tăng `revision` thêm 1 và set `updatedAt` —
 * đây là tín hiệu để 4 màn hình biết cần cập nhật lại tại chỗ.
 */
export async function saveSettings(patch) {
  if (DEMO) {
    const current = readLS(KEYS.settings, DEFAULT_SETTINGS);
    const next = {
      ...current,
      ...patch,
      revision: (Number(current.revision) || 0) + 1,
      updatedAt: Date.now(),
    };
    writeLS(KEYS.settings, next);
    notify("settings");
    return next;
  }
  const { db, mods } = await loadFirebase();
  const { doc, setDoc, serverTimestamp, increment } = mods.firestore;
  const ref = doc(db, "settings", "global");
  await setDoc(
    ref,
    { ...patch, revision: increment(1), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Upsert 1 món ăn. Nếu `item.id` rỗng sẽ tạo id mới. Trả về id. */
export async function saveItem(item) {
  if (!item || typeof item.name_pl !== "string" || !item.name_pl.trim()) {
    throw new Error("Tên món (name_pl) là bắt buộc.");
  }
  if (typeof item.price !== "number" || Number.isNaN(item.price)) {
    throw new Error("Giá (price) phải là số.");
  }
  const id = item.id || genId();
  const payload = { ...item };
  delete payload.id;

  if (DEMO) {
    const list = readLS(KEYS.menu, []);
    const idx = list.findIndex((it) => it.id === id);
    const next = { ...payload, id, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    writeLS(KEYS.menu, list);
    notify("menu");
    return id;
  }

  const { db, mods } = await loadFirebase();
  const { doc, setDoc, serverTimestamp } = mods.firestore;
  await setDoc(doc(db, "menu", id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return id;
}

/** Xoá 1 món ăn theo id. */
export async function deleteItem(id) {
  if (!id) return;
  if (DEMO) {
    const list = readLS(KEYS.menu, []).filter((it) => it.id !== id);
    writeLS(KEYS.menu, list);
    notify("menu");
    return;
  }
  const { db, mods } = await loadFirebase();
  const { doc, deleteDoc } = mods.firestore;
  await deleteDoc(doc(db, "menu", id));
}

/** Lưu bản ghi đè màu cho 1 theme (themes/{id}), merge lên preset gốc. */
export async function saveTheme(id, theme) {
  if (!id) throw new Error("Thiếu id theme.");
  if (DEMO) {
    const overrides = readLS(KEYS.themes, {});
    overrides[id] = { ...(overrides[id] || {}), ...theme };
    writeLS(KEYS.themes, overrides);
    notify("themes");
    return;
  }
  const { db, mods } = await loadFirebase();
  const { doc, setDoc } = mods.firestore;
  await setDoc(doc(db, "themes", id), theme, { merge: true });
}

// -----------------------------------------------------------------------------
// Media (ảnh món ăn) — nén ở phía client, lưu base64 thẳng vào Firestore
// (không cần Firebase Storage trả phí)
// -----------------------------------------------------------------------------

const MEDIA_MAX_WIDTH = 900;
const MEDIA_QUALITY = 0.82;
const MEDIA_MAX_BYTES = 700 * 1024; // 700KB — Firestore giới hạn cứng 1MB/doc

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      // Một số định dạng (vd HEIC) createImageBitmap có thể không hỗ trợ —
      // rơi xuống cách dự phòng bằng thẻ <img> bên dưới.
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh. File có thể bị hỏng hoặc không đúng định dạng."));
    };
    img.src = url;
  });
}

function base64ByteLength(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = (b64.match(/=+$/) || [""])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Resize ảnh về chiều rộng tối đa 900px, nén WebP chất lượng 0.82, lưu vào
 * media/{id} (Firestore) hoặc localStorage (DEMO). Trả về mediaId.
 * @param {File} file
 * @returns {Promise<string>} mediaId
 */
export async function uploadMedia(file) {
  if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) {
    throw new Error("File không phải là ảnh hợp lệ. Vui lòng chọn file JPG/PNG/WebP.");
  }

  const src = await loadImageSource(file);
  const srcW = src.width;
  const srcH = src.height;
  const scale = srcW > MEDIA_MAX_WIDTH ? MEDIA_MAX_WIDTH / srcW : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(src, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/webp", MEDIA_QUALITY);
  const bytes = base64ByteLength(dataUrl);

  if (bytes > MEDIA_MAX_BYTES) {
    throw new Error(
      `Ảnh sau khi nén vẫn quá lớn (${Math.round(bytes / 1024)}KB, giới hạn ${Math.round(
        MEDIA_MAX_BYTES / 1024
      )}KB). Vui lòng chọn ảnh khác, ít chi tiết hơn hoặc độ phân giải gốc nhỏ hơn.`
    );
  }

  const id = genId();

  if (DEMO) {
    const map = readLS(KEYS.media, {});
    map[id] = { dataUrl, w, h, bytes, createdAt: Date.now() };
    writeLS(KEYS.media, map);
    notify("media");
    return id;
  }

  const { db, mods } = await loadFirebase();
  const { doc, setDoc, serverTimestamp } = mods.firestore;
  await setDoc(doc(db, "media", id), { dataUrl, w, h, bytes, createdAt: serverTimestamp() });
  return id;
}

/**
 * Trả về src ảnh dùng được cho thẻ <img>, ưu tiên imageUrl (URL ngoài),
 * sau đó tra mediaId trong mediaMap (lấy từ onMedia). Trả về "" nếu không có
 * ảnh nào — bên gọi (display.js) tự hiển thị placeholder có style riêng.
 * @param {object} item - 1 document trong menu/
 * @param {object} mediaMap - map {mediaId: {dataUrl,...}} từ onMedia(cb)
 * @returns {string}
 */
export function resolveImage(item, mediaMap) {
  if (!item) return "";
  if (item.imageUrl) return item.imageUrl;
  if (item.mediaId && mediaMap && mediaMap[item.mediaId]) {
    return mediaMap[item.mediaId].dataUrl || "";
  }
  return "";
}

// -----------------------------------------------------------------------------
// Heartbeat — màn hình báo "còn sống" cho admin theo dõi
// -----------------------------------------------------------------------------
const HEARTBEAT_MIN_INTERVAL_MS = 55000; // tự vệ nội bộ, dù caller nên tự throttle ~60s
const _lastHeartbeatAt = {};

/**
 * Ghi status/screen{N}. Bỏ qua nếu gọi lại trong vòng 55s kể từ lần trước
 * (tự vệ nội bộ) — không throw để không làm gián đoạn vòng lặp hiển thị.
 * @param {number|string} screenId
 * @param {object} info - vd { revision, page, ua, res }
 */
export async function heartbeat(screenId, info = {}) {
  try {
    const key = String(screenId);
    const now = Date.now();
    if (_lastHeartbeatAt[key] && now - _lastHeartbeatAt[key] < HEARTBEAT_MIN_INTERVAL_MS) {
      return;
    }
    _lastHeartbeatAt[key] = now;

    if (DEMO) {
      const status = readLS(KEYS.status, {});
      status[key] = { ...info, lastSeen: now };
      writeLS(KEYS.status, status);
      notify("status");
      return;
    }

    const { db, mods } = await loadFirebase();
    const { doc, setDoc, serverTimestamp } = mods.firestore;
    await setDoc(doc(db, "status", `screen${key}`), { ...info, lastSeen: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error("[data-layer] heartbeat lỗi (bỏ qua, không ảnh hưởng hiển thị):", e);
  }
}

// -----------------------------------------------------------------------------
// Xác thực Admin (Firebase Auth email/mật khẩu; DEMO dùng tài khoản giả)
// -----------------------------------------------------------------------------

/**
 * Đăng nhập admin. Ở DEMO_MODE chấp nhận mọi email/mật khẩu hợp lệ (>=6 ký
 * tự) vì không có backend thật — chỉ để demo luồng đăng nhập.
 * @returns {Promise<object>} user
 */
export async function signIn(email, pass) {
  if (DEMO) {
    if (!email || !pass || String(pass).length < 6) {
      throw new Error(
        "Vui lòng nhập email và mật khẩu (tối thiểu 6 ký tự). Ở chế độ DEMO, mọi email/mật khẩu hợp lệ đều đăng nhập được."
      );
    }
    const user = { uid: "demo-" + email, email, demo: true };
    writeLS(KEYS.auth, user);
    notify("auth");
    return user;
  }
  const { auth, mods } = await loadFirebase();
  const { signInWithEmailAndPassword } = mods.auth;
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

/** Đăng xuất admin. */
export async function signOutAdmin() {
  if (DEMO) {
    try {
      localStorage.removeItem(KEYS.auth);
    } catch (e) {
      /* bỏ qua */
    }
    notify("auth");
    return;
  }
  const { auth, mods } = await loadFirebase();
  const { signOut } = mods.auth;
  await signOut(auth);
}

/** cb(user|null) mỗi khi trạng thái đăng nhập thay đổi. */
export function onAuth(cb) {
  if (DEMO) return demoSubscribe("auth", cb);
  return fbSubscribe(({ auth, mods }) => mods.auth.onAuthStateChanged(auth, cb));
}
