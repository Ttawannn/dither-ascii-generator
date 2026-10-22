# แผนเพิ่มความสามารถ Dither / ASCII

วันที่: 22 ตุลาคม 2026
สถานะ: พัฒนาฟีเจอร์รุ่นแรกครบ 7 หมวดแล้ว — ผลตรวจและข้อจำกัดอยู่ท้ายเอกสาร

## เป้าหมาย

เพิ่มความสามารถที่ช่วยให้ทำงานต่อได้ครบ ทดลองลุคได้สะดวก และสร้างภาพเคลื่อนไหวได้หลากหลายขึ้น โดยต่อยอด renderer, presets, layers และ export ที่มีอยู่ ทุกอย่างยังประมวลผลในเบราว์เซอร์และใช้งานภาษาไทย/อังกฤษได้

แผนนี้กำหนดความสามารถและพฤติกรรมของแอปเราเอง โดยใช้ขอบเขตและเกณฑ์ตรวจรับด้านล่างเป็นหลัก

## ฐานที่มีอยู่แล้ว

ตรวจจากโค้ด ณ วันที่เขียนแผน:

- Dither 25 รายการ รวม CMYK Halftone, Orbs, Luma Shapes และ Stippling
- ASCII พร้อม custom characters, custom fonts, shape matching และหลายรูปแบบการส่งออก
- Palette editor, palette library, ดึงสีจากภาพ และ perceptual matching
- Boil แบบ Random / Blue noise และแอนิเมชัน LFO / From–To / Audio สูงสุด 8 lanes
- เอฟเฟกต์ซ้อนและสลับลำดับได้ รวม Glow, JPEG Glitch, Chromatic Aberration และ Pixel sorting
- Layer 2, masks, undo/redo, preset JSON และ share links
- ภาพ วิดีโอ webcam, batch export, PNG / SVG / GIF / WebM / MP4 และขนาดงานพิมพ์

จึงไม่จัดการสร้างฟีเจอร์เหล่านี้ใหม่เป็นงานเพิ่มเติม แต่ขยายเฉพาะส่วนที่ยังขาด

## ลำดับส่งมอบ

| ลำดับ | งาน | ผลที่ผู้ใช้ได้ | ขนาดงานโดยประมาณ | ต้องทำก่อน |
|---|---|---|---|---|
| 1 | Save / Open Project | เปิดงานกลับมาพร้อมสื่อและการตั้งค่า | ใหญ่ | ตรวจเส้นทางโหลดสื่อและ export |
| 2 | Lock & Shuffle | สุ่มลุคโดยเก็บสีหรือค่าที่เลือกไว้ | เล็ก–กลาง | โมเดลสถานะที่บันทึกในโปรเจกต์ |
| 3 | Temporal patterns | ควบคุมการเคลื่อนไหวของแพตเทิร์นได้มากขึ้น | กลาง–ใหญ่ | เวลาและ seed ที่ใช้ร่วมกัน |
| 4 | Timeline หลาย keyframes | จัดจังหวะแอนิเมชันหลายช่วงได้ | ใหญ่ | โครงสร้างโปรเจกต์และ animation schema |
| 5 | Modulation Lines และ ASCII Reveal | ได้ลุคเส้นและเอฟเฟกต์เผยภาพใหม่ | ใหญ่ | Temporal / Timeline |
| 6 | Luma Shapes เพิ่มเติม | คุมการวางและหมุนรูปทรงได้ละเอียดขึ้น | กลาง | การสุ่มแบบ seed |
| 7 | Vector export เพิ่มเติม | ได้รูปทรงเวกเตอร์ที่แก้ต่อสะดวกขึ้น | กลาง–ใหญ่ | โมเดล Luma Shapes รุ่นใหม่ |

ขนาดงานเป็นการประเมินความซับซ้อนเบื้องต้น ไม่ใช่ระยะเวลาที่รับประกัน แต่ละลำดับแยกส่งมอบได้

## 1. Save / Open Project

### ขอบเขต

- [x] เพิ่มปุ่ม Save Project / Open Project และรองรับลากไฟล์โปรเจกต์เข้าหน้าแอป
- [x] ใช้ไฟล์ `.dither-project` แบบ ZIP ภายในมี `manifest.json` และ `assets/`
- [x] Manifest มี format version, app version, Params ทั้งชุด, export settings, metadata ของ source และการอ้างอิง assets
- [x] เก็บไฟล์ภาพหรือวิดีโอต้นฉบับ พร้อมเสียงและฟอนต์ที่เพิ่มเองเมื่อถูกใช้ในงาน
- [x] เก็บ Layer 2, mask, animation lanes, custom palette และ custom shape images
- [x] เก็บตำแหน่งเล่นและช่วง In–Out ของวิดีโอ โดยเปิดกลับมาในสถานะหยุดเล่น
- [x] เก็บ lock settings ของงานเมื่อเพิ่มระบบ Lock & Shuffle แล้ว
- [x] สำหรับ webcam บันทึกภาพเฟรมปัจจุบันเป็น source ภาพนิ่ง และแจ้งพฤติกรรมนี้ก่อนบันทึก
- [x] โหลดและตรวจข้อมูลให้ครบก่อนแทนที่งานปัจจุบัน หากเปิดไม่สำเร็จ งานเดิมยังใช้ต่อได้
- [x] แสดงความคืบหน้าและยกเลิกได้สำหรับไฟล์ใหญ่ พร้อมกำหนดขนาดไฟล์/ข้อมูลหลังคลาย ZIP ตามการวัดหน่วยความจำจริง
- [x] เริ่ม project schema ที่ version 1, ตรวจ version ก่อนโหลด, เติมค่าเริ่มต้นของ settings เดิม และแจ้งเมื่อเปิด version ที่ยังไม่รองรับ

Preset และ share link ยังคงใช้สำหรับย้ายลุค ส่วน project ใช้เก็บงานพร้อมสื่อ ไม่รวมประวัติ undo ทั้งหมดหรือ library ที่ไม่ได้ใช้ในงาน

### จุดแก้หลัก

เพิ่ม `src/project.ts`, `src/app/project.ts` และชุดทดสอบ; ต่อกับ `src/app/sources.ts`, `src/app/audio.ts`, `src/user-fonts.ts`, `src/state.ts` และ `src/zip.ts` โดยตรวจความสามารถ/ข้อจำกัด ZIP เดิมก่อนเลือกใช้

ต้องเพิ่มการเก็บ File/Blob ต้นฉบับในเส้นทางโหลดสื่อ เพราะ Source ปัจจุบันเก็บ element ที่ใช้ render เป็นหลัก

### เกณฑ์รับงาน

- บันทึกภาพพร้อมรูปทรงและฟอนต์ที่เพิ่มเอง แล้วเปิดใน browser profile ใหม่ได้โดยไม่ต้องอัปโหลดซ้ำ
- วิดีโอพร้อมช่วง trim, เสียง, เลเยอร์และแอนิเมชันเปิดกลับมาได้ครบ
- เมื่อเทียบ source, settings และเวลาเดียวกัน ผลภาพก่อนบันทึก/หลังเปิดตรงกันภายใน tolerance ที่กำหนดสำหรับ renderer เดิม
- ไฟล์เสียหรือ asset ขาดต้องมีข้อความชัดเจน และไม่ทำให้งานที่เปิดอยู่สูญหาย

## 2. Lock & Shuffle

### ขอบเขต

- [x] เพิ่ม lock ราย swatch ใน custom palette และสุ่มเฉพาะสีที่ไม่ล็อก
- [x] เพิ่ม lock รายค่าของ Adjust และกลุ่ม Algorithm / Palette / Effects ที่ใช้กับ Surprise me
- [x] แยกคำสั่ง Shuffle palette, Shuffle adjustments และ Surprise me ให้ผู้ใช้รู้ว่าจะสุ่มอะไร
- [x] กำหนดให้การสุ่มเคารพ lock; ผู้ใช้ยังแก้ค่าที่ล็อกด้วยมือได้ตามปกติ
- [x] การสุ่มหนึ่งครั้งเป็นหนึ่ง undo step และเมื่อทุกค่าถูกล็อกไม่สร้าง undo เปล่า
- [x] เก็บ lock ใน project และ session; ไม่ใส่ lock ใน look presets/share links รุ่นแรก

### จุดแก้หลักและเกณฑ์รับงาน

ต่อยอด `src/random-look.ts`, `src/app/panel/custom-palette.ts`, `src/app/panel/adjust.ts` และ project state แยกจากค่าที่ render

ทดสอบว่าสีและค่าที่ล็อกไม่เปลี่ยนหลังสุ่มหลายครั้ง การเพิ่ม/ลบ/เรียง swatches ไม่ย้าย lock ผิดสี และ undo/redo คืนค่าครบ

## 3. Temporal patterns

### ขอบเขต

- [x] ขยาย Boil เดิม โดยให้ค่าเริ่มต้นและ preset เก่าได้ผลแบบเดิม
- [x] เพิ่มตัวเลือกทดลองอย่างน้อย 4 แบบ: noise เคลื่อนทิศทาง, เส้นสแกน, คลื่น และ block noise
- [x] เพิ่มตัวควบคุม speed, amount, scale, direction และ seed ตามชนิดแพตเทิร์น
- [x] กำหนดสัญญาเวลาเดียวกันสำหรับ GPU, error diffusion worker, ASCII และ export: ผลขึ้นกับ settings + seed + timestamp ของเฟรม
- [x] กำหนดว่า temporal signal กระทบจุดใดในแต่ละโหมด และรักษาการแมปความสว่าง/พาเลตเดิมเมื่อ amount เป็นศูนย์
- [x] มีตัวเลือก loop ที่รอยต่อไม่กระโดดสำหรับแพตเทิร์นที่รองรับ
- [x] บันทึกใน preset, share, project และ undo; Stippling ยังเป็นภาพนิ่งตามข้อจำกัดเดิม

### จุดแก้หลักและเกณฑ์รับงาน

เพิ่มโมดูลกลาง เช่น `src/temporal.ts` และส่วน shader ที่ให้ผลสอดคล้องกัน ต่อกับ `src/app/core.ts`, renderer, diffusion, ASCII และ animation export

Preview และ export ที่เวลาเดียวกันต้องตรงกัน การหยุด/เล่นต่อไม่เปลี่ยน seed โดยไม่ตั้งใจ และ loop ต้องผ่านการตรวจเฟรมแรก/สุดท้ายตามระยะเวลาเฟรมจริง

## 4. Timeline หลาย keyframes

### ขอบเขต

- [x] ขยาย lane แบบ From–To เป็น keyframes หลายจุด โดยยังเก็บ LFO และ Audio modes
- [x] เพิ่มเวลาเริ่ม/จบต่อ lane; รองรับ interpolation แบบ linear, smooth และ hold
- [x] มี playhead, scrub, เพิ่ม/ลบ/เลื่อน keyframe พร้อมช่องกรอกเวลาและค่า
- [x] รองรับเมาส์ สัมผัส และคีย์บอร์ด; การลากหนึ่งครั้งเป็นหนึ่ง undo step
- [x] รุ่นแรกยังจำกัด 8 lanes และหนึ่ง lane ต่อ numeric parameter เพื่อไม่ให้ค่าขัดกัน
- [x] ทำให้ชัดว่า slider ของ parameter ที่ถูก animate แสดง base value หรือค่าปัจจุบัน และแก้ผ่าน timeline อย่างไร
- [x] แปลง From–To เก่าเป็น keyframes สองจุดโดยคง easing และ loop เดิม รวม repeat / ping-pong / once

### จุดแก้หลักและเกณฑ์รับงาน

แก้ `src/anim.ts`, `src/app/panel/animation.ts` และเพิ่ม timeline UI; migration ต้องใช้ร่วมกันทั้ง preset, share และ project

ทดสอบ timestamp ก่อน/หลังช่วง lane, keyframes ซ้ำเวลา, ขอบ loop และ export ทุกเฟรมด้วยเวลาเดียวกับ preview ไม่ใช้ความเร็ว render จริงเป็นตัวกำหนดแอนิเมชัน

## 5. เอฟเฟกต์ภาพใหม่

### 5A. Modulation Lines

- [x] เพิ่ม algorithm สำหรับเส้นที่ตอบสนองความสว่างของภาพโดยเฉพาะ
- [x] คุมระยะเส้น ความหนา ทิศทาง และ modulation amount
- [x] ใช้ phase เพื่อ animate และเชื่อมกับ Temporal / Timeline
- [x] ใช้ palette, layers, masks และเอฟเฟกต์เดิมได้
- [x] เพิ่ม presets อย่างน้อย 3 ลุค: fine lines, coarse poster และ moving signal

เริ่มจากกำหนดภาพตัวอย่างและผลที่ต้องการให้ชัด แยกจาก Halftone line และ Wave diffusion เดิม แล้วจึงเลือกสมการและ shader ของเราเอง

### 5B. ASCII Reveal + Glow

- [x] กำหนด progress 0–100 ให้ภาพค่อย ๆ ปรากฏผ่านแพตเทิร์นตัวอักษร
- [x] คุม softness, threshold และ direction; ใช้ Glow เดิมสำหรับส่วนเรืองแสงก่อนเพิ่มระบบ Glow ใหม่
- [x] ให้ผู้ใช้เลือกผลปลายทางเป็นภาพต้นฉบับหรือผล Dither/ASCII
- [x] ทำผ่านเส้นทาง compositing ร่วม เพื่อให้ mask และ Layer 2 มีพฤติกรรมชัดเจน
- [x] เพิ่ม presets อย่างน้อย 3 ลุค: portrait reveal, logo reveal และ terminal dissolve

เกณฑ์ร่วม: amount/progress ที่ขอบช่วงให้ผลถูกต้อง, alpha ไม่เป็นขอบดำ, วิดีโอและ still animation export ทำงานครบ และ preset เก่าไม่เปลี่ยนภาพ

กำหนดพฤติกรรมเอฟเฟกต์จากภาพตัวอย่างและเกณฑ์ผลลัพธ์ของเราเองก่อนเริ่มพัฒนา

## 6. ขยาย Luma Shapes

- [x] เพิ่ม rotation ต่อ brightness band และสุ่มมุม/ขนาด/ตำแหน่งด้วย seed
- [x] เพิ่ม layout แบบ Grid, Staggered และ Scatter โดยแยกจาก feather แบบ Scatter ที่มีอยู่แล้ว
- [x] แยกความหมายของมุม grid กับมุมรูปทรง เพื่อควบคุมได้อิสระ
- [x] คง custom image tiles, สี tint และ transparency เดิม
- [x] เพิ่มค่าเริ่มต้นให้ไฟล์ shape JSON และ presets เดิมเปิดได้โดยภาพไม่เปลี่ยน
- [x] ตรวจ Layer 2, import/export shapes, preset และ project ครบทุกเส้นทาง

จุดแก้หลัก: `src/pipeline/shape-bands.ts`, `src/pipeline/shaders/dither.frag` และ `src/app/panel/luma-shapes.ts`

เกณฑ์รับงาน: seed เดิมให้ตำแหน่งเดิม, ปรับ brightness band ไม่ทำให้รูปอื่นสุ่มใหม่โดยไม่จำเป็น, รูปที่ขอบภาพไม่หาย/กลับด้าน และวิดีโอไม่มีการสุ่มใหม่ทุกเฟรมเว้นแต่เปิดแอนิเมชัน

## 7. Vector export เพิ่มเติม

- [x] เพิ่ม SVG primitives สำหรับรูปทรงพื้นฐานของ Luma Shapes: circle, rect, line และ path ตามรูปร่าง
- [x] ใช้ layout, rotation และ seed เดียวกับ renderer ภาพ
- [x] ระบุให้ชัดว่ารูปทรงที่อัปโหลดเป็นภาพใช้ embedded raster ใน SVG รุ่นแรก ไม่แปลงเป็นเวกเตอร์อัตโนมัติ
- [x] เพิ่มตัวเลือก transparent background, physical size และการจัดกลุ่มตามสี
- [x] แยกเส้นทาง primitive SVG จาก pixel-run SVG เดิม
- [x] ตรวจ combination ที่มี Glow, masks หรือ blend effects ก่อน export; หากยังรักษาภาพไม่ได้ให้แจ้งข้อจำกัดและเสนอ PNG โดยไม่ตัดองค์ประกอบทิ้งเงียบ ๆ
- [x] วัดจำนวน elements และขนาดไฟล์ก่อนตัดสินใจเพิ่ม path simplification

จุดแก้หลัก: เพิ่ม `src/export/luma-shapes-svg.ts` และต่อกับ `src/app/exporting.ts` / แผง Export

เกณฑ์รับงาน: ตรวจไฟล์ใน browser และโปรแกรมแก้ SVG, รูปทรงและตำแหน่งตรงกับ PNG, สี/alpha/ขนาดพิมพ์ถูกต้อง และไม่อ้างว่า export เป็นไฟล์เครื่องปักโดยตรง

## เกณฑ์ร่วมก่อนส่งมอบแต่ละส่วน

- [x] มีค่าเริ่มต้นที่เปิดข้อมูลรุ่นเก่าได้ และ sanitize ข้อมูลภายนอกครบ
- [x] เชื่อม preset / share / project / undo / Layer 2 เฉพาะส่วนที่เกี่ยวข้อง
- [x] UI และข้อความผิดพลาดมีภาษาไทย/อังกฤษ พร้อมรองรับจอเล็กและคีย์บอร์ด
- [x] เพิ่ม tests สำหรับ serialization, migration, deterministic output และพฤติกรรมสำคัญของงานนั้น
- [x] รัน `npm run test`, `npm run typecheck`, `npm run build` และ `npm run lint`
- [x] ตรวจ UI และภาพจริงใน browser รวม console / WebGL errors
- [x] งานที่แตะ animation ต้องตรวจ export ภาพเคลื่อนไหวจริง; งานที่แตะ SVG ต้องเปิดไฟล์ที่ส่งออกจริง
- [x] บันทึกผลตรวจและข้อจำกัดที่ยังเหลือในเอกสาร ไม่ใช้การ build ผ่านแทนการยืนยันภาพ

## การแบ่งรุ่น

1. **รุ่น A — เก็บงานและทดลองลุค:** Project files + Lock & Shuffle
2. **รุ่น B — คุมการเคลื่อนไหว:** Temporal patterns + Timeline หลาย keyframes
3. **รุ่น C — ลุคใหม่:** Modulation Lines + ASCII Reveal
4. **รุ่น D — รูปทรงและงานพิมพ์:** Luma Shapes เพิ่มเติม + Vector export

เริ่มพัฒนาจาก Project files โดยทำกรณีภาพนิ่งให้ครบก่อน แล้วเพิ่มวิดีโอ/เสียงก่อนถือว่างาน Project files เสร็จ

## การเตรียมตัวอย่างก่อนพัฒนา

ก่อนเริ่มงานภาพใหม่แต่ละชิ้น ให้เตรียมภาพตัวอย่างและเกณฑ์ผลลัพธ์ของเราเองอย่างน้อยภาพไล่เฉด ข้อความ/โลโก้ ภาพบุคคล และวิดีโอสั้น เพื่อประเมินภาพและประสิทธิภาพได้จริง

## ผลการพัฒนาและตรวจรับ — 22 ตุลาคม 2026

- เพิ่ม Project, Lock & Shuffle, Temporal patterns, Timeline หลาย keyframes, Modulation Lines, ASCII Reveal, การจัดวาง/หมุน Luma Shapes และ SVG primitives แล้ว
- หลังรวม main ล่าสุด: `npm test -- --reporter=dot` ผ่าน 31 ไฟล์ / 279 ข้อ โดย config จำกัดการค้นหาเฉพาะ `src` เพื่อไม่รวมสำเนาในโฟลเดอร์ worktrees
- TypeScript และ production build ผ่าน; lint ผ่าน
- ตรวจ UI จริงทั้งหน้าจอแคบและ desktop, เปลี่ยนภาษา, โหมดเส้น, ต้น/ปลาย reveal, เพิ่ม keyframe และตัวเลือก temporal ทั้งสี่แบบ โดยไม่พบ console/WebGL error ในกรณีที่ตรวจ
- บันทึกโปรเจกต์พร้อม MP4, เสียง WAV, ฟอนต์นำเข้า, lock และ trim 0.2–0.9 วินาที แล้วเปิดในอีก origin ที่มี storage แยกกันได้ เปิดกลับมาในสถานะหยุดเล่น
- พบและแก้การ seek ไปเวลาเดิมซ้ำหลัง restore; ตรวจเปิดแล้วบันทึกซ้ำโดย playhead คงที่ 0.9 วินาที
- ทดสอบไฟล์ที่บรรจุเสียงเสีย: แสดงข้อผิดพลาดและยังเก็บ source/settings ของงานเดิมไว้
- GIF จากแอนิเมชัน Phase และจาก Temporal + error diffusion มี 5 เฟรม และเฟรมต่างกันจริง; MP4 ที่ส่งออกหลัง restore มี video track และ audio track อย่างละหนึ่ง
- SVG รูปทรงสลับแถวเปิดเป็น XML และ render ใน browser ได้; ภาพโดยรวมและตำแหน่งตรงกับ PNG โดยมีความต่างตาม anti-aliasing ระหว่างพิกเซลและเวกเตอร์
- SVG จากภาพอัปโหลดเก็บ PNG tile ใน defs ครั้งเดียว แล้วใช้ซ้ำผ่าน `use` เพื่อลดขนาดไฟล์ ไม่ฝังสำเนาภาพซ้ำทุกเซลล์
- ทดสอบ archive payload 120 MiB ใน Node บนเครื่องนี้: encode + decode ประมาณ 500 ms; RSS จาก 65 MiB เป็น 306 MiB หลัง encode และ 426 MiB หลัง decode จึงจำกัดโปรเจกต์รุ่นแรกที่ 128 MiB การวัดนี้ครอบคลุม archive ไม่รวมการ decode สื่อใน browser
- เพิ่มคู่มือการใช้งานและข้อจำกัดใน README พร้อมภาพตัวอย่าง `docs/roadmap-preview.png`

### ขอบเขตของรุ่นแรก

- โปรเจกต์เริ่มที่ format version 1; เมื่อมี schema ใหม่ต้องเพิ่ม migration ก่อนเปลี่ยน version
- จำกัด 8 animation lanes, 32 keyframes ต่อ lane และ 150,000 candidate cells สำหรับ SVG
- รูปทรงที่อัปโหลดคงเป็น raster tile ใน SVG; layers/masks/post-effects ใช้ PNG สำหรับภาพประกอบครบ
- ล็อก swatch ตามค่าสี ดังนั้น swatches ที่เป็นสีเดียวกันใช้ lock ร่วมกัน
- Symbol veil ของ Reveal เป็นชุดสัญลักษณ์ที่วาดด้วย shader ไม่ได้ใช้ฟอนต์ที่เลือกใน ASCII
- ยังไม่ได้ยืนยันในโปรแกรมแก้ SVG ภายนอกทุกตัว, Safari/Firefox หรืออุปกรณ์พกพาจริง; benchmark หน่วยความจำข้างต้นไม่ใช่การรับรองข้อจำกัดของอุปกรณ์เหล่านั้น
