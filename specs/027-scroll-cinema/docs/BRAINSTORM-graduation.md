# Brainstorm — gộp spec 021 + 026 thành skill/workflow dùng được

Ngày 2026-08-01. Trạng thái: **brainstorm, chưa quyết**. Không viết code.

---

## 1 · PHÁT HIỆN LỚN NHẤT: câu hỏi này ĐÃ ĐƯỢC PHÁN

`specs/021-.../docs/PHASE3-DIRECTION.md` — "Fable ruling on the scroll-cinematic family":

- **Tên họ: `scroll-cinema`** — *"những trang mà cuộn scrub một đoạn phim dựng sẵn nằm sau một
  lớp vỏ copy design:os yên tĩnh"*. Câu đó cũng chính là bài kiểm tra tư cách thành viên.
- **Ruling 1** — MỘT skill, HAI profile: `world | product`. Tên khi tốt nghiệp: **`es-scroll-cinema`**,
  gọi kèm `profile:`. Character bị loại khỏi họ.
- **Ruling 3** — *"Product is second. Not close."* Profile product là thứ **chứng minh tính tổng
  quát** của họ.
- **Ruling 5** — sống trong `specs/021` cho tới khi **product slice qua gate**, rồi tốt nghiệp qua
  cửa librarian. **KHÔNG phải một lệnh `ui` CLI** — xương sống của workflow là một bàn tay sinh
  nội dung cộng một **GATE do người gác**.
- **Ruling 2** — **MỘT engine.** Tách interface renderer, thêm backend canvas. Nhân đôi engine sẽ
  tái tạo lớp lỗi L1→L4 (*"cùng một điểm mù, hai người tiêu thụ"*).
- **Đơn vị build kế tiếp DUY NHẤT: P-1 "one-product orbit slice"** — bằng chứng nhỏ nhất rằng
  scroll-cinema là một họ chứ không phải một sự trùng hợp.

**Spec 026 CHÍNH LÀ P-1 đó, đã dựng xong và đã live.** Một sản phẩm, quỹ đạo orbit + explode,
renderer image-sequence trên canvas, gate do người gác, vỏ copy design:os.

Vậy việc phải làm không phải "nghĩ ra cách gộp". Là **đối chiếu 026 với các phán quyết đã có,
rồi mở cửa tốt nghiệp mà Ruling 5 đã mô tả**.

## 2 · MÂU THUẪN THẬT: chúng ta đang có ĐÚNG HAI ENGINE mà Ruling 2 cấm

| | `021/site/scrub-engine.js` | `tenant-scaffold` → `scrub-section.js` |
|---|---|---|
| Dòng | 634 | 294 |
| Phạm vi | **chiếm cả trang** (`position: fixed`, `window.scrollY`) | **nhúng được** (sticky, chỉ đọc rect của chính nó) |
| Renderer | video-blob + imageseq | imageseq |
| `ui tenant-lint` | **FAIL** (đọc scrollY, đặt fixed) | PASS |
| Ai dùng | 021 | 026 |

Header của `scrub-section.js` tự khai: *"Frame-drawing core ported verbatim from the reference
engine's imageSequenceRenderer"*. Tức là **code lõi đã bị chép**, đúng dạng "một điểm mù, hai
người tiêu thụ" mà Ruling 2 sinh ra để chặn.

**Nhưng Ruling 2 được phán TRƯỚC khi Tenant contract tồn tại như một chuẩn có linter.** Engine
của 021 hôm nay sẽ trượt chính cổng của kernel. Nên "extend scrub-engine.js" không còn là câu
trả lời đúng — chiều tiến hoá đã đảo.

**Đề xuất:** giữ tinh thần Ruling 2 (một engine), đổi bản sống sót → **`scrub-section.js` thắng**,
`scrub-engine.js` của 021 nghỉ hưu. Cái 021 có mà tenant chưa có là **renderer video-blob** và
**nav/route/linger của một trang toàn màn** — hai thứ đó port sang tenant, không phải ngược lại.

## 3 · HAI SPEC LÀ HAI NỬA CỦA MỘT WORKFLOW, KHÔNG PHẢI HAI BẢN TRÙNG

- **021 = LÀM RA phim** khi người dùng chưa có gì. Sinh cảnh + chuyến bay camera bằng gflow/Veo,
  khoá tính nhất quán, GATE người duyệt. Đây là phần đắt và khó.
- **026 = DỰNG TRANG quanh phim** khi đã có footage. Trích 2 tầng frame, token DTCG, tour chú
  thích, chiến lược mobile, 5 cổng lint, deploy.

Người dùng thật rơi vào một trong hai cửa:
- *"Tôi có sẵn video/sản phẩm"* → vào thẳng nửa 026.
- *"Tôi chỉ có một ý tưởng"* → nửa 021 sinh phim, rồi chảy vào 026.

Workflow đúng là **một đường, hai cửa vào**.

## 4 · THỨ 026 HỌC ĐƯỢC MÀ SKILL PHẢI MANG THEO (mỗi cái là một con bug đã trả giá)

1. **ffmpeg brew không có `libwebp`** → đường đi là ffmpeg → PNG → `cwebp`. Đừng dùng `-c:v libwebp`.
2. **Hai tầng frame**, và chuẩn còn thiếu điều khoản băng thông (issue #112): tầng đang chọn theo
   BỀ RỘNG MÀN HÌNH, không theo đường truyền. Desktop cắm 4G chỉ kịp 37% số byte cần.
3. **Scaffold CỐ TÌNH tắt ghim dưới 860px** (`aspect-ratio: 4/5`). Muốn scrub thật trên mobile
   phải ghi đè từ stylesheet của mình, và dùng `svh` **không** `dvh` (dvh đổi khi thanh URL ẩn
   → progress nhảy).
4. **ScrollTrigger làm `tenant-lint` FAIL** (đọc `window.scrollY`, đặt `position: fixed`). Dùng
   IntersectionObserver. Và `gsap.matchMedia({object}, cb)` **không bao giờ nổ** trên 3.15.0.
5. **Lớp chú thích phải chịu đúng phép cover-crop của canvas**, nếu không chấm trôi khỏi linh kiện.
6. **Năm cổng lint + một suite headless.** Cổng xanh chỉ chứng minh cơ chế, không chứng minh hợp
   đồng — ba bug chết-im-lặng của phiên này không cổng nào thấy.
7. **Nghĩa vụ giấy phép khi vendor**: GSAP là GreenSock Standard **không phải MIT**; font OFL;
   icon MIT. Phải ship kèm bản giấy phép.

## 5 · BA HÌNH DẠNG KHẢ DĨ

### A — Một skill `es-scroll-cinema`, hai profile (đúng Ruling 1+5)
`profile: world` = đường 021 · `profile: product` = đường 026. Chia sẻ: engine, cổng lint, pipeline
frame, vỏ copy, GATE. Khác: bàn tay sinh nội dung và hợp đồng camera.
*Được:* đúng phán quyết đã có, một nơi để sửa. *Mất:* skill to, người mới phải chọn profile ngay.

### B — Hai skill anh em + một engine chung
`es-scroll-cinema-world` và `es-scroll-cinema-product`, cùng gọi kernel.
*Được:* mỗi skill ngắn, dễ đọc. *Mất:* trái Ruling 1, và hai skill sẽ trôi khỏi nhau — đúng bệnh
"prose-only standards drift" repo đã dính.

### C — Skill mỏng + đẩy hết vào kernel `ui`
Thêm `ui scroll-cinema init|frames|verify`.
*Được:* tất định, test được, dùng lại được ngoài Claude. *Mất:* **Ruling 5 nói thẳng KHÔNG phải
lệnh CLI** vì xương sống là bàn tay sinh + gate người. Chống lại phán quyết cần lý do mới, không
phải sở thích.

**Nghiêng về A**, có vay của C: những gì **tất định** (trích frame, đo tải, verify) nên là script
trong kernel/pipeline để lint được; những gì cần **phán đoán** (art direction, GATE, chọn beat)
ở lại skill.

## 6a · OWNER ĐÃ QUYẾT (2026-08-01 22:32)

1. **Engine tenant thắng**, là bản mở rộng. `scrub-engine.js` của 021 nghỉ hưu; renderer
   video-blob + nav/route/linger port SANG tenant.
2. **Không cần Fable phán lại.** Spec 026 im lặng về Ruling 2 — nó chỉ cấm *người tiêu thụ*
   fork output của scaffold (`MOBILE-SPEC.md §2`), đó là ràng buộc tầng consumer chứ không
   phải phán quyết kiến trúc. Bằng chứng mới đến từ chính cổng của kernel, đo 2026-08-01:

   ```
   ui tenant-lint  ←  specs/021/site/scrub-engine.js
   TENANT-LINT: FAIL (10)
     :234  [window-scrollto]     gọi scrollTo trên document root
     :405  [window-scrolly]      đọc window.scrollY  (×2)
     :550…:594 [position-fixed-js]  đặt position:fixed  (×7)
   ```

   `window-scrollto` là vi phạm nặng nhất: section tự dịch chuyển vị trí cuộn của trang chủ
   nhà — đúng điều đầu tiên Tenant Law cấm. Ruling 2 ("extend scrub-engine.js") ra đời TRƯỚC
   khi Tenant contract thành chuẩn có linter; chiều tiến hoá đã đảo. Đây là bằng chứng mới,
   không phải sở thích, nên đủ để tự quyết — nhưng lý do phải nằm trong hồ sơ tốt nghiệp.
3. **Tốt nghiệp qua `/es-librarian`** (đúng Ruling 5).
4. **Làm cả hai profile** `world` + `product`.

## 6b · OWNER ĐÃ QUYẾT VÒNG 2 (2026-08-01/02, hỏi từng câu)

| # | Quyết định | Ghi chú của Opus |
|---|---|---|
| 5 | **Tốt nghiệp CẢ HAI profile**, `world` mang nhãn *đã-viết-chưa-chứng-minh* | Media 021 đã mất sạch (`site/assets/vid/`, `renders/`, `source/` đều không còn); trang 021 hiện hỏng, tụt về poster tĩnh |
| 1 | **Port renderer video-blob NGAY** sang engine tenant | Tôi đã nêu giá: ~200 dòng cho một nhánh chưa ai chạy được, và code không chạy là code không được kiểm. Owner quyết vẫn port |
| 2 | **Engine học xâu chuỗi nhiều cảnh** (SEGMENTS dive↔conn của 021) | ĐÍNH CHÍNH của tôi: việc này KHÔNG vi phạm Tenant Law — một instance quản N cảnh vẫn là một section, vẫn chỉ đọc rect của mình. Giá thật là engine phức tạp hơn, không phải bất hợp pháp. `linger` chỉ là hàm thuần 3 dòng, port gần như miễn phí |
| 3 | **Tốt nghiệp trước, `scroll-cinema-lint` sau** | Linter đó CHƯA TỪNG được dựng (021 ghi P-1, bỏ dở). `ui gflow` đã ở kernel, ở lại |
| 4 | **Đổi tên `scroll-world` → `es-scroll-cinema`**, engine trỏ về kernel, xoá bản sao trong skill | Phải sửa kèm 3 chỗ tham chiếu trong `es-gflow` + dòng trong evolution-ledger |
| 5b | **#112 không chặn, nhưng skill PHẢI cảnh báo** | Ghi thật trong skill: tầng ảnh đang chọn theo bề rộng màn hình chứ không theo đường truyền, kèm số đo và link #112 |

## 6c · BA BẢN ENGINE — phát hiện lúc trả lời câu 4

| Bản | Dòng | `ui tenant-lint` |
|---|---|---|
| `specs/021/site/scrub-engine.js` | 634 | **FAIL (10)** |
| `~/.claude/skills/scroll-world/references/scrub-engine.js` | 448 | **FAIL (10)** |
| `tenant-scaffold` → `scrub-section.js` | 294 | PASS |

Bản trong skill lệch **276 dòng** so với bản 021 — đã là một nhánh sống đời riêng, không phải bản
sao. Người dùng `scroll-world` hôm nay đang được phát một engine trượt cổng của chính kernel.
Đây là "một điểm mù, N người tiêu thụ" ở quy mô gấp rưỡi những gì Ruling 2 lường trước, và là
lý do mạnh nhất để hợp nhất.

## 6d · HÌNH DẠNG SAU KHI CHỐT

```
es-scroll-cinema                     (skill, đổi tên từ scroll-world)
├── profile: world     ← đường 021, nhãn CHƯA CHỨNG MINH (media đã mất)
│     bàn tay sinh: gflow/Veo Architecture-A · hợp đồng camera: bay liền mạch
│     dùng: connectors + linger
└── profile: product   ← đường 026, ĐÃ CHỨNG MINH (live, 95/0 mobile, 5 cổng xanh)
      bàn tay sinh: footage có sẵn · hợp đồng camera: orbit + explode
      dùng: tour chú thích, không dùng connectors

dùng chung (một nguồn sự thật):
  engine        `ui tenant-scaffold`  ← MỞ RỘNG: + renderer video-blob, + chuỗi nhiều cảnh, + linger
  cổng markup   `ui tenant-lint`
  sinh video    `ui gflow`
  frame         extract-frames.sh (ffmpeg → PNG → cwebp; brew ffmpeg KHÔNG có libwebp)
  vỏ copy       token DTCG qua `ui tokens compile`
  GATE          người gác (Ruling 5)

nợ đã ghi, không chặn:
  #112 điều khoản băng thông  ·  scroll-cinema-lint (cổng gác asset)
```

## 6e · OWNER QUYẾT VÒNG 3 (2026-08-02)

| Quyết định | Hệ quả |
|---|---|
| **Nhờ Fable ra direction cho hình dạng skill** trước khi Opus viết spec | Đang chạy |
| **`es-gflow` ở lại RIÊNG**, không bị hút vào `es-scroll-cinema`. Lý do owner: *"user có thể tự làm assets bên ngoài"* | Đây là quyết định có sức nặng nhất vòng này — xem dưới |

**Vì sao tách `es-gflow` ra lại đổi cả bài toán:** Ruling 5 nói xương sống của workflow là
*"một bàn tay sinh nội dung cộng một GATE do người gác"*. Nếu bàn tay sinh nội dung nằm ở skill
khác, và người dùng được phép mang footage từ bất kỳ đâu (điện thoại, Blender, After Effects,
một agency), thì **hợp đồng đầu vào của `es-scroll-cinema` không còn là "bạn đã chạy generator
của chúng tôi"** mà là **"bạn đang có footage hoặc frame"**.

Điều đó kéo theo hai câu chưa ai trả lời, và là lý do phải hỏi Fable:
- Ranh giới `world` / `product` có còn *đáng* tồn tại không, khi phần khác nhau lớn nhất giữa
  chúng (bàn tay sinh: gflow bay liền mạch vs footage sản phẩm có sẵn) vừa bị bê ra ngoài?
  Còn lại chỉ là hợp đồng camera và vỏ copy — có đủ để gọi là hai profile không?
- **GATE giờ gác cái gì?** Nếu không còn gác chất lượng phim sinh ra, thì nó gác gì.

## 6g · OWNER SỬA §1 CỦA FABLE (2026-08-02) — hỏi, đừng dừng

Fable §1 bắt skill **DỪNG HẲN** khi chưa đủ media (phát shot brief rồi kết thúc). Owner giản
lược: **bước đầu tiên chỉ là một câu hỏi**, rồi rẽ nhánh — không kết thúc phiên.

```
Bước 0 — HỎI: "Bạn đã có assets, hay muốn AI dựng?"
   ├── CÓ ASSETS  → kiểm đầu vào của Fable §1 (ffprobe / đếm frame / đo mép) → Cổng A → tiếp
   └── AI DỰNG    → nói NGAY yêu cầu tài khoản Google Flow, rồi chuyển sang `es-gflow`
                     → quay lại đây với assets → nhập nhánh trên
```

**Vì sao đây là bản tốt hơn, không phải bản lười hơn:** sinh video bằng AI cần **tài khoản
Google Flow** (Veo qua gflow) — một điều kiện tiền đề nằm ngoài toolchain và tốn tiền của user.
Cái đó phải lộ ra ở **câu hỏi đầu tiên**, không phải sau khi họ đã trả lời xong một cuộc phỏng
vấn. Để người ta đi năm bước rồi mới biết cần một tài khoản trả phí là thiết kế tệ.

**Giữ nguyên phần còn lại của Fable §1:** khi user chọn nhánh "có assets" thì điều kiện kiểm
được (N cảnh / N nguồn verify / mép đã đo) vẫn nguyên, và luật *"skill là đạo diễn, không bao
giờ là máy sinh"* vẫn nguyên — skill này không tự sinh video, nó chuyển sang `es-gflow`.
Cái bỏ đi chỉ là việc **kết thúc phiên**; thay bằng một lần chuyển tiếp.

**Hệ quả với hình dạng:** `es-gflow` vẫn là skill riêng (quyết định vòng 3), nhưng
`es-scroll-cinema` biết **gọi sang nó**, chứ không chỉ "nêu tên như một lựa chọn". Hai skill
nối nhau bằng một hợp đồng: es-gflow trả về assets thoả điều kiện đầu vào ở trên.

## 6f · CÂU HỎI CÒN LẠI (chưa hỏi)

1. **Renderer video-blob có thực sự cần port sang tenant không?** 026 chứng minh image-sequence
   là đủ cho profile product, và Ruling 2 gọi frame-sequence là "owner-resolved media default";
   video-blob là *tầng dự phòng ngân sách thấp*. Port nó ngay là surface đầu cơ (es-lazy), hay
   profile `world` thật sự cần nó vì clip gflow dài hơn nhiều so với 343 frame?
   **Cần đo**: một cảnh `world` của 021 trải ra thành frame WebP thì nặng bao nhiêu.
2. **Nav/route/linger của 021 là của ENGINE hay của TRANG?** Trong tenant, `.scrub__route` đã có
   sẵn; `linger` (bẻ cong thời gian để camera dừng giữa cảnh) thì chưa. Nếu linger là hợp đồng
   camera của profile `world` thì nó thuộc profile, không thuộc engine.
3. **`ui gflow` và `scroll-cinema-lint` (021/lint/) đi đâu?** Chúng đã là code tất định — giữ
   trong kernel, hay gộp vào skill? Ruling 5 chỉ nói *workflow* không phải CLI; hai thứ này là
   công cụ, không phải workflow.
4. **Skill `scroll-world` hiện có** (`~/.claude/skills/scroll-world/`) — đổi tên thành
   `es-scroll-cinema` rồi thêm profile, hay giữ nguyên và tạo mới? Đổi tên sẽ phá lệnh gọi cũ.
5. **Issue #112 (điều khoản băng thông) có phải điều kiện tiên quyết không?** Nếu skill này dạy
   người dùng sinh 343+ frame thì nó đang dạy họ tạo ra đúng vấn đề #112 mô tả. Có nên chặn tốt
   nghiệp cho tới khi #112 xong, hay ship kèm cảnh báo?

## 7 · KHÔNG LÀM GÌ CHO TỚI KHI CÓ LỆNH

Đây là brainstorm. Không sửa skill, không đụng kernel, không chạy librarian.
