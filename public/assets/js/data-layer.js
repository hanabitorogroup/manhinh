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
  // Giờ (0-23, giờ địa phương của màn hình) tự tải lại trang 1 lần/ngày để dọn
  // bộ nhớ WebView tích tụ khi chạy 24/7 trên phần cứng signage yếu — xem
  // maybeNightlyReload() trong display.js. Mặc định 4 (04:00 sáng, ngoài giờ
  // phục vụ của hầu hết quán ăn).
  reloadHour: 4,
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

/**
 * Tính lại serverOffsetMs — dùng để bù trôi đồng hồ hệ điều hành (đặc biệt
 * Android chạy 24/7 nhiều tuần không tắt) sau initData() ban đầu. GHI CHÚ:
 * không nằm trong bảng "API bắt buộc" mục 4 ARCHITECTURE.md (giống onMedia/
 * resolveImage) — nơi gọi (display.js) dùng namespace import + kiểm tra
 * `typeof === 'function'` trước khi gọi, không import trực tiếp bằng tên, để
 * không vỡ liên kết module nếu một agent khác đang sửa file này song song.
 * @returns {Promise<number>} offset mới (ms)
 */
export async function resyncServerOffset() {
  if (DEMO) return _serverOffsetMs; // DEMO chạy 100% phía client, không có "server" riêng để lệch
  try {
    const { db, mods } = await loadFirebase();
    _serverOffsetMs = await computeServerOffset(db, mods.firestore);
  } catch (e) {
    console.error("[data-layer] Không đồng bộ lại được serverOffsetMs, giữ giá trị cũ:", e);
  }
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
// Nhập / xoá dữ liệu mẫu (seed) — CHỈ dùng ở admin, CHỈ có tác dụng với
// Firebase thật (DEMO_MODE đã tự nạp seed vào localStorage từ initData() rồi,
// xem ensureSeeded() ở trên — gọi các hàm dưới đây ở DEMO sẽ ném lỗi rõ ràng).
//
// Dùng Firestore batched writes (writeBatch) — giới hạn cứng của Firestore là
// 500 THAO TÁC/batch (không phải 500 DOCUMENT — set/update/delete đều tính là
// 1 thao tác). 72 món + tối đa vài doc settings/themes vẫn nằm gọn trong 1
// batch, nhưng chunkedBatchWrite() vẫn CHIA NHỎ theo đúng giới hạn đó một
// cách tổng quát, để không âm thầm vỡ nếu sau này seed-data.js phình to hơn
// 500 món (hoặc khi dùng lại chunkedBatchWrite() để xoá nhiều món cùng lúc).
// -----------------------------------------------------------------------------
const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Ghi 1 danh sách thao tác (set/delete) bằng writeBatch(), tự chia thành
 * nhiều batch theo đúng giới hạn 500 thao tác/batch của Firestore.
 * @param {object} db
 * @param {object} mods - mods.firestore (namespace import đầy đủ)
 * @param {Array<{type:"set"|"delete", ref:object, data?:object, options?:object}>} ops
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<number>} tổng số thao tác đã ghi thành công
 */
async function chunkedBatchWrite(db, mods, ops, onProgress) {
  const { writeBatch } = mods.firestore;
  let done = 0;
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    slice.forEach((op) => {
      if (op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data, op.options || {});
    });
    await batch.commit();
    done += slice.length;
    if (typeof onProgress === "function") {
      try {
        onProgress(done, ops.length);
      } catch (e) {
        /* lỗi trong callback tiến trình không được phép làm hỏng việc ghi dữ liệu */
      }
    }
  }
  return done;
}

async function docExistsIn(db, mods, col, id) {
  const { doc, getDoc } = mods.firestore;
  const snap = await getDoc(doc(db, col, id));
  return snap.exists();
}

/**
 * Nhập 72 món mẫu (`seed-data.js`) vào Firebase THẬT bằng batched writes.
 * Chỉ ghi `settings/global` nếu CHƯA tồn tại (không đè cấu hình đã chỉnh),
 * và chỉ ghi các `themes/{id}` có trong SEED_DATA.themes mà CHƯA tồn tại —
 * không có tác dụng phụ nào lên dữ liệu người dùng đã tự lưu.
 *
 * @param {"add"|"replace"} mode
 *   "add"     — giữ nguyên món đang có, chỉ ghi thêm 72 món mẫu (món mẫu
 *               trùng id với lần seed trước sẽ được ghi đè lại đúng dữ liệu
 *               gốc — idempotent, KHÔNG đụng tới món do admin tự thêm vì
 *               chúng có id khác).
 *   "replace" — XOÁ TOÀN BỘ document đang có trong collection `menu` trước,
 *               rồi mới nhập lại 72 món mẫu. Gọi hàm này chỉ sau khi người
 *               dùng đã xác nhận rõ ràng ở lớp UI (admin.js) — bản thân hàm
 *               này KHÔNG hỏi lại, cứ nhận mode="replace" là xoá ngay.
 * @param {(done:number,total:number,stage:"deleting"|"writing")=>void} [onProgress]
 * @returns {Promise<{written:number, deleted:number}>}
 */
export async function seedSampleData(mode, onProgress) {
  if (DEMO) {
    throw new Error(
      "Không dùng chức năng này ở chế độ DEMO — dữ liệu mẫu đã tự nạp sẵn vào bộ nhớ trình duyệt."
    );
  }
  const { db, mods } = await loadFirebase();
  const { collection, doc, getDocs, serverTimestamp } = mods.firestore;

  let deleted = 0;
  if (mode === "replace") {
    const snap = await getDocs(collection(db, "menu"));
    const delOps = snap.docs.map((d) => ({ type: "delete", ref: d.ref }));
    if (delOps.length) {
      deleted = await chunkedBatchWrite(db, mods, delOps, (done, total) => {
        if (typeof onProgress === "function") onProgress(done, total, "deleting");
      });
    }
  }

  const seed = SEED_DATA || {};
  const menuOps = (seed.menu || []).map((item) => {
    const { id, ...rest } = item;
    return {
      type: "set",
      ref: doc(db, "menu", id || genId()),
      data: { ...rest, updatedAt: serverTimestamp() },
      options: { merge: true },
    };
  });

  const extraOps = [];
  const settingsExists = await docExistsIn(db, mods, "settings", "global");
  if (!settingsExists) {
    extraOps.push({
      type: "set",
      ref: doc(db, "settings", "global"),
      data: { ...(seed.settings || DEFAULT_SETTINGS), updatedAt: serverTimestamp() },
      options: { merge: true },
    });
  }
  const seedThemes = seed.themes || {};
  for (const themeId of Object.keys(seedThemes)) {
    const exists = await docExistsIn(db, mods, "themes", themeId);
    if (!exists) {
      extraOps.push({ type: "set", ref: doc(db, "themes", themeId), data: seedThemes[themeId], options: { merge: true } });
    }
  }

  const written = await chunkedBatchWrite(db, mods, [...menuOps, ...extraOps], (done, total) => {
    if (typeof onProgress === "function") onProgress(done, total, "writing");
  });

  return { written, deleted };
}

/**
 * Xoá TOÀN BỘ document trong collection `menu` (dọn dữ liệu mẫu/thử nghiệm
 * trước khi nhập thực đơn thật). CHỈ xoá `menu` — không đụng settings/themes
 * để giữ nguyên bố cục/giao diện admin đã chỉnh. Gọi hàm này chỉ sau khi
 * người dùng đã xác nhận rõ ràng ở lớp UI — bản thân hàm KHÔNG hỏi lại.
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{deleted:number}>}
 */
export async function deleteAllMenuItems(onProgress) {
  if (DEMO) {
    throw new Error("Không dùng chức năng này ở chế độ DEMO — hãy xoá từng món ở tab \"Món ăn\".");
  }
  const { db, mods } = await loadFirebase();
  const { collection, getDocs } = mods.firestore;
  const snap = await getDocs(collection(db, "menu"));
  const ops = snap.docs.map((d) => ({ type: "delete", ref: d.ref }));
  const deleted = await chunkedBatchWrite(db, mods, ops, onProgress);
  return { deleted };
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

// =============================================================================
// Preflight — chẩn đoán lỗi cấu hình Firebase phổ biến
// -----------------------------------------------------------------------------
// Một dự án Firebase mới tạo rất dễ thiếu 1 trong 3 bước bắt buộc (Firestore
// chưa bật, rules chưa deploy, Email/Password chưa bật) — khi đó chủ quán chỉ
// thấy lỗi gốc của Firebase (tiếng Anh, mã lỗi khó hiểu) hoặc màn hình trống.
// Các hàm dưới đây DỊCH mã lỗi Firebase thật (error.code) sang tiếng Việt
// CHÍNH XÁC kèm bước khắc phục cụ thể — KHÔNG đoán bừa nguyên nhân khi mã lỗi
// không đủ để phân biệt (trả về status "warn" + liệt kê việc cần tự kiểm tra).
//
// GHI CHÚ: không nằm trong bảng "API bắt buộc" mục 4 ARCHITECTURE.md, theo
// đúng tiền lệ của onMedia/resolveImage/resyncServerOffset — nơi gọi (admin.js)
// dùng `typeof === 'function'` trước khi gọi.
// =============================================================================

function configPlaceholderFields() {
  return Object.entries(firebaseConfig || {})
    .filter(([, v]) => typeof v === "string" && v.includes("PASTE_"))
    .map(([k]) => k);
}

/**
 * Phân loại 1 lỗi kết nối Firestore/Auth thành 1 câu tiếng Việt ngắn gọn —
 * dùng để LOG RA CONSOLE (không phải hiển thị trực tiếp cho khách ở 4 màn
 * hình — màn hình chỉ hiện 1 dòng tiếng Ba Lan tối giản, xem display.js).
 * Hàm THUẦN (không gọi mạng), an toàn gọi từ bất kỳ đâu, kể cả display.js.
 * @param {Error} err
 * @returns {string}
 */
export function describeConnectionError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || String(err);
  if (code === "permission-denied") {
    return "Firestore từ chối quyền truy cập (permission-denied) — nhiều khả năng firestore.rules chưa được deploy (firebase deploy --only firestore:rules).";
  }
  if (code === "unavailable" || /offline/i.test(msg)) {
    return "Không kết nối được Cloud Firestore — kiểm tra Firestore Database đã bật trong Firebase Console chưa, và kết nối mạng của thiết bị.";
  }
  if (code === "not-found") {
    return "Không tìm thấy dự án Firestore khớp với projectId trong firebase-config.js.";
  }
  if (typeof code === "string" && code.startsWith("auth/")) {
    return `Lỗi Firebase Auth (${code}): ${msg}`;
  }
  return `Lỗi kết nối Firestore không xác định rõ nguyên nhân (mã: ${code || "?"}): ${msg}`;
}

function classifyFirestoreReadError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || String(err);
  if (code === "permission-denied") {
    return {
      id: "firestore-read", status: "fail", label: "Quyền đọc Firestore",
      message: "Firestore từ chối quyền đọc (permission-denied) — bộ quy tắc bảo mật (firestore.rules) chưa được deploy, hoặc đã bị chỉnh sai.",
      fix: "Chạy lệnh `firebase deploy --only firestore:rules` trong thư mục dự án (thư mục chứa firebase.json) để deploy đúng file firestore.rules.",
    };
  }
  if (code === "unavailable" || code === "failed-precondition" || /offline/i.test(msg)) {
    return {
      id: "firestore-read", status: "fail", label: "Kết nối Firestore",
      message: "Không kết nối được tới Cloud Firestore — có thể do Firestore Database chưa được bật cho dự án này, hoặc mất mạng.",
      fix: "Vào Firebase Console → Build → Firestore Database, xác nhận đã bấm \"Create database\" (Bước 2 trong DEPLOY.md). Nếu đã bật, kiểm tra lại kết nối mạng của máy đang mở trang admin.",
    };
  }
  if (code === "not-found") {
    return {
      id: "firestore-read", status: "fail", label: "Dự án Firestore",
      message: "Không tìm thấy Firestore khớp với projectId đang khai báo trong firebase-config.js.",
      fix: "So lại projectId trong firebase-config.js với Firebase Console (⚙️ Project settings), và xác nhận Firestore Database đã được tạo (Bước 2 DEPLOY.md).",
    };
  }
  return {
    id: "firestore-read", status: "warn", label: "Kết nối Firestore",
    message: `Không đọc được dữ liệu từ Firestore, không xác định chắc chắn nguyên nhân (mã lỗi: ${code || "không có"}). Chi tiết gốc: ${msg}`,
    fix: "Kiểm tra lần lượt: (1) Firestore Database đã bật chưa, (2) firestore.rules đã deploy chưa, (3) firebase-config.js đúng chưa, (4) kết nối mạng của thiết bị.",
  };
}

function classifyAuthProbeError(err) {
  const code = err && err.code;
  if (code === "auth/operation-not-allowed") {
    return {
      id: "auth-provider", status: "fail", label: "Đăng nhập Email/Mật khẩu",
      message: "Provider Email/Password chưa được bật trong Firebase Authentication.",
      fix: "Vào Firebase Console → Build → Authentication → tab \"Sign-in method\" → bật \"Email/Password\" (Bước 3 DEPLOY.md).",
    };
  }
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(code)) {
    return {
      id: "auth-provider", status: "ok", label: "Đăng nhập Email/Mật khẩu",
      message: "Provider Email/Password đang hoạt động (thử đăng nhập bằng tài khoản giả bị từ chối đúng như mong đợi, không phải do provider tắt).",
    };
  }
  if (code === "auth/network-request-failed") {
    return {
      id: "auth-provider", status: "warn", label: "Đăng nhập Email/Mật khẩu",
      message: "Không kiểm tra được do lỗi mạng khi gọi Authentication.",
      fix: "Kiểm tra kết nối mạng của thiết bị rồi tải lại trang.",
    };
  }
  return {
    id: "auth-provider", status: "warn", label: "Đăng nhập Email/Mật khẩu",
    message: `Không xác định chắc chắn được trạng thái Authentication (mã lỗi: ${code || "không có"}${err && err.message ? ": " + err.message : ""}).`,
    fix: "Kiểm tra thủ công trong Firebase Console → Authentication → Sign-in method xem \"Email/Password\" đã bật chưa.",
  };
}

/**
 * Chuỗi kiểm tra "tiền bay" cho trang admin, chạy TRƯỚC khi biết trạng thái
 * đăng nhập (không cần tài khoản): (1) config còn placeholder "PASTE_" không,
 * (2) đọc được dữ liệu công khai từ Firestore không (settings/global — luôn
 * cho phép đọc theo firestore.rules mục 7 ARCHITECTURE.md), (3) provider
 * Email/Password của Firebase Auth có đang bật không.
 * @returns {Promise<{ok:boolean, checks: Array<{id:string,status:"ok"|"fail"|"warn",label:string,message:string,fix?:string}>}>}
 */
export async function runPreflight() {
  const checks = [];

  const placeholders = configPlaceholderFields();
  if (placeholders.length > 0) {
    checks.push({
      id: "config", status: "fail", label: "Cấu hình Firebase",
      message: `firebase-config.js còn giá trị mẫu ở: ${placeholders.join(", ")}.`,
      fix: "Mở public/assets/js/firebase-config.js, dán đúng giá trị thật lấy từ Firebase Console (⚙️ Project settings → Your apps) đè lên các chữ \"PASTE_...\", lưu file rồi tải lại trang này.",
    });
    return { ok: false, checks };
  }
  checks.push({ id: "config", status: "ok", label: "Cấu hình Firebase", message: "Đã điền đủ, không còn giá trị mẫu." });

  let fb;
  try {
    fb = await loadFirebase();
  } catch (err) {
    checks.push({
      id: "sdk", status: "fail", label: "Tải Firebase SDK",
      message: "Không tải được thư viện Firebase từ CDN (www.gstatic.com) — có thể do mất mạng hoặc bị chặn.",
      fix: "Kiểm tra kết nối Internet của thiết bị đang mở trang admin, và không có tường lửa/trình chặn quảng cáo nào chặn *.gstatic.com.",
    });
    return { ok: false, checks };
  }

  try {
    const { doc, getDoc } = fb.mods.firestore;
    await getDoc(doc(fb.db, "settings", "global"));
    checks.push({ id: "firestore-read", status: "ok", label: "Đọc Firestore", message: "Đọc được dữ liệu công khai từ Firestore." });
  } catch (err) {
    checks.push(classifyFirestoreReadError(err));
    return { ok: false, checks }; // các bước sau cần đọc được Firestore trước
  }

  try {
    const { signInWithEmailAndPassword } = fb.mods.auth;
    await signInWithEmailAndPassword(
      fb.auth,
      "__hbt_preflight_probe__@example.invalid",
      "hbt-preflight-probe-000000"
    );
    // Không có khả năng đăng nhập thật sự thành công (tài khoản không tồn
    // tại) — nếu tới được đây coi như bất thường, nhưng vẫn báo "ok" vì rõ
    // ràng provider không chặn với lý do "operation-not-allowed".
    checks.push({ id: "auth-provider", status: "ok", label: "Đăng nhập Email/Mật khẩu", message: "Provider Email/Password đang hoạt động." });
  } catch (err) {
    checks.push(classifyAuthProbeError(err));
  }

  const anyFail = checks.some((c) => c.status === "fail");
  return { ok: !anyFail, checks };
}

/**
 * Kiểm tra quyền GHI Firestore — chỉ có ý nghĩa SAU KHI signIn() thành công.
 * Ghi rồi xoá ngay 1 doc dò ở collection `_diagnostics` (KHÔNG thuộc mô hình
 * dữ liệu thật mô tả ở ARCHITECTURE.md mục 2, không đụng settings/menu/themes
 * thật) — rơi vào rule mặc định `match /{document=**}` (đọc công khai, ghi
 * cần đăng nhập), đúng loại quyền cần kiểm tra mà không có tác dụng phụ nào
 * lên dữ liệu hiển thị thật.
 * @returns {Promise<{id:string,status:"ok"|"fail"|"warn",label:string,message:string,fix?:string}>}
 */
export async function checkWritePermission() {
  if (DEMO) {
    return { id: "firestore-write", status: "ok", label: "Quyền ghi Firestore", message: "Chế độ DEMO — không áp dụng." };
  }
  try {
    const { db, mods } = await loadFirebase();
    const { doc, setDoc, deleteDoc, serverTimestamp } = mods.firestore;
    const ref = doc(db, "_diagnostics", "preflightWriteProbe");
    await setDoc(ref, { checkedAt: serverTimestamp() }, { merge: true });
    try {
      await deleteDoc(ref);
    } catch (e) {
      /* dọn dẹp doc dò thất bại không quan trọng — không ảnh hưởng kết quả kiểm tra */
    }
    return { id: "firestore-write", status: "ok", label: "Quyền ghi Firestore", message: "Đăng nhập và ghi được dữ liệu — rules bảo mật hoạt động đúng." };
  } catch (err) {
    const code = err && err.code;
    if (code === "permission-denied") {
      return {
        id: "firestore-write", status: "fail", label: "Quyền ghi Firestore",
        message: "Đã đăng nhập nhưng Firestore vẫn từ chối quyền ghi (permission-denied) — rules đã deploy nhưng đang chặn nhầm tài khoản đã đăng nhập.",
        fix: "So sánh nội dung firestore.rules đã deploy (Firebase Console → Firestore Database → Rules) với file firestore.rules trong dự án, sửa cho khớp rồi chạy lại `firebase deploy --only firestore:rules`.",
      };
    }
    return {
      id: "firestore-write", status: "warn", label: "Quyền ghi Firestore",
      message: `Không xác nhận được quyền ghi (mã lỗi: ${code || "không có"}${err && err.message ? ": " + err.message : ""}).`,
      fix: "Thử lưu 1 thay đổi bất kỳ (vd đổi theme ở tab Giao diện) để kiểm tra thực tế; nếu lỗi lặp lại, kiểm tra lại firestore.rules.",
    };
  }
}
