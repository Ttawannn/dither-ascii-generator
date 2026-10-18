# Dither / ASCII Generator — แผนพัฒนา

เว็บแอปที่แปลงภาพ วิดีโอ และเว็บแคมเป็นภาพ **dither** และ **ASCII art** แบบเรียลไทม์
แนวทาง: งาน dither ที่รองรับแอนิเมชันและเล่นวิดีโอได้ และงาน ASCII art ที่มีสไตล์
รันในเบราว์เซอร์ล้วน ไม่มี backend → deploy บน **GitHub Pages** ได้ฟรี

---

## 1. เป้าหมาย

| ต้องมี (MVP) | ทำทีหลัง |
|---|---|
| อัปโหลดภาพ / ลากวาง / วางจากคลิปบอร์ด | โหมดเลเยอร์ซ้อนกันหลายเอฟเฟกต์ |
| Dither หลายอัลกอริทึม + พาเลตสี | ~~แก้ palette เองแบบละเอียด / import .hex .gpl~~ (ทำแล้ว ดูท้ายไฟล์) |
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

### พาเลตกำหนดเอง (2026-10-18)

- พาเลต **Custom** ใช้ได้ทั้งโหมด Dither และ ASCII (โหมดสี Palette): 2–32 สี เก็บใน param `customPalette` เป็นรายการ `#rrggbb` คั่นด้วยช่องว่าง จึงอยู่ใน preset และลิงก์แชร์ด้วย
- แก้สีได้ที่ชิปแต่ละสี กด + เพื่อเพิ่ม × เพื่อลบ วางรายการ hex ลงช่องข้อความได้ และมีปุ่ม Sort เรียงจากมืดไปสว่าง
- **Match by brightness** (`customRamp`): เลือกสีตามความสว่างแทนการหาสีที่ใกล้ที่สุด เหมาะกับพาเลต 2–3 สีแบบ duotone
- **นำเข้าไฟล์พาเลต:** ปุ่ม Import file… หรือลากไฟล์มาวางบนหน้า รองรับ JSON ที่มีรายการสีอยู่ตรงไหนก็ได้ (hex หรือ `{r,g,b}`), `.hex`, GIMP `.gpl` และข้อความที่มีรหัส `#rrggbb`
- ข้อความแจ้งเตือนที่ footer ไม่ถูกเวลาประมวลผลเขียนทับแล้ว (`setStatus()` รอให้ข้อความหายไปก่อน)

---

## 10. เฟส 10–13 — โทนภาพ, เอฟเฟกต์ขั้นสูง, dither แบบใหม่ และนำเข้า preset

เป้าหมาย: เพิ่มการปรับโทนภาพให้ละเอียดขึ้น ขยายเอฟเฟกต์เดิมให้ปรับได้ลึกขึ้น เพิ่มอัลกอริทึม dither แนว glitch/pattern และรับ preset จากไฟล์ JSON ภายนอกได้

### ฟีเจอร์เป้าหมาย

| ฟีเจอร์ | ของเราตอนนี้ | ทำในเฟส |
|---|---|---|
| Blur และ Denoise ก่อน dither | มีแค่ Sharpen | 10 |
| Hue shift | ไม่มี | 10 |
| Shadows / Midtones / Highlights | มีแค่ Gamma | 10 |
| จับคู่สีแบบ perceptual (OKLab) | หาสีใกล้สุดใน RGB | 10 |
| เอฟเฟกต์ Tint + blend mode | ไม่มี | 10 |
| Glow รัศมีกว้าง ยืดเป็นแนวได้ หมุนทิศได้ | Glow รัศมีสูงสุด 32px วงกลมอย่างเดียว | 11 |
| JPEG glitch แยก 5 แบบ | ค่า Amount รวมค่าเดียว | 11 |
| Chromatic แยกระยะ R / G / B | ค่าเดียว | 11 |
| Boil เลือกรูปแบบ noise และความแรง | สุ่มแบบเดียว ปรับได้แค่ fps | 11 |
| เอฟเฟกต์ Finish (blur / sharpen / hue หลัง dither) | ไม่มี | 11 |
| Wave diffusion (error diffusion ที่มีเส้นคลื่นแทรก) | ไม่มี | 12 |
| Honeycomb pattern (ลาย dither ช่องหกเหลี่ยม) | มี dot / line / crosshatch | 12 |
| Orbs (ลายวงกลมสุ่มที่ลากเป็นแนว) | ไม่มี | 12 |
| Halftone สี CMYK (มุมแยกช่องสี, dot gain, GCR) | halftone ขาวดำ | 12 |
| ASCII ตัวหนา | มีแค่น้ำหนักปกติ | 13 |
| นำเข้า preset จากไฟล์ JSON ภายนอก | นำเข้าได้แค่พาเลต | 13 |

### ลำดับงาน

| เฟส | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| **10. Tone & colour** | Adjust: **Blur** (0–100, Gaussian แยกแกน 2 pass), **Denoise** (bilateral แบบเบา), **Hue** (−180°…180°), **Shadows / Midtones / Highlights** (เส้นโค้งโทน 3 จุด ทำงานต่อจาก Gamma ไม่ได้แทนที่) · Palette: toggle **Perceptual match** จับคู่สีใน OKLab ใช้กับพาเลตแบบ `set` ทั้งใน shader และ worker · Effect ใหม่ **Tint**: สี, blend mode (multiply / screen / overlay / soft light / color / color burn), opacity | ปรับ Blur แล้ววิดีโอ 1080p ยังลื่น · Hue หมุนครบรอบกลับมาภาพเดิม · Perceptual match ให้สีผิวและท้องฟ้าตรงขึ้นเมื่อเทียบกับ RGB บนภาพ sample · Tint ทุก blend mode ไม่ทำให้ alpha เพี้ยน (`rgb <= a`) |
| **11. Effects+** | **Glow:** ขยายรัศมีถึง 200px ด้วย downsample หลายชั้น (mip chain) · เพิ่ม Softness (ขอบ threshold นุ่ม), Aspect (ยืดแนวนอน/ตั้ง), Angle, Falloff · **JPEG glitch:** แยกเป็น Block shift, Channel swap, Scanline offset, Block scramble, Interlace ปรับความแรงทีละแบบ · **Chromatic:** ระยะเลื่อน R / G / B แยกกัน + ระยะสูงสุด · **Boil:** เลือก pattern (random / blue noise) และความแรง · Effect ใหม่ **Finish:** blur / sharpen / hue หลัง dither ใช้ซ้อนเอฟเฟกต์อื่นได้ | Glow รัศมี 200px ยังได้ 30fps ขึ้นไปบนภาพ 1080p · preset เก่าที่มี glitch/chroma ยังได้ภาพเหมือนเดิม (ค่าใหม่ตั้งค่าเริ่มต้นให้ผลเท่าของเดิม) · Boil แบบ blue noise ไม่เป็นก้อน |
| **12. New dithers** | **Wave diffusion:** ตัวเลือกใน error diffusion ทุก kernel ใส่คลื่น sine ลงใน threshold ตามแถว ปรับ Strength และ Bias (เอียงตามแกน x) ทำใน `diffuse()` จึงเขียนเทสต์ได้ · **Honeycomb:** pattern ใน `dither.frag` แบ่งภาพเป็นช่องหกเหลี่ยม ปรับ Cell size และ Line scale · **Orbs:** วงกลมนุ่มจำนวนหนึ่งวางแบบสุ่มตาม seed แล้วลากเป็นแนว (นอน/ตั้ง) ใช้เป็น threshold map ปรับ Size, Count, Intensity, Randomness, Vertical · **Halftone CMYK:** แยกช่องสีเป็น C/M/Y/K แต่ละช่องมีมุมของตัวเอง, Dot gain, GCR, Supersample (ลดรอยหยัก) | ทุกอัลกอริทึมใหม่ใช้ได้กับทุกพาเลต (ยกเว้น CMYK ที่กำหนดสีเอง) · Orbs ได้ผลเดิมทุกครั้งที่ seed เดิม (export ซ้ำได้ภาพเดิม) · Boil ทำให้ Wave/Orbs ขยับได้ |
| **13. Import & polish** | **ASCII Bold:** ตัวเลือกน้ำหนักฟอนต์ (atlas สร้างใหม่ตามน้ำหนัก) · **นำเข้า preset JSON ภายนอก:** แปลงค่าเท่าที่จับคู่ได้เข้า `Params` (พาเลต, threshold, ค่า Adjust, เอฟเฟกต์, ASCII) ผ่าน `sanitize()` แล้วแจ้งรายการที่ข้ามไป · ตรวจรูปแบบไฟล์จากโครงสร้าง JSON | นำเข้าแล้วได้ภาพใกล้เคียง และมีรายการแจ้งเตือนค่าที่ใช้ไม่ได้ · ไฟล์ที่เสียหรือไม่รู้จักไม่ทำให้แอปพัง |

### หมายเหตุทางเทคนิค

- **Param ใหม่ทุกตัว** ทำตามขั้นใน CLAUDE.md: `Params`/`DEFAULTS` → `SliderSpec` หรือ `ENUMS` → กลุ่ม key · slider ใหม่จะ animate ได้อัตโนมัติผ่าน `ANIMATABLE` · ค่าเริ่มต้นต้องไม่เปลี่ยนภาพของ preset/ลิงก์แชร์ที่มีอยู่แล้ว
- **Blur / Denoise ก่อน dither:** ทำใน pass แยกก่อน `adjust.frag` (หรือใน FBO ระหว่างทาง) เพราะต้องอ่านพิกเซลรอบข้างหลายจุด · ทุก texture/framebuffer ที่เพิ่มต้องสร้างใน `Renderer.createResources()` เพื่อให้กู้คืนได้หลัง context lost
- **Glow รัศมีกว้าง:** การ blur ตรง ๆ ที่ 200px ช้าเกินไป ใช้ downsample → blur → upsample หลายชั้น ต้องมี FBO เพิ่มหลายขนาด (สร้างใน `createResources()` และสร้างใหม่ตอน resize)
- **Perceptual match ต้องทำ 2 ที่:** shader (`dither.frag`) และ worker (`diffuse.ts`) ให้ได้ผลตรงกัน เหมือนพาเลตทั้ง 3 แบบในปัจจุบัน · เทสต์ฝั่ง `diffuse()` ได้
- **Wave diffusion** ใส่ใน `diffuse()` ซึ่งเป็นฟังก์ชัน pure จึงเขียนเทสต์ได้ (เช่น strength 0 ต้องได้ผลเท่าเดิมทุกพิกเซล)
- **Orbs** ใช้ hash จาก seed ใน shader ห้ามใช้ `Math.random()` ฝั่ง CPU เพื่อให้ export ได้ผลซ้ำได้
- **Halftone CMYK** ไม่ใช้พาเลต จึงต้องซ่อนตัวเลือกพาเลตตอนเลือกอัลกอริทึมนี้ (แบบเดียวกับที่ `uses` ของ palette ทำ)
- **เอฟเฟกต์ใหม่ (Tint, Finish)** เพิ่มตามขั้นใน CLAUDE.md: entry ใน `EFFECTS` พร้อม `u_kind` ใหม่ (6, 7), branch ใน `post.frag`, flag เปิด/ปิด + `FX_SLIDERS`, และ key ใน `FX_KEYS` · ต้องรักษา premultiplied alpha
- **ตัวนำเข้า preset** แยกเป็นโมดูล pure (`src/presets-import.ts` หรือคล้ายกัน) รับ JSON คืน `{ params, skipped[] }` เพื่อเขียนเทสต์ได้ · ห้ามใส่ชื่อผลิตภัณฑ์อื่นในโค้ด ชื่อไฟล์ หรือ UI ให้ตรวจรูปแบบจากโครงสร้างข้อมูลเท่านั้น
- **เทสต์:** เพิ่มเทสต์ของ logic ใหม่ทุกตัวที่เป็น pure (เส้นโค้งโทน, OKLab, wave diffusion, normalize ค่า glitch, ตัวนำเข้า preset) ส่วนที่เป็น WebGL ตรวจในเบราว์เซอร์

### คำถามที่ต้องตัดสินใจก่อนเริ่ม

- ~~Shadows/Midtones/Highlights ควรแทนที่ Gamma หรืออยู่คู่กัน~~ **ตัดสินแล้ว (2026-10-18): อยู่คู่กับ Gamma**
- JPEG glitch แบบ 5 ค่า: เก็บ **Amount เดิมเป็นค่ารวม** ที่คูณทุกแบบ หรือเลิกใช้ (แผนนี้เก็บไว้เพื่อความเข้ากันได้)
- Tint/Finish ควรเพิ่มซ้ำได้หลายชั้นในสแต็กไหม (แผนนี้: ชั้นเดียวต่อเอฟเฟกต์เหมือนเดิม)

### สถานะเฟส 10 (2026-10-18): เสร็จแล้ว

- **Adjust แบ่งเป็นหมวด** Tone / Colour / Detail · เพิ่ม **Shadows / Midtones / Highlights** (−100…100 เส้นโค้งโทนที่ดำและขาวไม่ขยับ ทำงานต่อจาก Gamma), **Hue** (±180°), **Blur** (100 = 3% ของด้านยาว จึงได้ผลเท่ากันทุก pixel size และในโหมด ASCII), **Denoise** (bilateral เบลอเฉพาะพื้นที่สีใกล้กัน ขอบยังคม)
- Blur และ Denoise เป็น pass แยก (`filter.frag`) แนวนอนแล้วแนวตั้ง ทำงานเฉพาะตอนเปิด และไม่ใช้กับมุมมอง Original
- **Perceptual match:** หาสีใกล้สุดใน OKLab แทน RGB ใช้ได้กับพาเลตที่เลือกด้วยสีใกล้สุด (CGA, PICO-8, C64, Custom, From image) ทั้ง GPU, worker และสีตัวอักษร ASCII
- **Tint:** เอฟเฟกต์สีทับ 6 blend mode (Multiply, Screen, Overlay, Soft light, Colour, Colour burn) + Opacity รักษา alpha ของพื้นหลังโปร่งใส
- ตรวจในเบราว์เซอร์: Blur 100 ลดพลังงานขอบลงครึ่งหนึ่ง · Denoise 100 ลด noise ของภาพทดสอบจาก 19.3 เหลือ 2.2 โดยขอบยังเป็นขั้นเดียว 1 พิกเซล · Hue 120° หมุนช่องสีโดยความสว่างแทบไม่เปลี่ยน · Tint แบบ Colour คงความสว่างเดิมพอดี
- เทสต์ใหม่ 9 ตัว (รวม 98)

### สถานะเฟส 11 (2026-10-18): เสร็จแล้ว

- **Glow:** รัศมีถึง 200px โดยทำ bright pass ลง texture แยกที่มี mipmap แล้วอ่านชั้นหยาบสำหรับวงกว้าง ภาพจึงนุ่มไม่เป็นจุด · เพิ่ม Softness (knee นุ่มรอบ threshold), Stretch, Angle, Falloff · ตรวจแล้ว: Stretch 4 ที่ 0° ให้แสงแนวนอนแรงกว่าแนวตั้ง 6.5 เท่า และกลับกันที่ 90°
- **JPEG glitch:** แยกเป็น Block shift, Colour crush, Channel swap (3 แบบเดิม ค่าเริ่มต้น 100%) + Scanline offset, Block scramble, Interlace (ใหม่ ค่าเริ่มต้น 0) · Amount เดิมยังเป็นตัวคูณรวม
- **Chromatic aberration:** เลื่อน R / G / B แยกกัน (−100…100% ของ Max shift ซึ่งขยายถึง 40px) ค่าเริ่มต้น R +100, G 0, B −100 = แบบเดิม
- **Boil:** เลือก Pattern (Random / Blue noise) และ Amount ใช้กับ error diffusion และ ASCII · blue noise กระจายสม่ำเสมอกว่า (ความแปรปรวนของบล็อก 8×8 ลดจาก 2.32 เหลือ 1.98)
- เอฟเฟกต์ใหม่ **Finish:** Soften, Sharpen, Hue หลัง dither
- **preset เดิมได้ภาพเหมือนเดิม:** ค่าเริ่มต้นของทุกค่าใหม่ให้ผลเท่าของเดิม ตรวจในเบราว์เซอร์แล้ว (ปิดทุกโหมดของ glitch หรือตั้ง chroma ทุกช่องเป็น 0 ได้ภาพตรงกับต้นฉบับทุกพิกเซล) และมีเทสต์ยืนยัน uniform ของค่าเริ่มต้น · Glow ที่รัศมีเดิมเปลี่ยนเล็กน้อยเพราะใช้ 16 จุดต่อวงแทน 12
- ยังไม่ได้วัด: ความเร็วของ Glow 200px บนภาพ 1080p (หน้าต่างพรีวิวถูกซ่อนตอนทดสอบ เวลาต่อเฟรมจึงเชื่อถือไม่ได้)
- เทสต์ใหม่ 7 ตัว (รวม 105)
