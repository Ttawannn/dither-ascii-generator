# Dither / ASCII Generator — แผนพัฒนา

เว็บแอปที่แปลงภาพ วิดีโอ และเว็บแคมเป็นภาพ **dither** และ **ASCII art** แบบเรียลไทม์
แนวทาง: งาน dither ที่รองรับแอนิเมชันและเล่นวิดีโอได้ และงาน ASCII art ที่มีสไตล์
รันในเบราว์เซอร์ล้วน ไม่มี backend → deploy บน **GitHub Pages** ได้ฟรี

---

## 1. เป้าหมาย

| ต้องมี (MVP) | ทำทีหลัง |
|---|---|
| อัปโหลดภาพ / ลากวาง / วางจากคลิปบอร์ด | โหมดเลเยอร์ซ้อนกันหลายเอฟเฟกต์ |
| Dither หลายอัลกอริทึม + พาเลตสี | แก้ palette เองแบบละเอียด / import .hex .gpl |
| ASCII หลายชุดตัวอักษร + โหมดสี | ใส่ฟอนต์เอง (.ttf) |
| พรีวิวเรียลไทม์ขณะเลื่อนสไลเดอร์ | PWA ใช้งานออฟไลน์ |
| วิดีโอ + เว็บแคม | Timeline / keyframe แอนิเมชันพารามิเตอร์ |
| Export PNG / TXT / GIF / WebM | Export MP4 (WebCodecs) |
| UI ดำ minimal | แชร์ preset ผ่าน URL |

---

## 2. Tech stack

- **Vite + TypeScript** (vanilla ไม่ใช้ framework) — เบา build เป็น static ไฟล์
- **WebGL2 (fragment shader)** — สำหรับ ordered dither (Bayer, blue noise, halftone) และ ASCII → เร็วพอสำหรับวิดีโอ 60fps
- **Canvas 2D + Web Worker** — สำหรับ error-diffusion (Floyd–Steinberg, Atkinson ฯลฯ) ซึ่งต้องคำนวณทีละพิกเซลตามลำดับ ใช้ shader ไม่ได้
- **gifenc** — export GIF, **MediaRecorder** — export WebM, (ภายหลัง) **WebCodecs + mp4-muxer** — export MP4
- **GitHub Actions** → build แล้ว deploy ไป GitHub Pages อัตโนมัติทุกครั้งที่ push `main`

---

## 3. Pipeline การประมวลผล

```
Source (ภาพ / วิดีโอ / เว็บแคม)
   → Resize / pixel scale (ความละเอียดของ dither หรือจำนวนคอลัมน์ ASCII)
   → Pre-adjust: brightness, contrast, gamma, saturation, sharpen, invert, threshold
   → Effect: [Dither] หรือ [ASCII]
   → Post: scale ขึ้นแบบ nearest-neighbor, สีพื้น/สีหมึก, glow (optional)
   → Output canvas → Export
```

### 3.1 Dither
- **Ordered:** Bayer 2×2 / 4×4 / 8×8, Blue noise, Halftone (dot / line), Crosshatch
- **Error diffusion:** Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra (3 แบบ)
- **อื่น ๆ:** Threshold, Random noise
- **ตัวเลือก:** serpentine scan, diffusion strength, pixel size
- **พาเลต:** 1-bit B/W, Grayscale 2–16 ระดับ, Game Boy, CGA, PICO-8, Mac Classic, Duotone (เลือก 2 สีเอง), พาเลตกำหนดเอง, ดึงพาเลตจากภาพ (median cut)

### 3.2 ASCII
- **ชุดตัวอักษร:** Standard ` .:-=+*#%@`, Detailed (70 ตัว), Blocks `░▒▓█`, Braille (ละเอียด 2×4 ต่อตัวอักษร), Binary `01`, Custom
- **วิธี map:** ตามความสว่าง, ตามทิศขอบ (edge → `/ \ | _`)
- **โหมดสี:** ขาวดำ, สีเดียว (เขียว terminal / อำพัน), สีจากภาพเต็ม, สีพื้นต่อเซลล์
- **ตัวเลือก:** จำนวนคอลัมน์, ฟอนต์ monospace, line-height, invert, เปิด dither ก่อน map ได้ (ASCII + dither รวมกัน)
- **วิธี render บน GPU:** สร้าง glyph atlas texture จากฟอนต์ → shader เลือก glyph ตามความสว่างของแต่ละเซลล์

### 3.3 วิดีโอ / แอนิเมชัน
- โหลดไฟล์วิดีโอ, เปิดเว็บแคม (`getUserMedia`)
- ใช้ `requestVideoFrameCallback` ประมวลผลทุกเฟรม, ปุ่ม play/pause/scrub/loop
- โหมดแอนิเมชันง่าย ๆ: ให้ threshold/noise seed ขยับตามเวลา (เอฟเฟกต์ "boil")

### 3.4 Export
- **PNG** (เลือกขนาด 1×/2×/4×), **SVG** (สำหรับ 1-bit)
- **TXT / HTML** (ASCII พร้อมสี), คัดลอกไปคลิปบอร์ด
- **GIF / WebM** จากวิดีโอหรือแอนิเมชัน (ภายหลัง: MP4)

---

## 4. UI — ดำ minimal

```
┌──────────────────────────────────────────────┬──────────────┐
│ DITHER/ASCII            [Dither] [ASCII]     │  SOURCE      │
├──────────────────────────────────────────────┤  ▸ Upload    │
│                                              │  ▸ Webcam    │
│                                              │──────────────│
│              พรีวิว (canvas)                 │  ADJUST      │
│         ลากไฟล์มาวางได้ทั้งพื้นที่             │  Brightness ─│
│                                              │  Contrast  ──│
│                                              │──────────────│
│                                              │  EFFECT      │
│                                              │  Algorithm ▾ │
├──────────────────────────────────────────────┤  Palette   ▾ │
│ ▶ ━━━━━━━●━━━━━━━  00:04 / 00:12   100%  ⤢   │──────────────│
└──────────────────────────────────────────────┤  [ EXPORT ]  │
                                               └──────────────┘
```

- **สี:** พื้น `#0a0a0a`, panel `#111`, เส้นขอบ `#222` 1px, ตัวอักษร `#e5e5e5` / `#777`, accent ขาวล้วน
- **ฟอนต์:** JetBrains Mono หรือ IBM Plex Mono ทั้งหน้า, label ตัวพิมพ์ใหญ่ ขนาดเล็ก, letter-spacing กว้าง
- **คอนโทรล:** สไลเดอร์เส้นบาง 1px, ไม่มีเงา ไม่มีมุมโค้งมาก ไม่มี gradient
- **การใช้งาน:** ดับเบิลคลิกสไลเดอร์ = รีเซ็ต, กดค้าง `Space` = ดูภาพต้นฉบับ, zoom/pan บนพรีวิว, จำค่าล่าสุดใน localStorage
- **มือถือ:** panel ย้ายไปเป็น bottom sheet

---

## 5. โครงสร้างโปรเจกต์

```
dither-ascii-generator/
├─ index.html
├─ src/
│  ├─ main.ts              # เริ่มแอป, ผูก UI กับ pipeline
│  ├─ state.ts             # ค่าพารามิเตอร์ทั้งหมด + preset + localStorage
│  ├─ ui/                  # panel, slider, select, dropzone, transport bar
│  ├─ source/              # image, video, webcam loader
│  ├─ pipeline/
│  │  ├─ gl.ts             # WebGL2 setup, render pass
│  │  ├─ adjust.frag       # pre-adjust shader
│  │  ├─ ordered.frag      # Bayer / blue noise / halftone
│  │  ├─ ascii.frag        # ASCII ด้วย glyph atlas
│  │  ├─ diffusion.worker.ts  # error diffusion (CPU)
│  │  └─ palettes.ts
│  ├─ export/              # png, svg, txt, gif, webm
│  └─ styles.css
├─ public/                 # blue-noise texture, ภาพตัวอย่าง
└─ .github/workflows/deploy.yml
```

---

## 6. ลำดับการทำงาน

| เฟส | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| **0. Setup** | Vite + TS, ESLint, workflow deploy GitHub Pages | หน้าเปล่าดำขึ้นที่ `https://<user>.github.io/dither-ascii-generator/` |
| **1. UI shell + ภาพ** | layout ดำ, dropzone, panel, โหลดภาพแสดงบน canvas, pre-adjust shader | ปรับ brightness/contrast แล้วเห็นผลทันที |
| **2. Dither** | ordered dither ใน shader, error diffusion ใน worker, พาเลต | สลับอัลกอริทึม/พาเลตได้ลื่น ภาพ 2K ไม่ค้าง |
| **3. ASCII** | glyph atlas, ascii shader, ชุดตัวอักษร, โหมดสี, export TXT | ภาพ → ASCII สีและขาวดำ คัดลอกเป็นข้อความได้ |
| **4. วิดีโอ + เว็บแคม** | video source, transport bar, แอนิเมชัน boil | เล่นวิดีโอพร้อม dither/ASCII เรียลไทม์ ≥ 30fps |
| **5. Export** | PNG/SVG/TXT/HTML/GIF/WebM | ไฟล์ทุกแบบเปิดดูได้ถูกต้อง |
| **6. Polish** | preset, คีย์ลัด, มือถือ, ภาพตัวอย่าง, README | ใช้งานบนมือถือได้, README มีภาพหน้าจอ |

> หมายเหตุ: error diffusion บนวิดีโอความละเอียดสูงจะช้า → ใน worker จะลดความละเอียดอัตโนมัติขณะเล่น แล้วคำนวณเต็มตอน export

---

## 7. Deploy บน GitHub

1. `git init` แล้วสร้าง repo `dither-ascii-generator` บน GitHub
2. ตั้ง `base: '/dither-ascii-generator/'` ใน `vite.config.ts`
3. ใส่ `.github/workflows/deploy.yml` (actions/upload-pages-artifact + deploy-pages)
4. ใน repo → Settings → Pages → Source: **GitHub Actions**
5. push `main` → ได้เว็บที่ `https://<user>.github.io/dither-ascii-generator/`

---

## 8. คำถามที่ควรตัดสินใจก่อนเริ่ม

- ชื่อแอป / ชื่อ repo
- ต้องการ export **MP4** ตั้งแต่แรกไหม (เพิ่มงานราว 1 เฟส) หรือ WebM พอ
- ต้องรองรับมือถือเต็มรูปแบบตั้งแต่ MVP หรือเน้นเดสก์ท็อปก่อน
