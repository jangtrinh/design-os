# SPEC 027-U1 — lát cắt engine: chuỗi nhiều cảnh + linger + renderer video sau cờ

Tầng: direction Fable (`specs/027-scroll-cinema/docs/DIRECTION-skill-shape.md`)
→ spec Opus → thực thi Sonnet. **Đây là ĐƠN VỊ 1.** Skill graduation là đơn vị 2, làm sau.

---

## 0 · BASELINE (đo 2026-08-02 11:00, HEAD `f20201e`)

```
npm test → Tests 3 failed | 2725 passed | 6 skipped (2734)
```

Ba lỗi **đã đỏ sẵn trước khi chạm vào gì**, không liên quan scroll-cinema:

| File | Test |
|---|---|
| `tests/cmd-init-built-binary.test.ts` | templates walk: bỏ qua decoy, tìm templates thật |
| `tests/cmd-init-built-binary.test.ts` | trả WRITE_ERROR khi không thấy templates hợp lệ |
| `tests/spec-022-lifecycle.test.ts` | post-phase-a: Phase A đầy đủ qua gate của chính nó |

**Hai cái đầu nằm trong vùng nổ** — chúng test đúng cơ chế đi tìm `templates/`, mà việc này
thêm file vào `templates/tenant/`. Nếu số lỗi đổi khác 3, hoặc nội dung lỗi đổi, **DỪNG và báo**:
đó là hồi quy do ta gây ra, không phải nhiễu có sẵn.

Không sửa 3 lỗi này. Chúng ngoài phạm vi.

## 1 · MỤC TIÊU

Engine tenant (`templates/tenant/scrub-section.js`, 294 dòng) học thêm ba năng lực, để
`es-scroll-cinema` (đơn vị 2) có bề mặt kernel hoàn chỉnh mà trỏ vào:

1. **Chuỗi nhiều cảnh** trong một instance — cảnh ↔ đoạn nối, như SEGMENTS của 021.
2. **`linger`** — bẻ cong thời gian để camera lắng giữa cảnh.
3. **Renderer video-blob** — nhưng **sau một cờ**, không nằm trong bản phát mặc định.

## 2 · RÀNG BUỘC (vi phạm là hỏng cả họ)

- **Tenant Law nguyên vẹn**: không `window.scrollY`/`pageYOffset`, không `window.scrollTo`,
  không `position: fixed`, không ghi `:root`, không vòng rAF riêng cho từng section. Tiến độ
  CHỈ đến từ `sectionEl.getBoundingClientRect()`.
- **`ui tenant-lint` phải PASS trên bản phát ra** ở mọi tổ hợp cờ. Đây là cảm biến trôi của
  Fable: *nếu emitter có chuỗi mà trượt chính lint của nó → DỪNG, đó là 021 khởi động lại bên
  trong kernel.*
- **Không nhân bản engine.** Một nguồn sự thật. Không tạo `scrub-section-video.js` là bản sao
  có thêm renderer — xem §3.3 để biết cách tránh.
- Tương thích ngược: mọi config đang chạy (spec 026) phải chạy y nguyên, không sửa một dòng nào
  ở `specs/026-drone-showcase/site/page.js`.

## 3 · CÔNG VIỆC

### 3.1 — Chuỗi nhiều cảnh

API mở rộng, **thêm chứ không thay**:

```js
// dạng cũ (026) vẫn hợp lệ — coi như chuỗi một cảnh
mountScrubSection(el, { frames, framesLQ, frameCount, beats })

// dạng mới
mountScrubSection(el, {
  scenes: [
    { frames, framesLQ, frameCount, beats, scroll?, linger? },
    …
  ],
  connectors: [ { frames, framesLQ, frameCount, scroll? } | null, … ], // dài = scenes.length - 1
})
```

- Dựng chuỗi phân đoạn xen kẽ `scene0, conn0, scene1, conn1, … sceneN-1`. `connectors[i]` rỗng
  thì hai cảnh nối trực tiếp (không có đoạn bay giữa) — 021 đã cho phép, giữ nguyên hành vi đó.
- Tiến độ toàn section chia theo trọng số `scroll` của từng phân đoạn (mặc định bằng nhau).
- **Chỉ MỘT phân đoạn được arm tại một thời điểm.** Phân đoạn rời khung → `clearCache()` như
  hành vi IntersectionObserver hiện có. Đây là điều khoản 2 của Tenant contract, đừng nới.
- Cache frame **theo từng phân đoạn**, không gộp một mảng phẳng — nếu không, `releaseFar()` sẽ
  tính khoảng cách xuyên qua ranh giới cảnh và giữ nhầm frame.

### 3.2 — `linger`

Port hàm thuần từ `specs/021/site/scrub-engine.js:213`:

```js
const lingerEase = (x, L) => { L = clamp(L); const c = x - 0.5;
  return (1 - L) * x + L * (4*c*c*c + 0.5); };
```

Áp lên tiến độ **cục bộ trong phân đoạn**, sau khi đã chia trọng số, trước khi ánh xạ sang chỉ
số frame. `linger: 0` (mặc định) = tuyến tính, không đổi hành vi cũ. Trần `0.6` như 021 ghi.

### 3.3 — Renderer video sau cờ — KHÔNG được nhân bản engine

`ui tenant-scaffold <dir> [--media video]`:

- Mặc định: phát `scrub-section.js` + `.css` + `test-tenant.mjs` **y như hiện nay**.
- `--media video`: phát **thêm một file** `scrub-renderer-video.js`.

Cách làm để không có hai bản engine:

- `scrub-section.js` phơi ra một sổ đăng ký renderer, ví dụ
  `mountScrubSection.registerRenderer('video', factory)`.
- Renderer imageseq nằm sẵn trong engine (mặc định, luôn có).
- `scrub-renderer-video.js` là file **độc lập**, tự đăng ký khi được nạp. Cấu hình chọn nó bằng
  `renderer: 'video'` ở cấp scene.
- Interface tối thiểu đúng Ruling 2: `{ load(), draw(progress), poster(), busy(), prime() }`.

**Không splice chuỗi, không sinh code bằng chắp nối văn bản.** Nếu thấy mình đang cắt dán một
khối `if (media === 'video')` vào giữa template thì dừng lại — đó là con đường đẻ ra bản sao.

Nguồn port: đường blob-seek trong `specs/021/site/scrub-engine.js` (`videoScrubRenderer`).
**Bỏ hết phần đọc `window.scrollY` và `position: fixed`** — chúng là lý do bản 021 trượt lint.

### 3.4 — Trang fixture từ footage TỔNG HỢP

`templates/tenant/` không phải chỗ chứa fixture. Đặt ở `tests/fixtures/tenant-chain/`:

- Script sinh footage bằng ffmpeg thuần, **không cần tài sản ngoài, không cần mạng**:
  hai clip test ngắn (ví dụ `testsrc2` + `smptebars`, 2s, 24fps), rồi trích frame WebP qua
  đường PNG → `cwebp` (brew ffmpeg **không có** libwebp — đã trả giá ở 026).
- Trang fixture mount một chuỗi 2 cảnh + 1 đoạn nối, có `linger` khác 0 ở một cảnh.
- Thêm một biến thể dùng `--media video` để chứng minh nhánh video **chạy được hôm nay**, không
  phải code chết chờ footage thật của ai đó. Đây chính là cách gỡ mà Fable đề xuất cho quyết
  định "port ngay" của owner.

## 4 · CỔNG NGHIỆM THU

1. `ui tenant-lint` **PASS** trên: bản phát mặc định · bản phát `--media video` · trang fixture.
2. Headless (Playwright, chromium-1228 đã cài; xem `scratchpad/verify-026.mjs` để lấy mẫu
   `executablePath`): cuộn **cả hai chiều** qua trang fixture —
   - mỗi phân đoạn đạt frame đầu và frame cuối,
   - canvas vẽ pixel thật (dải sáng-tối > 8 mức), không phải khung phẳng,
   - chỉ một phân đoạn arm tại một thời điểm,
   - cuộn ngược cho ra đúng dãy frame đảo ngược (đây là chỗ chuỗi hay vỡ nhất),
   - không lỗi console, không 4xx.
3. `npm test` — **đúng 3 lỗi cũ ở §0, không hơn**. Số khác đi là hồi quy, phải báo.
4. **Suite hồi quy 026 xanh nguyên**: 5 linter + `verify-026.mjs` + `test-mobile-scrub.mjs`
   (95/0), chạy trên `specs/026-drone-showcase/site/` **không sửa một dòng nào** trong đó.
   Đây là bằng chứng tương thích ngược.
5. Đếm dòng `templates/tenant/scrub-section.js` trước/sau, ghi vào report. Fable cảnh báo
   294 → ~450+; **câu "engine 294 dòng" trên trang showcase sẽ sai** — ghi nhận, đơn vị 2 sửa chữ.

## 5 · KHÔNG LÀM

- Không đụng `specs/026-drone-showcase/` (nó là chứng cứ hồi quy).
- Không sửa 3 test đỏ sẵn ở §0.
- Không đổi tên/không đụng skill `scroll-world` — đó là đơn vị 2.
- Không dựng `scroll-cinema-lint` — owner đã hoãn sau tốt nghiệp.
- Không giải quyết #112 ở đây.

## 6 · CÂU HỎI CÒN MỞ

Không. Direction đã chốt; mọi lựa chọn còn lại nằm trong spec này.
