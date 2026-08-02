# DIRECTION (Fable, 2026-08-02) — hình dạng `es-scroll-cinema`

Xây trên phán quyết Phase-3 của chính Fable + hai vòng quyết định của owner.
**Không có mục nào lật quyết định của owner.**

---

## TL;DR

Skill trở thành một **bộ lắp ráp ~280 dòng nằm giữa HAI cổng người**: footage vào, trang
qua-lint ra. Xương sống cũ ("bàn tay sinh + GATE") **đã chết** — phần sinh nội dung đi theo
`es-gflow`. Xương sống mới: **"một kernel tất định nằm giữa hai cổng người."**

Ranh giới profile **sống sót nhưng bị giáng cấp**: `world | product` là một **preset trên các
hợp đồng camera theo TỪNG CẢNH**, không phải hai workflow.

Đơn vị build kế tiếp: **lát cắt engine ở kernel** — không phải skill.

## 1 · HỢP ĐỒNG ĐẦU VÀO

Skill chỉ chạy khi **mọi cảnh trong kế hoạch đều có media trên đĩa kiểm được bằng
`ffprobe`/đếm frame**: một thư mục frame tuần tự, hoặc một file video giải mã được — và với
cảnh có nối, **frame biên phải đo được là khớp** (mean-abs-diff < 8/255, ngưỡng của 021; pilot
đã chứng minh đo 2,2–2,4).

Một điều kiện kiểm được: *N cảnh trong kế hoạch, N nguồn media đã verify, mép đã đo ở chỗ giáp nhau.*

**Thiếu thì skill thành ĐẠO DIỄN, không bao giờ thành MÁY SINH**: vẫn phỏng vấn, vẫn phát ra
**shot brief** (hợp đồng camera từng cảnh, thời lượng, fps, tỉ lệ, luật mép, ngân sách frame),
nêu `es-gflow` là *một* cách lấp — công cụ nào frame-lock được đều hợp lệ — rồi **DỪNG**.
Không scaffold, không trích frame, không "tạm" mock footage.

> Dựng vỏ quanh media không tồn tại chính là lỗi trang-021-hỏng (poster vĩnh viễn) tái hiện ngay ngày đầu.

## 2 · RANH GIỚI PROFILE — sống sót, bị giáng thành preset

**Trục CHẾT theo phần sinh nội dung** (đi sang `es-gflow` hoặc công cụ của user; **không được
mọc lại thành văn xuôi trong skill này**): consistency lock / master ref · GATE trước khi tiêu
credit · danh sách model + điều kiện frame-lock · tính credit · nguồn stills · thang re-roll NSFW.
≈ **400 trong 603 dòng** của `scroll-world` hiện tại.

**Trục THẬT SỰ còn lại — ba, và chúng xứng đáng giữ ranh giới:**

| Trục | world | product |
|---|---|---|
| Topology / instancing engine | MỘT phim xâu chuỗi, một instance quản N cảnh + connector + `linger` | N section độc lập, mỗi cái mount riêng (mẫu 026 đã ship) |
| Hợp đồng camera + phép kiểm máy | seed-chain xuôi, không bao giờ ngược qua mép; QA sai-khác mép cả hai chiều cuộn | keyframe-anchored, end-frame chịu lực; loop-closure + fps hiệu dụng + ngân sách nặng |
| Vỏ tương tác | route rail, đỉnh copy canh theo `linger` | tour chú thích, hero fold + CTA |

**Lý do giáng cấp, nói thẳng:** chính 026 — bằng chứng của cả họ — **trộn orbit + explode +
flythrough trên MỘT trang product**. Profile ở tầng trang xưa nay chỉ là đại diện; đơn vị thật
là **hợp đồng camera theo từng cảnh**. Nên skill ghi hợp đồng *cho mỗi cảnh*, còn `profile:` là
preset đặt sẵn topology, vỏ, và hợp đồng mặc định.

Đây không phải lật quyết định hai-profile — cả hai vẫn tốt nghiệp, vẫn có tên trong SKILL.md —
mà là **định nghĩa profile LÀ GÌ**, và là thứ giữ cho một trang trộn (thực tế đã ship) khỏi trở
thành một profile thứ ba không ai ghi.

## 3 · HÀNH TRÌNH NGƯỜI DÙNG — và xương sống mới

Xương sống: **một kernel tất định nằm giữa hai cổng người.**

| # | Bước | Loại |
|---|---|---|
| 1 | Phỏng vấn → kế hoạch cảnh (chủ thể, beat, copy, hợp đồng camera từng cảnh, preset, mobile, token/brand) | phán đoán |
| 2 | **CỔNG A — nghiệm thu footage.** Chạy kiểm đầu vào (ffprobe / đếm frame / sai-khác mép) và **đưa số**; người phán footage có phục vụ câu chuyện không — không lint nào phán được. Dưới chuẩn → phát shot brief, dừng | **CỔNG NGƯỜI** |
| 3 | Pipeline frame — `extract-frames.sh` (ffmpeg → PNG → `cwebp`; brew ffmpeg KHÔNG có libwebp), hai tầng + manifest kbPerFrame. **In cảnh báo #112 nguyên văn kèm số đo** | tất định |
| 4 | `ui tenant-scaffold` mỗi section (phát mới, mọi lần) + `ui tokens compile` | tất định |
| 5 | Nối dây trang; điểm rẽ profile: world → chaining + linger + route · product → tour + fold; ghi đè mobile từ stylesheet của trang (`svh` không bao giờ `dvh`), không sửa output scaffold | phán đoán |
| 6 | Cổng máy — 5 linter `ui` xanh + script QA theo hợp đồng (sai-khác mép / loop-closure / fps hiệu dụng / nặng). **Nói thật đây là script tiền-lint** cho tới khi `scroll-cinema-lint` ra | tất định |
| 7 | QA headless — cả hai chiều cuộn, viewport điện thoại bóp CPU 4–6×, reduced-motion | tất định |
| 8 | **CỔNG B — cổng ship.** Người tự cuộn trang thật trên máy thật, cả hai chiều, trên điện thoại | **CỔNG NGƯỜI** |
| 9 | Deploy — host của user; mẫu gh-pages của 026 làm ví dụ | tất định |

## 4 · CỔNG NGƯỜI NẰM Ở ĐÂU

Vẫn ở đây, vẫn chịu lực — nhưng đã **tách đôi và dạt về hai đầu**.

Cổng cũ bảo vệ **credit** (duyệt stills trước khi tiêu tiền video) — cổng đó **di cư theo phần
sinh nội dung**, giờ sống trong `es-gflow` / công cụ của user.

- **Cổng A** gác *footage đối chiếu câu chuyện và hợp đồng* — sửa trước khi trích frame thì rẻ, sau thì đắt.
- **Cổng B** gác *cảm giác trên máy thật* — thứ duy nhất repo đã có bằng chứng là không linter nào bắt được.

> Ba bug chết-im-lặng của 026 qua sạch mọi cổng xanh; lỗi poster đóng băng do **owner** bắt,
> không phải linter. Cảm giác không lint được.

## 5 · NHÃN CHƯA-CHỨNG-MINH CỦA `world` — xuất xứ, không phải lời xin lỗi

Đặt tại chỗ rẽ profile trong SKILL.md (KHÔNG đặt ở frontmatter — đó là bề mặt định tuyến):

> **world — ghi từ một pilot đã hoàn tất, hiện chưa trình diễn được.** Phương pháp camera đã
> được chứng minh: spec 021 từng ship một chuyến bay thật; liên tục mép đo 2,2–2,4/255 so với
> ngưỡng < 8 (MASTERY.md). Thứ **chưa từng chạy** là profile này qua toolchain hiện tại — chuỗi
> nhiều cảnh của engine tenant chưa có trang world nào ship, và media của pilot không còn.
> Nếu bạn dựng một trang world, bạn là người chạy lại đầu tiên: chạy QA mép sau mỗi cảnh nối,
> lường trước vài chỗ ráp còn thô, ghi gap vào ledger.
> **Xoá thông báo này trong đúng commit của trang world đầu tiên qua được Cổng B.**

Luật: không bao giờ dùng "beta / experimental / coming soon" (đó là hứa hẹn, không phải mô tả) ·
không đặt claim đối xứng với product (product có URL sống, world có số kèm ngày) · nhãn phải nói
*cái gì đã chứng minh, cái gì chưa, người dùng nên làm gì* · **và mang sẵn hạn dùng của chính nó**.

> Một cái nhãn không có hạn dùng sẽ thành đồ đạc.

## 6 · SKILL KHÔNG ĐƯỢC LÀM GÌ

1. **Mang code engine.** Không có hậu duệ của `references/scrub-engine.js`, không "vá" output
   scaffold. Ba bản đã trôi 276 dòng và hai bản trượt chính cổng của kernel — lớp lỗi L1→L4 ở
   quy mô 1,5×. Skill gọi `ui tenant-scaffold` phát mới, chỉ ghi đè từ stylesheet của chính nó.
2. **Dạy lại phần sinh nội dung.** Không một khối lệnh Higgsfield/gflow nào. Trỏ sang `es-gflow`
   như *một lựa chọn*. Mỗi đoạn generation mọc lại là con quái 603 dòng đang tái sinh.
3. **Chép lại thứ có thể gọi.** Cờ ffmpeg, công thức encode, lệnh lint đã là script/lệnh; bản
   sao bằng văn xuôi chính là thứ trôi mà luật emitter-và-linter sinh ra để giết.
4. **Giấu nợ băng thông.** Cảnh báo #112 kèm số thật, có ngày, có hạn dùng là **đầu ra bắt buộc**,
   không phải chú thích cuối trang — skill đang dạy người ta đúc trang 343 frame, tức dạy họ
   chế tạo đúng vấn đề #112 mô tả.
5. **Tuyên bố xong khi thấy xanh.** 5 linter xanh + QA xanh kết thúc **bước 6**, không kết thúc
   skill. Chỉ **Cổng B** mới kết thúc skill.
6. **Để hai profile rẽ đôi các bước dùng chung.** Một hành trình, các điểm rẽ được gọi tên. Khi
   một bước xuất hiện hai lần với chữ hơi khác nhau, skill đang biến thành phương án B mà owner
   đã loại.

## 7 · ĐƠN VỊ BUILD KẾ TIẾP — lát cắt engine ở KERNEL (không phải skill)

**Mở rộng emitter engine tenant: xâu chuỗi nhiều cảnh + `linger` + renderer video-blob SAU MỘT
CỜ** (`ui tenant-scaffold --media video` mới phát ra nó; phát mặc định vẫn chỉ imageseq) —
**chứng minh bằng một trang fixture dựng từ footage tổng hợp** (chuỗi 2 cảnh từ clip test do
ffmpeg sinh) qua được `ui tenant-lint` + scrub headless hai chiều, với toàn bộ suite hồi quy
của 026 vẫn xanh.

**Vì sao trước khi đổi tên/tốt nghiệp:** tốt nghiệp là ship văn xuôi SKILL.md trỏ vào năng lực
kernel. Nếu chaining chưa tồn tại thì nửa world không phải *chưa chứng minh*, nó là **không dựng
được** — một chuẩn thiếu emitter, đúng cái luật prose-drift. Engine trước nghĩa là skill tốt
nghiệp **một lần**, đối chiếu bề mặt cuối cùng.

**Đơn vị 2** = chính commit tốt nghiệp: đổi tên `scroll-world` → `es-scroll-cinema`, viết lại
theo hình dạng này (~280 dòng), **xoá CẢ HAI bản engine đã trôi**, sửa 3 chỗ tham chiếu chéo
trong `es-gflow`, chạy chuỗi librarian.

## 8 · HỆ QUẢ THẬT CỦA CÁC QUYẾT ĐỊNH CỦA OWNER (chấp nhận hoặc sửa, không lật)

| Quyết định | Hệ quả | Cách gỡ rẻ nhất (giữ nguyên quyết định) |
|---|---|---|
| Port renderer video **ngay** | ~200 dòng cho thứ chưa ai có footage live; claim không kiểm được | Cờ `--media video` + fixture mp4 tổng hợp → nhánh nằm ngoài phát mặc định **và** thành code chạy được ngay hôm nay, không phải chờ video thật của ai |
| Xâu chuỗi trong một instance | Trạng thái engine tăng gấp đôi (294 → ~450+). **Câu quảng cáo "engine 294 dòng" chết.** Emitter tiến gần lại đúng độ phức tạp mà bản Tenant từng thoát khỏi | Cảm biến trôi: `tenant-lint` PASS trên bản phát ra + đếm file/test của 026. **Nếu emitter có chuỗi mà trượt chính lint của nó → DỪNG** — đó là câu chuyện 021 khởi động lại bên trong kernel |
| Ship `world` chưa chứng minh | Người dùng world thật đầu tiên chính là lần chạy thử | Nhãn ở §5. Lật nhãn rẻ nhất: một mini-world 2 leg tầng draft (~2–3 credit qua es-gflow, hoặc bất kỳ footage frame-lock nào) qua engine chuỗi mới, gác ở Cổng B — xếp làm dogfood đầu tiên **sau** tốt nghiệp, không phải điều kiện chặn |

## 9 · GIẢ ĐỊNH FABLE TỰ CHỐT (thay vì hỏi)

1. Skill ở tầng user `~/.claude/skills/` với namespace `es-` — **chắc cao**, khớp quyết định 4.
2. `scroll-cinema-lint` sẽ vào kernel, nên script QA của skill **là tạm thời và phải nói rõ** — chắc cao.
3. Cửa librarian = chuỗi evolution ledger của es-kit, không phải graduation vào `knowledge/` —
   **chắc trung bình**. Nếu owner muốn librarian của repo thì chỉ đổi đường giấy tờ, không đổi hình dạng này.
