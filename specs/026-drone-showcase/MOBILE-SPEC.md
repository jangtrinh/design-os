# SPEC 026-M — chiến lược scrub cho mobile (release blocker)

Tầng: direction đã có (Fable, giữ nguyên) · spec Opus · thực thi Sonnet.
Spec này chỉ nói về mobile. Mọi thứ khác trong `SPEC.md` giữ nguyên.

---

## 1 · CHẨN ĐOÁN (đo được, không suy diễn)

Chạy `scratchpad/diagnose-mobile.mjs` trên 390×844 / 844×390 / 430×932 / 768×1024 / 1024×768:

| Viewport | stage height đo được | = width × 1.25 |
|---|---|---|
| 390×844 | 488 | 390 × 1.25 ✓ |
| 430×932 | 538 | 430 × 1.25 ✓ |
| 768×1024 | 960 | 768 × 1.25 ✓ |
| 844×390 | 1055 | 844 × 1.25 ✓ |

Chiều cao stage bám theo **chiều NGANG** của khung nhìn, không phải chiều dọc. Thủ phạm nằm
trong chính file engine, `scrub-section.css:174-201`:

```css
/* mobile — non-pinned variant (pin fights touch momentum, see UC-04) */
@media (max-width: 860px) {
  .scrub__stage   { position: relative; height: auto; aspect-ratio: 4 / 5; }
  .scrub__story   { margin-top: 0; }
  .scrub__chapter-pin { position: relative; min-height: auto; }
  .scrub__copy    { opacity: 1; transform: none; }
}
```

Đây **không phải lỗi** — đó là một quyết định của `ui tenant-scaffold`: dưới 860px nó bỏ ghim,
biến stage thành một khối ảnh 4:5 tĩnh và xếp chữ bên dưới. Hệ quả đo được:

- `position: sticky` mất tác dụng → `stageTop` giữa cảnh = −666 / −1088 / −1201 px: phim **trôi
  khỏi màn hình** thay vì đứng yên. Người dùng thấy một tấm ảnh lướt qua, không thấy scrub.
- `--scrub-progress` VẪN chạy đúng 0 → 0.5 → 1 và canvas VẪN vẽ (`drawn=true`) ở mọi viewport.
  Nghĩa là toán tiến độ và đường frame đều lành; hỏng đúng một chỗ: **lớp ghim**.
- **Không có tràn ngang** ở bất kỳ viewport nào (`scrollWidth == clientWidth`). Các phần tử
  `.anno__*` toạ độ âm đã bị `.anno { overflow: hidden }` cắt gọn — không phải lỗi.
- **Kẹt cuộn có thật**: `scrollTo(scrollHeight)` dừng ở 14590/15106 (390×844), 12448/12792
  (844×390), 15317/15693 (430×932) — hụt ~350-520px ở mọi viewport.
- Console sạch, không 4xx, ở mọi viewport.

Vậy yêu cầu của owner ("đừng chỉ ẩn hay tắt trải nghiệm") chính là yêu cầu **thay thế biến thể
non-pinned của scaffold bằng một chiến lược ghim thật cho cảm ứng**.

## 2 · RÀNG BUỘC

- **KHÔNG sửa `scrub-section.css` / `scrub-section.js`.** Đó là output nguyên văn của
  `ui tenant-scaffold`; sửa vào đó là phân nhánh khỏi kernel. Ghi đè từ stylesheet của mình
  (nạp sau nên thắng cascade) và ghi rõ lý do ngay tại chỗ ghi đè.
- **KHÔNG nạp lại ScrollTrigger.** Nó là nguyên nhân `tenant-lint` fail (đọc `window.scrollY`,
  đặt `position: fixed`) và đã bị gỡ có chủ đích. Việc "refresh khi resize/orientation" phải làm
  bằng đường IntersectionObserver + `resize`/`orientationchange` đang có.
- Tenant Law vẫn nguyên: không `window.scrollY`, không `position: fixed`, không ghi `:root`.
- Không hex thô; mọi giá trị qua token.

## 3 · CÔNG VIỆC

### M1 — Ghim thật trên mobile (file: `scrub-type.css`)

Ghi đè khối `@media (max-width: 860px)` của engine, khôi phục hợp đồng ghim:

- `.scrub--film .scrub__stage`: `position: sticky; top: 0; height: 100svh; aspect-ratio: auto;`
- `.scrub--film .scrub__story`: `margin-top: -100svh;`
- `.scrub--film .scrub__chapter`: `min-height: 100svh;`
- `.scrub--film .scrub__chapter-pin`: `position: sticky; top: 0; min-height: 100svh;`
- Trả lại trạng thái nghỉ của `.scrub__copy` (opacity 0 → 1 khi `.is-active`) như desktop.

**Dùng `svh`, KHÔNG dùng `dvh` trên mobile.** `dvh` đổi giá trị mỗi lần thanh URL của trình duyệt
ẩn/hiện; chiều cao section đổi giữa lúc cuộn làm `travel` đổi theo, tiến độ nhảy và điểm ghim
giật. `svh` là chiều cao nhỏ nhất và **không đổi** trong suốt phiên cuộn — ổn định hơn đúng cái
giá là một dải trống khi thanh URL thu lại, đổi lấy việc scrub không giật. Desktop giữ `dvh`.

### M2 — Chọn tầng frame theo thiết bị (file: `page.js`)

Trên mobile chỉ nạp MỘT tầng: truyền `frames: 'assets/<scene>-lq/'` và **bỏ hẳn** `framesLQ`.
Lý do: engine nạp song song cả hai tầng quanh frame đang xem; trên máy yếu, giải mã WebP 1600px
là chi phí lớn nhất của mỗi khung hình, và ở bề rộng 390-430 CSS px thì tầng 480px đã đủ.
Chọn tầng **một lần lúc mount**, đọc `matchMedia('(max-width: 860px)')`.

### M3 — Vượt ngưỡng breakpoint thì mount lại (file: `page.js`)

Vì M2 chốt tầng frame lúc mount, xoay ngang/dọc qua ngưỡng 860px sẽ để lại cấu hình sai.
`mountScrubSection` trả về hàm `unmount` — nghe `matchMedia('(max-width: 860px)').change`, và
**chỉ khi vượt ngưỡng** thì `unmount()` rồi mount lại với cấu hình mới. Không mount lại vì mỗi
lần `resize` (thanh URL ẩn/hiện bắn resize liên tục — đó là lý do phải nghe `change` của
matchMedia chứ không phải `resize`).

Sau mỗi lần mount lại: gọi `syncFrame()` của lớp annotation để hình học cover-crop khớp stage mới.

### M4 — Lớp annotation trên mobile (files: `page.js`, `anno.css`)

Hiện mobile chỉ có chấm, `aria-hidden`, không tour — tức là tắt trải nghiệm. Sửa:

- Giữ sáu chấm ở đúng toạ độ (đã đúng), bỏ `aria-hidden` khi lớp có tương tác.
- Panel trên mobile **không neo cạnh chấm** (khung quá hẹp, panel sẽ tràn): neo vào **đáy stage**,
  rộng hết bề ngang trừ lề, một panel tại một thời điểm. Chấm active vẫn phóng to + ping.
- Tour tự chạy 5s vẫn hoạt động; chạm vào một chấm thì dừng hẳn như desktop.
- `#parts-list` vẫn là bản chữ đầy đủ, không bỏ.

### M5 — Kẹt cuộn

Sau M1, đo lại. Nếu vẫn hụt: nguyên nhân gần như chắc chắn là tổng chiều cao section đổi sau khi
`svh` thay `dvh` — sửa ở tầng chiều cao, KHÔNG chèn padding bù ở cuối trang.

### M6 — Reduced motion giữ nguyên biến thể non-pinned

Biến thể "stage tĩnh 4:5 + chữ xếp dưới" của scaffold **chính là** bố cục reduced-motion đúng.
Đừng xoá nó — chuyển nó vào `@media (prefers-reduced-motion: reduce)` cho mobile, để người tắt
chuyển động vẫn đọc được toàn bộ nội dung mà không có ghim và không có scrub.

## 4 · CỔNG NGHIỆM THU (Playwright, tất định)

Viết `site/test-mobile-scrub.mjs` (không nằm trong `site/` khi deploy — xem ghi chú cuối) hoặc
scratchpad; chạy trên **390×844 · 430×932 · 768×1024 dọc, và 844×390 · 1024×768 ngang**, với
`hasTouch: true, isMobile: true`. Mỗi viewport, mỗi cảnh trong ba cảnh scrub:

1. Không tràn ngang: `documentElement.scrollWidth <= clientWidth + 1`.
2. Ghim đúng: giữa cảnh, `.scrub__stage` có `|rect.top| <= 2` và `rect.height` trong khoảng
   `[0.9, 1.02] × innerHeight`.
3. Nhả đúng: sau khi qua hết cảnh, `.scrub__stage` rời khỏi vị trí ghim (`rect.top < 0`).
4. Tới được frame ĐẦU và frame CUỐI: `--scrub-progress` đạt `<= 0.001` và `>= 0.999`.
5. Canvas vẽ thật: có dải sáng-tối > 8 mức (không phải khung phẳng).
6. Không kẹt cuộn: `scrollTo(scrollHeight)` phải tới được `scrollHeight - clientHeight` (sai số ≤ 4px).
7. Chữ đọc được: `.scrub__title` có `font-size >= 24px` và nằm trong khung nhìn khi cảnh active.
8. Console sạch: 0 lỗi, 0 phản hồi ≥ 400.
9. Reduced motion: dựng context với `reducedMotion: 'reduce'` → không ghim, nội dung vẫn đọc đủ,
   không có chuyển động tự động.

## 5 · SAU KHI TẤT CẢ CỔNG MOBILE XANH

1. Thêm `data-mobile-scrub-verified="true"` vào thẻ `<html>` của `site/index.html`.
2. Chạy lại 5 linter desktop + `verify-026.mjs` — phải xanh nguyên.
3. Chỉ khi đó mới publish; verify lại GitHub Pages trên URL thật.

Không báo "live" và không publish khi chưa có marker này trên HTML đã deploy.

## 6 · CÂU HỎI CÒN MỞ

1. Ngưỡng 860px của engine là hằng số trong file scaffold; ta ghi đè bằng cùng ngưỡng. Nếu sau này
   kernel đổi số đó thì hai bên lệch nhau — có nên đề nghị kernel phơi nó ra thành token không?
