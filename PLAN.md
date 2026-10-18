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

### สถานะ (2026-10-17)

ทำครบทั้ง 6 เฟสแล้ว และขึ้นเว็บอยู่ที่ https://ttawannn.github.io/dither-ascii-generator/

ส่วนที่ต่างจากแผนเดิม:
- **ทำเพิ่มจากแผน:** export MP4 (ใช้ WebCodecs ผ่าน mediabunny) และแชร์ preset ผ่าน URL ซึ่งเดิมอยู่ในหมวด "ทำทีหลัง"
- **ยังไม่ได้ทำ:** ESLint (ตอนนี้ใช้แค่ `tsc` type-check), การลดความละเอียดอัตโนมัติตอนเล่นวิดีโอ (ตอนนี้ใช้วิธีข้ามเฟรมที่ค้างคิวแทน)
- **ยังเหลือในหมวด "ทำทีหลัง":** เลเยอร์ซ้อนเอฟเฟกต์, import พาเลต .hex/.gpl, ฟอนต์ .ttf ของผู้ใช้, PWA ใช้งานออฟไลน์, timeline/keyframe

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

---

## 9. เฟส 7–9 — ต่อยอดโหมด ASCII, เอฟเฟกต์ และแอนิเมชัน

เป้าหมาย: ทำโหมด ASCII ให้ครบเครื่อง เพิ่มเอฟเฟกต์ post-processing และให้ค่าต่าง ๆ ขยับตามเวลาได้

### ฟีเจอร์เป้าหมาย

| ฟีเจอร์ | ของเราตอนนี้ | ทำในเฟส |
|---|---|---|
| ชุดตัวอักษร 48 ชุดใน 11 หมวด | มี 6 ชุด | 7 |
| พรีวิว glyph ของทุกชุด | ไม่มี | 7 |
| ปรับ character depth และ cell size | มี cell size (ฟอนต์/คอลัมน์) ยังไม่มี depth | 7 |
| แทรกตัวอักษรเองได้สูงสุด 10 ตัว | มี custom ramp แต่ใช้แทนทั้งชุด | 7 |
| Character offset (เลื่อนการจับคู่ความสว่าง → ตัวอักษร) | ไม่มี | 7 |
| สีตัวอักษรตามพาเลต หรือสีเดียว | มีสีเดียว / สีจากภาพ ยังไม่มีตามพาเลต | 7 |
| พื้นหลังโปร่งใสหรือกำหนดสีเอง | มีแค่กำหนดสีเอง | 7 |
| Animate ค่า depth และ offset | มีแค่ boil แบบสุ่ม | 7 (depth/offset), 9 (ทุกค่า) |
| รองรับภาพ วิดีโอ แอนิเมชัน | มีครบ (+ เว็บแคม) | — |
| บันทึก/โหลด preset | มีแล้ว (+ ลิงก์แชร์) | — |
| เอฟเฟกต์ post-processing (glow, chromatic aberration, JPEG glitch ฯลฯ) | ไม่มี | 8 |
| Export ข้อความเป็น .txt | มีแล้ว (+ .html, คัดลอก) | — |
| ธีม UI ทางเลือกโทนกระดาษ (parchment) | UI ดำ minimal | 9 |

### ลำดับงาน

| เฟส | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| **7. ASCII Pro** | คลังชุดตัวอักษร ~48 ชุดใน 11 หมวด (ASCII, ตัวเลข, สัญลักษณ์, บล็อก, box drawing, Braille, รูปเรขาคณิต, ภาษาต่าง ๆ เช่น คาตาคานะ/กรีก/อักษรรูน (ไม่รวมภาษาไทย), ไพ่, unicode อื่น ๆ) · **เรียงความทึบอัตโนมัติ** โดยวัดพื้นที่หมึกของแต่ละ glyph จาก atlas จึงใช้ชุดไหนก็ได้ · ตัวเลือกชุดแบบแยกหมวดพร้อมพรีวิว glyph · slider **Depth** (จำนวนระดับที่ใช้) และ **Offset** · แทรกตัวอักษรเองได้ 10 ตัว · สีตามพาเลต (ใช้พาเลตเดียวกับโหมด Dither) · พื้นหลังโปร่งใส (PNG/SVG/GIF และ WebM ถ้า browser encode alpha ได้) · ให้ depth/offset ขยับเองได้ (LFO: sine/saw, ความเร็ว, ความกว้าง) | สลับครบทุกชุดได้โดย glyph ไม่หาย · ชุดที่ไม่ใช่ละตินเรียงจากโปร่งไปทึบถูกต้อง · export PNG แล้วพื้นหลังโปร่งใสจริง |
| **8. Post-effects** | สแต็กเอฟเฟกต์หลังขั้น Dither/ASCII เปิด/ปิด/เรียงลำดับได้: glow/bloom, chromatic aberration, scanlines/CRT, JPEG glitch, vignette, film grain · ทำเป็น GPU pass ต่อจากผลลัพธ์ จึงใช้ได้กับทั้งสองโหมดและทุก export | เปิดหลายเอฟเฟกต์พร้อมกันแล้ววิดีโอยังเล่นลื่น · ไฟล์ export มีเอฟเฟกต์ครบ · preset/ลิงก์แชร์เก็บสแต็กไว้ได้ |
| **9. Animation & theme** | Animate slider ไหนก็ได้ด้วย LFO หรือ keyframe บน timeline ง่าย ๆ (ต่อยอดจาก LFO ของเฟส 7) · ธีม UI ทางเลือกโทนกระดาษ parchment + ฟอนต์หัวเรื่อง blackletter ทำเอง สลับกับธีมดำได้ (ธีมดำยังเป็นค่าเริ่มต้น) | ตั้ง keyframe 2 จุดแล้ว export GIF/MP4 ได้ภาพที่ค่าเปลี่ยนตามเวลา · สลับธีมได้โดยไม่ต้องโหลดหน้าใหม่ และจำค่าไว้ |

### หมายเหตุทางเทคนิค

- **glyph id เก็บใน alpha 8 บิต** (`ascii/grid.ts` → `ascii.frag`) จึงมีได้สูงสุด 256 glyph ต่อ atlas ซึ่งพอสำหรับ depth ≤ 64 + edge glyph แต่ Braille ใช้ครบ 256 แล้ว ถ้าจะแทรกตัวอักษรเพิ่มในชุด Braille ต้องขยายเป็น 2 channel
- **ฟอนต์สำหรับ glyph นอกละติน:** โหลด Noto (Symbols 2, Runic, JP ฯลฯ) จาก Google Fonts เฉพาะตอนเลือกชุดนั้น และตรวจว่า glyph วาดได้จริงก่อนใส่ใน ramp (ถ้าไม่มีในฟอนต์จะกลายเป็นกล่องว่าง)
- **พื้นหลังโปร่งใส:** ต้องเปิด `alpha: true` บน WebGL context และระวัง premultiplied alpha ตอน export · GIF รองรับแค่โปร่งใสแบบ 1 บิต · MP4 (H.264) ไม่รองรับ alpha · WebM (VP9) รองรับ alpha แต่การ encode ผ่าน WebCodecs ยังทำได้ไม่ทุก browser ต้องเช็กก่อนแล้วมีทางสำรอง
- **Post-effects:** ตอนนี้ pass สุดท้ายวาดลง canvas โดยตรง ต้อง refactor ให้วาดลง FBO ก่อนแล้วค่อยต่อด้วยสแต็กเอฟเฟกต์ → canvas การ export อ่านจาก canvas อยู่แล้วจึงได้เอฟเฟกต์ไปด้วยอัตโนมัติ
- **State:** param ใหม่ต้องผ่าน `sanitize()` (มี range/enum) และเข้ากลุ่ม key เพื่อให้ preset และลิงก์แชร์ใช้ได้ (ดู CLAUDE.md) · สแต็กเอฟเฟกต์และ keyframe เป็นข้อมูลแบบ list ต้องเพิ่ม validator ของตัวเอง

### สิ่งที่ตัดสินใจแล้ว (2026-10-17)

- **ธีม parchment ในเฟส 9: ทำ** เป็นธีมทางเลือก ธีมดำ minimal ยังเป็นค่าเริ่มต้น
- **ชุดตัวอักษรภาษาไทย: ไม่ทำ**
- **พื้นหลังโปร่งใส: รองรับแค่ PNG / SVG / GIF (1 บิต) และ WebM ใน browser ที่ encode alpha ได้** ส่วน MP4 ไม่รองรับ ให้ UI บอกผู้ใช้ตอนเลือก MP4

### สถานะเฟส 7 (2026-10-18): เสร็จแล้ว

- **ชุดตัวอักษร 48 ชุดใน 11 หมวด** เลือกจาก dropdown ที่แบ่งหมวด มีพรีวิวตัวอักษรที่ใช้จริงเรียงจากโปร่งไปทึบ
- **เรียงความทึบอัตโนมัติ:** วัดพื้นที่หมึกของแต่ละตัวตอนสร้าง atlas และตัดตัวที่วาดไม่ได้ (เทียบกับกล่อง "ไม่มี glyph") ทดสอบกับฟอนต์จริงแล้ว ทุกชุดวาดได้ครบ ยกเว้น `▏` ที่บางกว่า 1 พิกเซลที่ขนาด 12px
- **Depth / Offset / แทรกตัวอักษร 10 ตัว / เปิด-ปิดช่องว่าง** · Offset วนรอบเมื่อเกินปลาย ramp
- **สีตามพาเลต:** PICO-8, C64, CGA, Game Boy หรือดึง 8 สีจากภาพ
- **พื้นหลังโปร่งใส:** ตรวจจากไฟล์จริงแล้ว PNG มี alpha, GIF โปร่งใสทุกเฟรม, WebM (VP9) เก็บ alpha ได้ ถ้า browser ทำไม่ได้จะบันทึกพร้อมสีพื้นและแจ้งผู้ใช้, MP4 ใช้สีพื้นแทนและแจ้งในหน้า Export
- **LFO ของ Offset และ Depth** (sine / triangle / saw, ความเร็ว, ความแรง) ใช้กับภาพนิ่งเพื่อ export GIF/วิดีโอได้ด้วย
- **Preset ใหม่:** Runes, Glyph cycle, Bar chart · Matrix เปลี่ยนไปใช้คาตาคานะ
- ข้อจำกัดที่ยังอยู่: Depth / Offset / แทรกตัวอักษรใช้กับ Braille ไม่ได้ (Braille ใช้ glyph id ครบ 256 แล้ว)

### สถานะเฟส 8 (2026-10-18): เสร็จแล้ว

- **6 เอฟเฟกต์:** Glow, JPEG glitch, Chromatic aberration, Scanlines / CRT (มีความโค้งจอ), Vignette, Film grain
- เปิด/ปิดได้ทีละตัว และ **เรียงลำดับได้** ด้วยปุ่ม ↑ ↓ ลำดับมีผลกับภาพจริง
- ทำงานหลัง Dither หรือ ASCII ทุกโหมด รวม error diffusion ใน worker · ไม่ใช้กับมุมมอง Original
- Glitch กับ Grain ขยับตาม Boil · export ทุกแบบได้เอฟเฟกต์ด้วย · กู้คืนได้ครบหลัง GPU reset
- เอฟเฟกต์อยู่ใน preset และลิงก์แชร์ · preset ใหม่: CRT terminal, VHS glitch
- วิธีทำ: pass สุดท้ายของทุกโหมดวาดลง texture นอกจอ แล้ววนสลับ framebuffer 2 ตัวผ่าน `post.frag` ทีละเอฟเฟกต์ ตัวสุดท้ายวาดลง canvas ถ้าไม่เปิดเอฟเฟกต์เลยจะวาดลง canvas ตรงเหมือนเดิม

### สถานะเฟส 9 (2026-10-18): เสร็จแล้ว — ครบทุกเฟสในแผน

- **Animate ค่าใดก็ได้** (32 ค่าจาก Adjust, Dither, ASCII และ Effects) สูงสุด 8 ช่องพร้อมกัน แต่ละช่องเลือกได้ 2 แบบ:
  - **LFO:** รูปคลื่น ความเร็ว และระยะแกว่งรอบค่าของ slider
  - **Keyframes:** ค่าเริ่ม (From) → ค่าจบ (To) มีปุ่ม "Use current" · easing แบบ Linear / Ease in-out / Hold, then jump · loop แบบ Repeat / Ping-pong / Once · ตั้งความยาว timeline ได้ 1–30 วินาที
- ไม่รวม Font size กับ Line height เพราะเปลี่ยนแล้วต้องสร้าง glyph atlas ใหม่ทุกเฟรม
- ภาพนิ่งที่มีการ animate export เป็น GIF / WebM / MP4 ได้ · ตรวจแล้ว: ตั้ง keyframe Brightness −80 → 80 แล้ว export 4 วินาที ความสว่างเฉลี่ยไล่จาก 2 → 136 → 251
- การ animate อยู่ใน preset และลิงก์แชร์ (เก็บเป็น JSON ใน param `animLanes` ผ่าน `sanitize()`)
- **ธีม Parchment:** ปุ่ม ◐ ที่หัวหน้า หรือกด `T` สลับได้ทันทีโดยไม่โหลดหน้าใหม่ และจำไว้ในเบราว์เซอร์ (ไม่อยู่ใน preset หรือลิงก์แชร์) ใช้ฟอนต์ blackletter "Grenze Gotisch" เฉพาะโลโก้และหัวข้อ ธีมดำยังเป็นค่าเริ่มต้น
