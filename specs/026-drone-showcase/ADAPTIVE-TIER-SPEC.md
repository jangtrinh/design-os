# CẢI TIẾN (CHƯA LÊN LỊCH) — Điều khoản thứ 5 của Tenant contract: chọn tầng ảnh theo BĂNG THÔNG

> **Trạng thái: ĐÃ GHI NHẬN, CHƯA THỰC THI.** Owner quyết 2026-07-31: document trước,
> làm sau. **Không viết code cho tới khi có lệnh.** Trang showcase đang chạy production
> vẫn dùng cách chọn tầng theo bề rộng khung nhìn như mô tả ở §1.
>
> Quyết định đã chốt sẵn (khỏi bàn lại khi mở việc): **Safari không có
> `navigator.connection` thì rơi về bề rộng khung nhìn**, ghi
> `data-tier-reason="viewport-fallback"` để kiểm được. iPhone vẫn được phục vụ đúng vì màn
> hẹp; chỉ MacBook cắm 4G là không tối ưu — chấp nhận, không thêm phép đo băng thông chủ
> động (nó tốn một round-trip trước frame đầu tiên và phép đo đầu vốn nhiễu).
>
> Phạm vi khi mở: kernel `ui` (`tenant-scaffold` + `tenant-lint`) + `knowledge/` + trang
> showcase. Sửa kernel đồng nghĩa phát hành `ease-design` bản mới.

Tầng: spec Opus · thực thi Sonnet (khi được mở).

---

## 1 · SỐ ĐO GỐC (baseline, 2026-07-31, `scratchpad/measure-payload*.mjs`)

| | tới `load` | cuộn hết trang |
|---|---|---|
| Mobile 390×844 | 244 KB · 1 507 ms @Fast4G | 755 KB |
| Desktop 1440×900 | 244 KB · 1 510 ms @Fast4G | **4 800 KB** |
| Desktop @Fast4G | 244 KB | **chỉ kịp 1 762 / 4 800 KB** |

Phân bổ desktop: `explode` 3 031 KB · `fly` 613 KB · `explode-lq` 453 KB · `hero` 328 KB.

**Tải ban đầu KHÔNG phải vấn đề** — 244 KB, frame hero đầu tiên +205 ms trên 4G. Chi phí
nằm ở **lúc scrub**. Trên link bị bóp, engine chỉ lấy được ~37% số byte cần trong cùng quãng
cuộn: frame về không kịp, canvas giữ ảnh cũ. Đó là điều người dùng mô tả là "chậm".

**Nguyên nhân gốc:** tầng ảnh được chọn theo **bề rộng khung nhìn**, không theo **băng thông**.
Một laptop 1440px cắm 4G vẫn bị ép tải tầng 1600px (~20 KB/frame) trong khi tầng 480px
(~3 KB/frame) đã đủ dùng và đang nằm sẵn trên đĩa.

## 2 · VÌ SAO ĐÂY LÀ LỖ CỦA CHUẨN, KHÔNG PHẢI LỖI CỦA TRANG

`knowledge/motion-craft.md` § Tenant contract có 4 điều khoản, tất cả nói về chia sẻ **CPU**:
một ticker cho cả trang · IntersectionObserver arm/disarm · state nằm trên section root ·
`position: fixed` là của host. Không điều nào nói về **mạng**. Một section có thể tuân thủ
trọn vẹn cả 4 điều mà vẫn kéo 3 MB qua một đường 4G.

Vậy đây là điều khoản còn thiếu, không phải một bản vá cho spec 026.

## 3 · ĐIỀU KHOẢN 5 (dự thảo, vào `knowledge/motion-craft.md`)

> **5. Tầng media chọn theo ĐƯỜNG TRUYỀN, không chỉ theo khung nhìn.** Một section
> frame-sequence PHẢI phát hành ít nhất hai tầng và PHẢI chọn tầng bằng tín hiệu mạng trước,
> tín hiệu kích thước sau. Thứ tự ưu tiên: `saveData` → `effectiveType` → `downlink` → bề
> rộng khung nhìn → DPR. Bề rộng màn hình một mình KHÔNG phải căn cứ hợp lệ: màn to không
> hàm ý đường rộng.
> **Ngân sách:** tầng mặc định ≤ 5 KB/frame; phải tồn tại một tầng ràng buộc ≤ 2 KB/frame.
> (Số này đo từ chính corpus: tầng 480px q50 = 3,0 KB/frame và đọc tốt ở mobile;
> tầng 1600px q80 = 20,1 KB/frame.)
> **Hạ tầng lúc chạy, không nâng:** nếu frame về chậm hơn nhịp scrub thì hạ tầng cho phần
> còn lại của phiên. Không nâng lại giữa cảnh — nâng-hạ qua lại tạo giật, tệ hơn là ở nguyên
> tầng thấp.

## 4 · CÔNG VIỆC

### A — Kernel: `ui tenant-scaffold` (emitter)

Engine phát ra (`scrub-section.js`) hiện nhận `frames` + `framesLQ` và luôn nạp cả hai quanh
frame đang xem. Đổi thành:

1. Nhận `tiers: [{ dir, kbPerFrame }, …]` (giữ `frames`/`framesLQ` chạy được như cũ để
   không phá cấu hình đang có — bản đồ cũ → hai tầng).
2. Hàm `pickTier()` chạy MỘT LẦN lúc mount, theo đúng thứ tự ưu tiên ở §3.
   `navigator.connection` không có (Safari/Firefox) → rơi về bề rộng khung nhìn như hiện nay,
   và ghi lý do vào `data-tier-reason` trên section root để kiểm được.
3. Hạ tầng lúc chạy: đo thời gian từ lúc `requestFrame(i)` tới `onload`. Giữ trung vị trượt
   của 8 lần gần nhất; nếu trung vị > ngân sách mỗi frame của nhịp scrub hiện tại thì hạ một
   tầng và **khoá ở đó**. Ghi `data-tier-downgraded="true"`.
4. Chỉ nạp MỘT tầng tại một thời điểm. Cơ chế HQ+LQ song song hiện nay là thứ tạo ra 4,8 MB.

### B — Kernel: `ui tenant-lint` (linter — chuẩn phải có cả cửa vào lẫn cửa gác)

Thêm hai check, cùng cấp lỗi như các check hiện có:
- `single-tier-scrub` — một cấu hình mount chỉ khai báo đúng một thư mục frame.
- `viewport-only-tier` — chọn tầng chỉ đọc `matchMedia`/`innerWidth` mà không đọc tín hiệu
  nào của `navigator.connection`.

Đây là luật của repo, không phải tuỳ chọn: *"A standard needs an emitter AND a linter.
Prose-only standards drift."*

### C — Trang showcase (người dùng đầu tiên của chuẩn)

Chuyển `page.js` sang API `tiers`. Bỏ nhánh chọn tầng theo `matchMedia` hiện tại — nó
chính là `viewport-only-tier` mà linter mới sẽ bắt.

Thêm `<link rel="preload" as="image">` cho **frame đầu của cảnh hero mà thôi**. Preload
nhiều hơn sẽ tranh băng thông với CSS/JS tới hạn — một dòng, không phải một danh sách.

### D — Pipeline: `extract-frames.sh` phát ra manifest

Kèm `manifest.json` mỗi cảnh: `{ frameCount, tiers: [{ dir, width, quality, bytes, kbPerFrame }] }`.
Không có số đo thì cả ngân sách lẫn linter đều chỉ là lời nói.

## 5 · CỔNG NGHIỆM THU

Đo lại bằng `scratchpad/measure-payload.mjs` (mobile) và `-desktop.mjs`, có và không có
`THROTTLE=1`, rồi so với §1:

1. Desktop cuộn hết trang trên link không bóp: **< 1 500 KB** (từ 4 800 KB).
2. Desktop @Fast4G: số byte lấy được phải ≈ số byte cần (chênh < 15%) — tức là không còn
   đói frame. Đây là cổng quan trọng nhất; §1 hiện chỉ đạt 37%.
3. Mobile không xấu đi: ≤ 800 KB cuộn hết trang, tới `load` ≤ 260 KB.
4. `data-tier-reason` có mặt và đọc được ở cả 3 cảnh, trên cả desktop lẫn mobile.
5. Chất lượng không sập ở desktop mạng nhanh: cảnh vẫn dùng tầng cao nhất khi
   `effectiveType === '4g'` và `downlink` cao.
6. 5 linter cũ + `verify-026.mjs` + `test-mobile-scrub.mjs` vẫn xanh nguyên.
7. Check mới của `tenant-lint` phải FAIL trên một fixture cố tình sai (một tầng, hoặc chọn
   theo viewport) và PASS trên trang thật — chứng minh cửa gác thật sự gác.

## 6 · QUYẾT ĐỊNH ĐÃ CHỐT

1. **Phạm vi** — owner 2026-07-31: ghi nhận thành cải tiến, chưa làm. Khi mở thì làm cả
   kernel lẫn trang trong một đợt, vì luật repo đòi chuẩn phải có cả emitter lẫn linter;
   làm nửa vời sẽ đẻ ra đúng thứ `prose-only standards drift` mà repo đã trả giá.
2. **Safari** — rơi về bề rộng khung nhìn. Không đo băng thông chủ động. Xem khối trạng
   thái đầu file.

## 7 · HẠN DÙNG CỦA SỐ ĐO

Mọi con số ở §1 đo lúc **2026-07-31 20:35** trên commit đang deploy, mạng nhà, máy M4 Pro.
Chúng **hết hạn** khi bất kỳ thứ nào sau đây đổi: số frame, mức nén khi trích, cách engine
xếp lịch nạp, hoặc hạ tầng phục vụ (hiện là GitHub Pages, có CDN riêng của nó).
**Đo lại trước khi bắt tay, đừng tin bảng này.** Script: `scratchpad/measure-payload.mjs`
và `measure-payload-desktop.mjs` (đã vendored vào repo showcase tại `pipeline/`? — CHƯA;
nếu mở việc thì chép vào repo trước, vì scratchpad không sống qua phiên).
