// =============================================================================
// effects.js — Hệ thống hạt (particle) chạy nền trên <canvas id="fx">
// -----------------------------------------------------------------------------
// Xuất ra: startParticles(canvas, type, level), stopParticles()
// Các loại: snow, petals (hoa anh đào), embers, fireworks, leaves, bubbles, none
//
// Yêu cầu: nhẹ CPU (chạy 24/7 trên trình phát media giá rẻ), giới hạn số lượng
// hạt theo `level` ("full" | "lite" | "off"), tôn trọng devicePixelRatio, tự
// tạm dừng khi tab ẩn (visibilitychange), dọn dẹp requestAnimationFrame khi
// stop(). Chỉ vẽ trên canvas — không thao tác DOM khác, không chặn main thread.
// =============================================================================

/** Giới hạn số hạt tối đa theo mức hiệu ứng */
const CAPS = {
  full: 70,
  lite: 28,
  off: 0,
};

// ---------------------------------------------------------------------------
// Giới hạn tải cho SoC yếu chạy 24/7 trên màn hình signage 4K (Cortex-A55,
// GPU tối thiểu) — xem ghi chú "PHẦN CỨNG THẬT" ở đầu file.
// ---------------------------------------------------------------------------

/** Kích thước bộ đệm canvas (pixel thật) tối đa, bất kể viewport/DPR báo cáo
 * là bao nhiêu. Hạt là các hình mờ/mềm (chấm tuyết, cánh hoa, tia lửa…) nên
 * phóng to bộ đệm nhỏ lên bằng CSS không lộ răng cưa — nhưng vẽ 4K (3840x2160)
 * mỗi khung hình, mãi mãi, thì SoC yếu không chịu nổi. */
const MAX_BACKING_W = 1920;
const MAX_BACKING_H = 1080;

/** Giới hạn khung hình/giây — hạt không cần mượt 60fps, 30fps đã đủ mắt
 * thường không phân biệt được, mà giảm ~một nửa số lần step()+draw() mỗi
 * giây, đỡ tải CPU/GPU đáng kể khi chạy liên tục nhiều tuần. */
const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

/** Viewport CSS rộng hơn ngưỡng này (vd WebView bỏ qua <meta viewport>, trả
 * về 3840 CSS px thay vì 1920) thì giảm bớt số hạt "full" — ưu tiên hiệu năng
 * hơn mật độ hạt tối đa trên màn 4K chạy 24/7. */
const LARGE_VIEWPORT_CSS_WIDTH = 2400;
const LARGE_VIEWPORT_CAP_SCALE = 0.6;

function scaleCapForViewport(baseCap, cssWidth) {
  if (cssWidth > LARGE_VIEWPORT_CSS_WIDTH) {
    return Math.max(8, Math.round(baseCap * LARGE_VIEWPORT_CAP_SCALE));
  }
  return baseCap;
}

/** Trạng thái module — chỉ một hệ hạt chạy tại một thời điểm (đúng theo hợp đồng 1 canvas #fx) */
let state = null;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Đọc màu nhấn từ theme hiện tại (biến CSS --accent trên phần tử cha) để hạt
 * hoà hợp với bảng màu, có màu mặc định dự phòng nếu không đọc được.
 */
function themeColor(canvas, varName, fallback) {
  try {
    const v = getComputedStyle(canvas.parentElement || canvas)
      .getPropertyValue(varName)
      .trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Bộ khởi tạo hạt theo từng loại hiệu ứng — mỗi hàm trả về 1 object hạt mới
// ---------------------------------------------------------------------------

function makeSnow(w, h) {
  return {
    x: rand(0, w),
    y: rand(-h, 0),
    r: rand(1.5, 4),
    vy: rand(18, 45),
    vx: rand(-8, 8),
    sway: rand(0, Math.PI * 2),
    swaySpeed: rand(0.4, 1.1),
    alpha: rand(.5, .95),
  };
}

function makePetals(w, h) {
  return {
    x: rand(0, w),
    y: rand(-h, 0),
    size: rand(6, 14),
    vy: rand(14, 32),
    vx: rand(-14, 14),
    rot: rand(0, Math.PI * 2),
    vr: rand(-1, 1),
    sway: rand(0, Math.PI * 2),
    swaySpeed: rand(.3, .8),
    alpha: rand(.6, .95),
  };
}

function makeEmbers(w, h) {
  return {
    x: rand(0, w),
    y: h + rand(0, 40),
    r: rand(1, 3),
    vy: rand(-40, -18),
    vx: rand(-6, 6),
    life: 0,
    maxLife: rand(3, 7),
    flicker: rand(0, Math.PI * 2),
  };
}

function makeLeaves(w, h) {
  return {
    x: rand(0, w),
    y: rand(-h, 0),
    size: rand(7, 15),
    vy: rand(16, 34),
    vx: rand(-10, 10),
    rot: rand(0, Math.PI * 2),
    vr: rand(-1.4, 1.4),
    sway: rand(0, Math.PI * 2),
    swaySpeed: rand(.3, .7),
    alpha: rand(.55, .9),
  };
}

function makeBubbles(w, h) {
  return {
    x: rand(0, w),
    y: h + rand(0, 40),
    r: rand(3, 9),
    vy: rand(-26, -10),
    vx: rand(-6, 6),
    wobble: rand(0, Math.PI * 2),
    wobbleSpeed: rand(.5, 1.2),
    alpha: rand(.25, .55),
  };
}

// Pháo hoa: quản lý theo "burst" thay vì hạt rơi liên tục
function makeFireworkBurst(w, h, color) {
  const cx = rand(w * .15, w * .85);
  const cy = rand(h * .15, h * .55);
  const count = 22;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rand(-.15, .15);
    const speed = rand(40, 110);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: rand(0.9, 1.6),
      color,
    });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// startParticles / stopParticles
// ---------------------------------------------------------------------------

export function startParticles(canvas, type, level) {
  stopParticles();

  if (!canvas || !type || type === "none" || level === "off") {
    return;
  }

  const cap = CAPS[level] ?? CAPS.lite;
  if (cap <= 0) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const s = {
    canvas,
    ctx,
    type,
    level,
    cap,
    particles: [],
    rafId: null,
    lastT: performance.now(),
    lastDrawT: performance.now(),
    running: true,
    bufScale: 1, // tỉ lệ bộ đệm canvas / kích thước CSS thật — xem resize()
    w: 0,
    h: 0,
    spawnAcc: 0,
    fireworkAcc: 0,
    onVisibility: null,
    onResize: null,
  };
  state = s;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    s.w = Math.max(1, rect.width || window.innerWidth);
    s.h = Math.max(1, rect.height || window.innerHeight);
    const rawDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    // Chặn bộ đệm canvas ở tối đa ~1920x1080 dù DPR/viewport báo cáo lớn hơn
    // (vd 4K, hoặc WebView bỏ qua <meta viewport>) — CSS vẫn kéo giãn canvas
    // lấp đầy màn hình (#fx có width/height:100%), chỉ số pixel THẬT phải vẽ
    // mỗi khung hình là bị giới hạn. Xem ghi chú MAX_BACKING_W/H đầu file.
    s.bufScale = Math.max(0.1, Math.min(rawDpr, MAX_BACKING_W / s.w, MAX_BACKING_H / s.h));
    canvas.width = Math.round(s.w * s.bufScale);
    canvas.height = Math.round(s.h * s.bufScale);
    ctx.setTransform(s.bufScale, 0, 0, s.bufScale, 0, 0);
    // Viewport càng rộng (vd 3840 CSS px khi WebView bỏ qua meta viewport) thì
    // càng giảm số hạt "full" — xem ghi chú LARGE_VIEWPORT_* đầu file.
    s.cap = scaleCapForViewport(cap, s.w);
  }
  resize();
  s.onResize = resize;
  window.addEventListener("resize", s.onResize);

  // Mồi sẵn một phần hạt để không bị "trống" lúc mới bật (trừ pháo hoa — nổ theo nhịp)
  if (type !== "fireworks") {
    const factory = factoryFor(type);
    if (factory) {
      for (let i = 0; i < s.cap; i++) {
        const p = factory(s.w, s.h);
        p.y = rand(0, s.h); // rải đều ban đầu thay vì tất cả ở mép
        s.particles.push(p);
      }
    }
  } else {
    s.color1 = themeColor(canvas, "--accent", "#ffb703");
    s.color2 = themeColor(canvas, "--price", "#ff6b6b");
  }

  s.onVisibility = () => {
    s.running = document.visibilityState === "visible";
    if (s.running) s.lastT = performance.now();
  };
  document.addEventListener("visibilitychange", s.onVisibility);

  function frame(t) {
    s.rafId = requestAnimationFrame(frame);
    if (!s.running) { s.lastT = t; s.lastDrawT = t; return; }
    // Giữ nhịp ~30fps: bỏ qua khung hình nếu chưa đủ FRAME_INTERVAL_MS kể từ
    // lần vẽ trước, thay vì step()+draw() ở đủ 60fps của rAF. dt vật lý vẫn
    // tính theo thời gian THẬT trôi qua nên tốc độ hạt không đổi khi bỏ khung.
    if (t - s.lastDrawT < FRAME_INTERVAL_MS) return;
    s.lastDrawT = t;
    const dt = Math.min(0.05, (t - s.lastT) / 1000); // giới hạn dt tránh nhảy khi tab quay lại
    s.lastT = t;
    step(s, dt);
    draw(s);
  }
  s.rafId = requestAnimationFrame(frame);
}

export function stopParticles() {
  if (!state) return;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  if (state.onVisibility) document.removeEventListener("visibilitychange", state.onVisibility);
  if (state.onResize) window.removeEventListener("resize", state.onResize);
  const { ctx, canvas } = state;
  try {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  } catch (e) { /* canvas có thể đã bị gỡ khỏi DOM — bỏ qua */ }
  state = null;
}

function factoryFor(type) {
  switch (type) {
    case "snow": return makeSnow;
    case "petals": return makePetals;
    case "embers": return makeEmbers;
    case "leaves": return makeLeaves;
    case "bubbles": return makeBubbles;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Cập nhật vật lý theo từng loại
// ---------------------------------------------------------------------------

function step(s, dt) {
  const { w, h } = s;

  if (s.type === "fireworks") {
    stepFireworks(s, dt);
    return;
  }

  const factory = factoryFor(s.type);
  for (const p of s.particles) {
    switch (s.type) {
      case "snow":
        p.sway += p.swaySpeed * dt;
        p.x += (p.vx + Math.sin(p.sway) * 12) * dt;
        p.y += p.vy * dt;
        break;
      case "petals":
        p.sway += p.swaySpeed * dt;
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.sway) * 18) * dt;
        p.y += p.vy * dt;
        break;
      case "leaves":
        p.sway += p.swaySpeed * dt;
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.sway) * 16) * dt;
        p.y += p.vy * dt;
        break;
      case "embers":
        p.flicker += dt * 6;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        break;
      case "bubbles":
        p.wobble += p.wobbleSpeed * dt;
        p.x += (p.vx + Math.sin(p.wobble) * 10) * dt;
        p.y += p.vy * dt;
        break;
    }

    // Tái sinh hạt khi ra khỏi khung hình (hoặc hết đời với embers)
    const outOfBounds =
      p.y > h + 20 || p.y < -40 || p.x < -40 || p.x > w + 40 ||
      (s.type === "embers" && p.life > p.maxLife);
    if (outOfBounds && factory) {
      Object.assign(p, factory(w, h));
      if (s.type === "snow" || s.type === "petals" || s.type === "leaves") {
        p.y = -20; // rơi từ trên xuống liên tục
      }
    }
  }
}

function stepFireworks(s, dt) {
  s.fireworkAcc += dt;
  // Cứ khoảng 2.2-3.6s bắn 1 chùm mới, miễn còn dưới ngưỡng hạt cho phép
  const totalParticles = s.particles.reduce((n, burst) => n + burst.length, 0);
  if (s.fireworkAcc > rand(2.2, 3.6) && totalParticles < s.cap) {
    s.fireworkAcc = 0;
    const color = Math.random() < 0.5 ? s.color1 : s.color2;
    s.particles.push(makeFireworkBurst(s.w, s.h, color));
  }
  for (const burst of s.particles) {
    for (const p of burst) {
      p.life += dt;
      p.vy += 60 * dt; // trọng lực nhẹ
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  // Loại bỏ các chùm đã tàn hoàn toàn
  s.particles = s.particles.filter((burst) => burst.some((p) => p.life < p.maxLife));
}

// ---------------------------------------------------------------------------
// Vẽ
// ---------------------------------------------------------------------------

function draw(s) {
  const { ctx, w, h } = s;
  ctx.clearRect(0, 0, w, h);

  if (s.type === "fireworks") {
    drawFireworks(s);
    return;
  }

  ctx.save();
  for (const p of s.particles) {
    switch (s.type) {
      case "snow":
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "petals":
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#ffb7c5";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * .55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case "leaves":
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#d97b29";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * .6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case "embers": {
        const flick = (Math.sin(p.flicker) + 1) / 2;
        const fade = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, fade * (.5 + flick * .5));
        ctx.fillStyle = "#ff8c42";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "bubbles":
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFireworks(s) {
  const { ctx } = s;
  ctx.save();
  for (const burst of s.particles) {
    for (const p of burst) {
      const fade = Math.max(0, 1 - p.life / p.maxLife);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
