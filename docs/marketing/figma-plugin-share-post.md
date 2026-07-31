# Share post — Figma plugin "design:os by JANG"

Audience: designer / người mới bắt đầu dùng AI với Figma. Formula: PAS (Problem → Agitate →
Solution) + story hook. Kênh chính: Facebook/LinkedIn (bản VN dài), kèm biến thể X/Twitter
thread (EN). Ảnh gợi ý đính kèm: `docs/images/plugin/panel-connected-dark.png` +
`docs/images/plugin/sync-prompt.png`.

---

## Bản chính (Vietnamese — Facebook/LinkedIn)

**Lần đầu tôi cho AI đụng vào file Figma, tôi mất 20 phút công việc chỉ bằng một cú ⌘Z.**

Không phải AI vẽ xấu. Nó vẽ khá ổn. Vấn đề là toàn bộ những gì nó làm — hai chục thao tác —
bị Figma gộp thành MỘT bước undo. Tôi muốn hoàn tác đúng một cái frame lỗi, và mất sạch.

Nếu bạn mới bắt đầu ghép AI vào Figma, bạn sẽ sớm gặp đủ bộ ba này:

1. **⌘Z nuốt cả buổi làm việc.** AI làm 20 phút = 1 bước undo. Hoàn tác một thứ, mất tất cả.
2. **Bạn sửa tay — codebase không hề biết.** Bạn kéo component sang trái 2px, đổi tên, chỉnh
   spacing. Registry mà AI dùng để generate code thì vẫn tưởng mọi thứ như tuần trước. Design
   và code lệch nhau từng ngày một, im lặng.
3. **Hai bên giẫm chân nhau.** Bạn đang chỉnh cái nút, AI cũng đang chỉnh cái nút. Ai thắng?
   Không ai biết. Chỉ biết là sáng mai mở file lên thấy... lạ lạ.

Cái đáng sợ nhất không phải là AI làm sai. Là **không biết nó đã làm gì, và không lấy lại
được cái mình vừa mất.**

Chúng tôi dựng plugin này để gỡ đúng ba cái đó — không thêm phép màu nào khác:

→ **Mỗi thao tác = một bước undo riêng.** ⌘Z một cái, mất đúng một cái. Script lỗi giữa
chừng? Tự rollback, và chỉ báo "đã rollback" khi rollback THẬT SỰ xong.

→ **Bạn sửa tay, codebase biết.** Mọi chỉnh sửa của bạn được ghi lại; file yên tĩnh 5 phút
thì panel hỏi đúng một câu: *"3 changes ready — Sync now?"* Bấm một cái, thay đổi về đúng
project của file đó (bind một lần là xong). Không có model AI nào đứng giữa đường sync —
chạy lại 10 lần ra đúng 10 kết quả.

→ **Không giẫm chân nhau nữa.** Mỗi lệnh của AI là một job xếp hàng — một mutation chạy một
lúc trên một file. Cancel là cancel thật. Timeout không phải là "mất tích" — nó đưa bạn job
id để hỏi lại kết quả thật.

Và một nguyên tắc chúng tôi giữ tuyệt đối: **không có gì biến mất trong im lặng.** Mọi lần
xóa, dọn, xoay log đều để lại số đếm hoặc bản lưu. Panel không bao giờ "bịa" — tên chỉ hiện
khi kết quả thật sự mang tên, con số chỉ hiện khi thật sự đếm được.

Con số cho ai thích kiểm chứng: 839 test, 4 vòng review đối kháng mà mọi lỗi nghiêm trọng
đều bị TÁI HIỆN trước khi được tin là đã sửa, sync đo được ~1ms cho 200 thay đổi trên
registry 10.000 component.

Nếu bạn từng ngại cho AI vào file Figma "xịn" của mình — nỗi ngại đó đúng. Công cụ phải tự
chứng minh nó không phá của bạn, trước khi được quyền giúp bạn.

Mã nguồn mở, MIT: **github.com/jangtrinh/design-os** — mục "The plugin" trong README kể
đúng câu chuyện này, kèm ảnh.

---

## Biến thể ngắn (X/Twitter thread — English)

**1/** The first time I let AI touch my Figma file, one ⌘Z erased 20 minutes of work.

Not because the AI drew badly. Because Figma collapsed its entire session into ONE undo step.

**2/** If you're new to AI + Figma, you'll hit these three walls fast:

- ⌘Z swallows whole sessions
- your hand edits are invisible to the codebase
- you and the agent overwrite each other

**3/** We built a plugin that removes exactly those three walls:

- every operation seals its own undo step; failed scripts roll themselves back
- your edits are captured and offered back: "3 changes ready — Sync now?"
- every AI mutation is a queued job. Cancel actually cancels.

**4/** One rule underneath it all: nothing disappears silently.

Every eviction leaves a counter. Every error keeps its full reason in a log the agent can
read and fix from. The panel never fabricates — a name appears only when the result carried
one.

**5/** 839 tests. 4 adversarial review rounds where every blocker was reproduced before it
was believed. ~1ms to apply 200 changes into a 10,000-component registry.

Open source, MIT: github.com/jangtrinh/design-os

---

## Ghi chú sử dụng

- Hook đánh vào **nỗi sợ mất kiểm soát** — cảm xúc số 1 của người mới (không phải "AI vẽ
  xấu"). Giữ hook ở ngôi thứ nhất, chuyện thật.
- Không hứa "nhanh gấp 10 lần" — audience mới KHÔNG tin tốc độ, họ tin **an toàn + minh
  bạch**. Mọi claim trong bài đều bám tính năng đã ship.
- CTA duy nhất: link repo. Không kêu follow/share (bài chia sẻ kỹ thuật, để tự lan).
- Có thể cắt đoạn "con số" nếu đăng nhóm thuần designer; giữ nguyên nếu đăng nhóm dev/AI.
