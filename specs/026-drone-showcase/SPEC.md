# SPEC 026 — OPAH ONE showcase (bản dựng lại theo direction của Fable)

## ⚠ OWNER OVERRIDE 2026-07-31 16:18 — thắng mọi mục dưới nếu mâu thuẫn

1. **Copy toàn trang sang TIẾNG ANH, cắt ngắn** — mọi chuỗi người đọc thấy được, kể cả
   `sr-only`, `alt`, `<title>`, meta. Giữ nguyên mọi con số và đơn vị, không bịa thêm.
   Comment code vẫn tiếng Việt. `<html lang="en">`.
2. **Title lớn KHÔNG có dòng mô tả** — huỷ đính chính "dòng caption mono dưới số 249" ở T4.1.
   Cảnh phim chỉ mang title, hết. Đơn vị `G` trên con số vẫn giữ. `.lede` ở section tĩnh vẫn giữ.
3. **Title cảnh phim ĐÈ LÊN ẢNH**, không nằm ở mép dưới — `.scrub__chapter-pin` về
   `align-items: center`, bỏ gạch `border-top` và neo đáy, chữ căn giữa khung, chạy rộng trên
   phim. Vẫn mực đen trên nền studio trắng: không scrim, không gradient, không blur. Nếu thân
   drone rơi vào nét chữ làm tụt tương phản thì DỜI khối chữ theo trục dọc, không thêm lớp nền.
4. **Thêm PARALLAX** — chữ trôi khác tốc độ với phim. Chỉ bằng CSS, lái bằng `--scrub-progress`
   engine đã ghi sẵn (ví dụ `translate3d(0, calc((var(--scrub-progress) - 0.5) * -8vh), 0)`).
   Không đọc `window.scrollY`, không đưa GSAP vào `.scrub`, không để hai chủ ghi cùng một
   thuộc tính. `prefers-reduced-motion: reduce` → tắt hẳn parallax.

Trạng thái: sẵn sàng thực thi. Tầng thực thi: Sonnet. Direction: Fable (stage 1). Spec: Opus (stage 2).

Đọc trước khi sửa dòng nào:
- `knowledge/personas/graphic-modernist.md` → persona `kinetic-swiss-punk`
- `knowledge/signature-devices.md`, `knowledge/gsap-motion-direction.md`
- `brand/design/soul.md`
- `specs/026-drone-showcase/site/scrub-section.js` (contract engine) + `scrub-section.css`

---

## 0 · SPINE (mọi quyết định phải quy về đây)

**Trang này là hồ sơ bản vẽ kỹ thuật của chiếc drone, và bản vẽ tự trình diễn chính nó.**
Khung phim trắng = tờ giấy vẽ. Mono hoa = ghi chú kích thước. Gạch 1px = nét dựng.
Số 01–06 ở tag section = số điều khoản của hồ sơ. Khối tối cuối trang = **khung tên bản vẽ**.

Lời hứa của drone ("38 chi tiết, mỗi mảnh có đúng một chỗ") và lời hứa của Design:OS
("không một pixel nào ngẫu nhiên") là **cùng một lời hứa**: độ chính xác chứng minh bằng
việc tháo rời. Section nào không biện minh được là một tờ trong hồ sơ thì không ship.

## 0.1 · HAI ĐỘNG TÁC CHỮ KÝ (không có động tác thứ ba)

1. **Chính — display type cỡ viewport, bắn ĐÚNG MỘT LẦN**: số **249** ở beat 1 của hero.
2. **Phụ — ngữ pháp callout ping vuông** (chấm + gạch dẫn 1px + nhãn mono + panel ink),
   **chỉ sống trong cảnh `#anatomy`**.

Cấm mọi thứ khác to tiếng: không echo type, không marquee, không sticker/nghiêng,
không `mix-blend-mode: difference` (đảo `#FF3E00` ra cyan lạc bảng màu).
Băng cam to tiếng bằng **màu**, không bằng device — đó là toàn bộ ngân sách của nó.

## 0.2 · THANG CHỮ — đỉnh rơi đúng một chỗ

`numeral` (mới) → chỉ hero beat 1 · `display` → chỉ title của cảnh scrub ·
`head` → claim line, section head, title cảnh anatomy · `head--sm`/`sub`/`lede` như hiện tại ·
`caption` mono hoa → giọng đối trọng ở mọi nơi.

Bất biến kiểm được bằng grep: `--size-numeral` xuất hiện đúng 1 lần trong CSS;
`--size-display` không xuất hiện ngoài `scrub-type.css`.

## 0.3 · MỘT HỆ CHUYỂN ĐỘNG DUY NHẤT — "nét mực dựng lên"

Mọi thứ vào khung theo cùng một cách: **lộ ra từ sau một mép hairline, theo một trục**.
- Đường cong duy nhất: `cubic-bezier(0.16, 1, 0.3, 1)`. Không có đường cong thứ hai.
- Đúng ba thời lượng: `--motion-fast` 180ms (phản hồi trạng thái) · `--motion-base` 560ms
  (lộ phần tử) · `--motion-slow` 900ms (chỉ dành cho chữ cỡ display).
- Ranh giới sở hữu: **GSAP** sở hữu section tĩnh · **engine + CSS** sở hữu cảnh scrub ·
  **page.js + CSS** sở hữu tour annotation. Không thuộc tính nào có hai người ghi.
- `prefers-reduced-motion: reduce` → mọi thứ hiện sẵn, không mask, không đếm, không tour, không ping.

## 0.4 · TRANG ĐƯỢC PHÉP NÓI VỀ MÌNH ĐÚNG HAI CHỖ

Khối colophon và một dòng footer. Không tên công cụ trong copy sản phẩm, không badge
"built with" ở hero, không khoe lint ngoài colophon.

---

## 1 · TRẠNG THÁI HIỆN TẠI (đã kiểm trên đĩa)

Có sẵn, không phải làm lại:
- `site/scrub-section.js` + `.css` (engine Tenant, `ui tenant-scaffold`), `site/lib/gsap.min.js` + `ScrollTrigger.min.js` (3.15.0)
- `site/assets/`: `hero/` + `hero-lq/` 96 frame · `explode/` + `explode-lq/` 151 · `fly/` + `fly-lq/` 96
- `design/tokens.json` → `site/tokens.css` qua `ui tokens compile`
- `pipeline/extract-frames.sh`

Hỏng / thiếu — đây là danh sách việc:
- `index.html` **chưa link** `sections.css` và `scrub-type.css` → trang đang vỡ bố cục
- `page.js` **không mount `#modes`** → cảnh phim thứ ba chết hẳn
- `page.js` vẫn truyền `eyebrow/body/tags` vào beat → engine render `.scrub__tags` thành viên thuốc `border-radius: 999px` = vi phạm persona đang sống trên trang
- `anno.css` + lớp annotation trong `page.js` là bản cũ, phải viết lại toàn bộ
- `motion.js` **chưa tồn tại** nhưng `index.html` đã tham chiếu

---

## 2 · CÔNG VIỆC

### T1 — Token
`design/tokens.json`: thêm vào nhóm `size`:
```json
"numeral": { "$type": "dimension", "$value": "clamp(6rem, 20vw, 17rem)" }
```
Rồi chạy, từ `specs/026-drone-showcase/`:
```
ui tokens compile design/tokens.json --target css > site/tokens.css
```
Không thêm token nào khác. Không sửa giá trị token đang có.

### T2 — `site/index.html`

1. Thêm hai link CSS còn thiếu, đúng thứ tự sau `scrub-section.css`:
   `page.css` → `sections.css` → `scrub-type.css` → `anno.css` → `hero-fold.css`.
2. **Parts list — đánh số lại theo thứ tự trái→phải trên khung hình.** Thứ tự mới, bắt buộc:
   `01 Cánh quạt · 02 Động cơ không chổi than · 03 Cụm camera · 04 Vỏ trên · 05 Bo mạch chính · 06 Pin`.
   Nội dung mô tả giữ nguyên, chỉ đổi thứ tự và số. Số này phải khớp tuyệt đối với `POINTS` trong `page.js`.
3. **Colophon** (`#built`): tag đổi thành `05 — Hồ sơ bản vẽ`. Thêm một hàng khung tên ở
   cuối section, dùng lại ngữ pháp `.row`, mang nội dung đang nằm ở footer:
   `343 frame WebP · engine Tenant 294 dòng · GSAP 3.15 · 0 dependency khác`.
4. **Footer** rút còn một dòng: mark + `trang mẫu dựng để trình diễn Design:OS`. Bỏ `.foot__b`.
5. Không thêm markup cho hero fold ở đây — `page.js` dựng nó (xem T3.4), vì nó phải nằm
   trong `.scrub__stage` mới ghim được.

### T3 — `site/page.js`

**T3.1 — Beat chỉ còn `title`.** Xoá `eyebrow`, `body`, `tags` khỏi MỌI beat của MỌI cảnh.
Giữ `range`. Beat cuối cảnh `#anatomy` **không có title** (object chỉ có `range`) — chú thích
chiếm khung, chữ biến mất hoàn toàn.

Hero (`frames: assets/hero/`, `framesLQ: assets/hero-lq/`, `frameCount: 96`):
- beat 1 `range [0, 50]`, `title: '249'`
- beat 2 `range [50, 95]`, `title: 'Va vào tường\nthì nảy ra,\nkhông rơi.'`

Anatomy (`explode/`, `explode-lq/`, 151):
- beat 1 `range [0, 55]`, `title: 'Một khối liền,\nnhìn từ ngoài.'`
- beat 2 `range [55, 112]`, `title: '38 chi tiết,\nkhông cái nào thừa.'`
- beat 3 `range [112, 150]`, không title

**T3.2 — Mount `#modes`** (`fly/`, `fly-lq/`, 96), ba beat chia đều 96 frame, chữ dẫn dắt:
- `range [0, 31]`, `title: 'CINE'`
- `range [32, 63]`, `title: 'NORMAL'`
- `range [64, 95]`, `title: 'SPORT'`

**T3.3 — Số liệu của từng mode** nằm ở đâu: mỗi beat kèm đúng một dữ kiện có thật đã có
trên trang. Vì beat chỉ còn `title`, dựng dữ kiện bằng CSS `::after` trên
`.scrub--modes .scrub__chapter:nth-child(n) .scrub__title` (T4.3), nội dung:
`tốc độ xoay còn 40%` / `GPS giữ vị trí` / `68 km/h`. Không bịa thêm số nào.

**T3.4 — Hero fold** (soul: 5/5 hero tham chiếu đều có cặp CTA + bằng chứng thật).
`page.js` chèn vào `.scrub__stage` của hero một khối `.fold`:
- hàng đọc kiểu kính ngắm, mono hoa, trên một gạch 1px chạy hết bề ngang:
  `249 G · 4K 60 · 31 PHÚT · 10 KM` (mọi số đều đã có trong bảng thông số — không thêm số mới)
- cặp CTA: đặc `Đặt trước` → `#cta`, viền `Xem thông số` → `#specs`
Khối này neo đáy stage, ăn theo lưới 12 cột. Nó là link thật nên phải nhận được chuột và bàn phím.

**T3.5 — TOUR ANNOTATION (viết lại toàn bộ).**

Toạ độ + nội dung, theo đúng thứ tự trái→phải (`x`,`y` là % của khung hình 16:9 gốc):

| # | x | y | side | tên | dòng spec |
|---|---|---|---|---|---|
| 01 | 11.5 | 44.0 | down | Cánh quạt | Polycarbonate gập được, thay không cần dụng cụ |
| 02 | 18.5 | 42.0 | up | Động cơ | Cỡ 1103, 11 000 vòng/phút, vòng bi kép |
| 03 | 49.5 | 61.5 | down | Cụm camera | Cảm biến 1/1.3 inch, gimbal cơ khí một trục |
| 04 | 50.0 | 17.5 | up | Vỏ trên | Nhựa PA12 ép phun một khối |
| 05 | 67.0 | 52.0 | up | Bo mạch chính | Sáu lớp, IMU kép và chip truyền hình |
| 06 | 76.5 | 52.0 | down | Pin | 2 450 mAh nguyên khối |

Giữ nguyên hàm `syncFrame()` đang có (toán cover-crop `CROP_Y = 0.42`) — nó đã đúng.

Markup mỗi điểm: `<button class="anno__pt" aria-expanded>` chứa `.anno__dot`, `.anno__ping`,
`.anno__rule`, và `.anno__panel` (caption mono + dòng spec + chân panel `n / 6` + `.anno__meter`).
Tên khả truy cập của nút = `"01 Cánh quạt"`.

Máy trạng thái — cài đúng như sau, không tự ý thêm bớt:
- **HIDDEN** khi `--scrub-progress < 0.88` hoặc section chưa armed → lớp `opacity: 0` **và**
  `visibility: hidden` (bàn phím không được tab vào nút vô hình). Timer tắt.
- **TOURING** khi ≥ 0.88 và armed → sáu chấm hiện, điểm 01 active ngay lập tức kèm panel mở
  (đây là trạng thái nghỉ trước vòng xoay đầu tiên), cứ 5s sang điểm kế, hết 06 quay lại 01.
- **HOVER** trên chấm hoặc panel đang mở → điểm đó active ngay (`--motion-fast`), timer tạm dừng.
  Chuột rời khỏi lớp → chạy lại với một lượt 5s mới từ điểm hiện tại.
- **FOCUS** bàn phím → xử sự y hệt hover. Rời focus khỏi lớp → chạy lại.
- **ACTIVATED** (click/tap/Enter/Space) → điểm đó active, **dừng xoay vĩnh viễn cho lượt xem này**.
- **RESET** khi progress tụt dưới 0.88 hoặc section disarm → về HIDDEN; lần vào sau là tour mới từ 01.
- **REDUCED** (`prefers-reduced-motion: reduce`) → không timer, không ping, không meter; chấm hiện,
  01 mở sẵn, hover/focus/click vẫn chạy.
- **MOBILE** (<860px) → giữ như hiện tại: chỉ chấm, trang trí, `aria-hidden`, không tour.

Neo panel: mở về phía tâm khung (`x < 50%` → sang phải, ngược lại sang trái; `y < 50%` → xuống
dưới, ngược lại lên trên), cách chấm `--space-2` dọc theo gạch dẫn, rồi **kẹp trong hộp
`.scrub__stage`** (KHÔNG phải khung 16:9 toán học — cover-crop tràn ra ngoài và lớp sẽ cắt mất)
với lề tối thiểu `--space-2`; gạch dẫn co giãn để bắc cầu.

`page.js` chỉ ghi class (`.is-live` trên lớp, `.is-active` trên một điểm) và biến neo panel.
Mọi transition do CSS. GSAP không được chạm vào cảnh scrub.

### T4 — CSS

**T4.1 `scrub-type.css`** — giữ concept "câu đơn trên phim" đang có. Thêm:
- Hero beat 1: `font-size: var(--size-numeral)`, `letter-spacing: -0.06em`, và đơn vị
  `G` qua `::after` ở cỡ `--size-caption`, mono, màu `--color-brand-text`.
- Hero beat 1 còn một **dòng caption mono** ngay dưới con số: `dưới ngưỡng đăng ký của 41 quốc gia`
  — mono, `--size-caption`, hoa, letter-spacing 0.16em, `--color-ink-soft`, xuống dòng riêng.
  Đây KHÔNG phải số liệu mới: câu này đã có ở `.claim__foot` của băng cam. Không được mang nó
  vào bằng cách trả `eyebrow`/`body` về beat — beat vẫn chỉ có `title`.
  Nó phải khác đăng ký (register) với hàng đọc kính ngắm ở fold: caption bám sát con số,
  hàng đọc nằm trên gạch đáy fold.
- **Giết viên thuốc tag**: `.scrub__tags { display: none }` — engine vẫn có thể render chúng nếu
  ai đó thêm `tags` lại; đây là hàng rào chứ không chỉ là dọn dẹp.
- `.scrub--modes` không được dùng `--size-head`; các mode word dùng `--size-display`.

**T4.2 `sections.css`**
- `.claim__line` → `font-size: var(--size-head)`, giữ `max-width: 22ch` để nó gãy ba dòng cứng.
- Hàng khung tên trong colophon: dùng lại `.row`, cột cuối `.row__k` mang chữ ký.
- Footer rút một dòng, bỏ quy tắc `.foot__b`.

**T4.3 `scrub-type.css`** — dữ kiện của ba mode qua `::after` (xem T3.3), mono, `--size-caption`,
`--color-ink-soft`, xuống dòng riêng dưới mode word.

**T4.4 `anno.css`** — viết lại toàn bộ theo ruling:
- `.anno__dot` ô vuông đặc `--color-brand`, 8px nghỉ / 12px active (đổi bằng `transform: scale`,
  KHÔNG đổi `width/height`), nằm trong hit target 44×44px trong suốt.
- `.anno__ping` viền 1px `--color-brand`, `scale(1)→scale(3)` + `opacity 1→0`, lặp 2.5s,
  **chỉ trên điểm active**, chỉ `transform`/`opacity`.
- `.anno__panel` khối `--color-ink` phẳng, `--radius-none`, không bóng, padding `--space-2`,
  `width: min(320px, 40vw)`. Caption mono màu `--color-brand`; dòng spec `--color-ink-invert-soft`
  cỡ `--size-small`; chân panel `n / 6` mono + `.anno__meter` gạch 1px `--color-brand` chạy
  `scaleX(0)→scaleX(1)` đúng 5s (linear — đây là đồng hồ, ngoại lệ duy nhất khỏi đường cong chung).
- `.anno__rule` giữ vai gạch dẫn 1px, nối mép chấm tới mép panel.
- Transition trạng thái: `--motion-base` với đường cong chung; kích hoạt chấm `--motion-fast`.
- `prefers-reduced-motion: reduce`: tắt ping, tắt meter, không animation nào tự chạy.

**T4.5 `hero-fold.css` (mới)** — khối `.fold`: neo đáy `.scrub__stage`, `position: absolute`
(KHÔNG `fixed`), lưới 12 cột trùng `.grid`, gạch 1px phía trên hàng đọc, mono hoa `--size-caption`,
cặp CTA dùng lại `.btn` / `.btn--brand` / `.btn--ghost`.

### T5 — `site/motion.js` (mới) — GSAP, chỉ cho section TĨNH

Đăng ký `ScrollTrigger` một lần. Dùng `gsap.matchMedia()`; nhánh `reduce` gọi
`gsap.set(..., { clearProps: 'all' })` rồi return — không tạo tween nào.

Ba biểu hiện của "nét mực dựng lên", tất cả dùng `ease: 'power4.out'`
(tương đương `cubic-bezier(0.16,1,0.3,1)`) và chỉ ba thời lượng ở §0.3:
1. `[data-split]` — tách theo dòng, mỗi dòng bọc trong `.line-mask > span`, dựng lên từ `yPercent: 100`,
   `duration` = `--motion-slow` cho cỡ display, stagger 0.08. Tách sau khi font đã sẵn
   (`document.fonts.ready`) rồi gọi `ScrollTrigger.refresh()` một lần.
2. `[data-row]` — hàng vào theo `autoAlpha` + `y: 16`, stagger theo danh sách, `--motion-base`.
3. `[data-count]` — đếm số ở dải `.figs`, `--motion-slow`, kết thúc đúng giá trị trong thuộc tính.

`toggleActions: 'play none none reverse'`. Không `scrub`. Không markers. Không đụng `.scrub` nào.

---

## 3 · CẤM (thừa hưởng từ direction, kiểm được)

- Không `border-radius` khác `--radius-none`, không `box-shadow`, không `blur`/`filter`/
  `backdrop-filter`, không `gradient` ở bất kỳ chỗ nào mới.
- Không ảnh và không nút bên trong panel annotation. Không bịa số liệu sản phẩm nào.
- Không device chữ ký thứ ba.
- `--size-display` không xuất hiện ngoài cảnh phim; `--size-numeral` không xuất hiện ngoài hero beat 1.
- Không đường cong easing thứ hai; không thời lượng nằm ngoài ba token.
- Không GSAP/ScrollTrigger bên trong bất kỳ `.scrub` nào; không thuộc tính nào có hai người ghi.
- Không `position: fixed`, không ghi `:root`, không đọc `window.scrollY` — Tenant Law.
- Không hex thô — mọi giá trị phải phân giải về `tokens.json`.
- Không animate `top/left/width/height` — chỉ `transform`, `opacity`, `clip-path`.
- Không đổi số thứ tự chấm mà không sắp lại `#parts-list` trong cùng một lần sửa.

## 4 · CỔNG NGHIỆM THU

Chạy trong `specs/026-drone-showcase/site/`, tất cả phải sạch:
```
ui tenant-lint index.html
ui a11y-lint index.html
ui validate-layout index.html
ui taste-lint index.html
ui content-lint index.html
```
Server đã chạy sẵn ở `http://127.0.0.1:4312` (cổng cố định của repo, KHÔNG đổi).
Nếu chưa chạy: `python3 -m http.server 4312 --bind 127.0.0.1` từ thư mục `site/`.

Kiểm bằng chromium headless (không được chiếm foreground, không mở GUI):
1. Không lỗi console, không lỗi 404.
2. Cả ba `.scrub` đều đạt class `is-painted` (canvas thực sự vẽ, không phải khung trắng).
3. Ở `--scrub-progress = 1` của `#anatomy`: sáu nút chú thích tồn tại, đúng một nút
   `aria-expanded="true"`, cả sáu chấm nằm trong khung nhìn, panel không tràn khỏi `.scrub__stage`.
4. Sau 5s không tương tác, nút active chuyển từ 01 sang 02.
5. Với `prefers-reduced-motion: reduce`: không có chuyển động tự động nào (điểm active
   giữ nguyên sau 6s).
6. `grep -c 'size-numeral' *.css` = 1.

## 5 · CÂU HỎI CÒN MỞ

Không có. Direction đã chốt; mọi lựa chọn còn lại đều nằm trong spec này.
