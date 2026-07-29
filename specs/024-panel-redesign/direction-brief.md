# Direction brief (Fable) — redesign panel plugin theo reference dark-settings

> Task từ owner 2026-07-29: "use design:os to reference this UI and use it to redesign the
> plugin interface" — reference = ảnh settings modal dark (phong cách Untitled UI).
> Surface đích: panel plugin figma-agent (`plugin/src/ui/panel.html` 704L + `panel-model.ts`
> + `panel-ui.ts`), build inline qua `scripts/build.mjs` marker, gate 4-linter
> `tests/figma-plugin-panel.test.ts` PHẢI xanh.

## Quyết định direction (locked)

1. **Reference của owner THẮNG brand Swiss Monolith cho surface này** (user decision rule).
   Không áp #ff3e00; theo ngôn ngữ reference: dark-neutral, tinh gọn, chức năng.
2. **Mượn CHỮ KÝ của reference, không mượn layout nguyên khối** (panel ~280-320px không chứa
   nổi sidebar 2-pane). Chữ ký phải tái hiện đủ:
   - Stack nền 2 tầng: nền sâu (#0D0D0F vùng) / panel nổi (#17171A vùng) + border subtle 1px.
   - **Divider CHẤM (dotted)** giữa các section — đặc điểm nhận diện mạnh nhất của reference.
   - Row icon+label kiểu nav; trạng thái active = nền sáng hơn + thanh accent trái.
     **VETOED by owner 2026-07-29 (screenshot):** the active-row LEFT ACCENT BAR trait is
     rejected outright for this surface — không tái hiện lại (nền sáng hơn vẫn giữ, thanh accent
     trái thì bỏ hẳn, không đổi màu thay thế).
   - Label nhỏ mờ ĐẶT TRÊN giá trị (pattern label-over-input); input/pill bo ~8-10px, viền 1px.
   - Link inline gạch chân (kiểu "Change photo") cho action phụ (Retry, Docs).
   - Footer identity row (avatar/dot trạng thái + tên) → dịch thành: dot màu trạng thái kết nối
     + fileName + build id `v0.1.0 · <sha7>`.
3. **IA của panel giữ nguyên hợp đồng model hiện có** (panel-model/panel-ui states): status
   kết nối (connected/probe/rejected/err), file/page hiện tại, heartbeat, activity feed,
   SYNC_CONFIG, Retry. Redesign là SKIN + layout hierarchy, KHÔNG đổi hành vi/luồng state.
4. **Token hóa qua design:os**: màu/space/radius/type rút thành CSS custom properties ở đầu
   panel.html (emitter + linter đi đôi — chuẩn repo); chạy `design-os reference` để cache ảnh
   reference khi owner cung cấp file (đang chờ — spec cứ dùng DNA dưới đây, duel cuối đối chiếu ảnh).
5. **DNA ước lượng từ reference (vision-graded, PARTIAL — tinh chỉnh khi có file):**
   nền ngoài ≈ #0B0B0D; panel ≈ #161619; hover/active row ≈ #232327; border ≈ #2A2A2E;
   text chính ≈ #F5F5F6; text phụ ≈ #8B8B93; label ≈ #A6A6AD; accent trái active ≈ #E4E4E7;
   radius input ≈ 8px, pill button ≈ 8px, avatar 8px; type: sans humanist, 13-15px body,
   section title semibold; divider: dotted 1px, màu ≈ #2E2E33, khoảng cách section rộng.
6. **RESPONSIVE HOÀN HẢO = ĐIỀU KIỆN TIÊN QUYẾT (owner decree 2026-07-29, locked):**
   - Panel Figma resize được (figma.ui.resize + user kéo) → layout PHẢI fluid trọn dải
     **240px → 640px+ bề ngang, mọi chiều cao**; không breakpoint gãy, không magic width.
   - **Không bao giờ có horizontal scroll**; không fixed px width trên row/input (max-width
     100%, flexbox/grid); fileName/page/activity dài → ellipsis + title tooltip; hàng
     button/pill wrap được; footer identity truncate giữa.
   - Vertical: nội dung dài hơn khung → panel scroll dọc mượt, header trạng thái sticky.
   - **Emitter + linter đi đôi**: bổ sung check responsive vào bộ linter panel (vd cấm fixed
     width > ngưỡng ngoài whitelist, bắt buộc max-width/ellipsis guard) — spec cùng phase.
   - **Validation bắt buộc**: chụp panel ở tối thiểu 5 bề ngang (240/280/320/480/640 — drive
     bằng `figma.ui.resize` qua exec-js) × các state chính; mọi khung không tràn, không vỡ.
7. Chất lượng: sau impl chạy đủ 4 linter panel + critique-rubric (correctness gate trước,
   excellence sau); duel với ảnh reference khi có file. Fixture/screenshot không đụng file thật.

## Giao việc

- **Opus**: đọc panel.html/panel-model.ts/panel-ui.ts + tests/figma-plugin-panel.test.ts +
  knowledge/ liên quan (design:os) → author spec + plan (token block, cấu trúc section mới,
  mapping từng state hiện có sang visual mới, thứ tự edit, validation gồm gate + screenshot
  qua plugin thật). Cross-check Codex như quy trình.
- **Sonnet**: implement verbatim sau khi owner duyệt spec.
- **Reference file ĐÃ CÓ (SOURCE):** gốc `/Users/jang/Downloads/Reference.png`, bản làm việc
  `figma-agent/references/Reference.png` (274KB). DNA §5 nâng cấp từ vision-PARTIAL → đối
  chiếu trực tiếp file này khi tinh chỉnh token và khi DUEL cuối theo critique-rubric.
- Gap ghi nhận (không chặn task): `design-os reference add` chưa intake được ảnh PNG thô
  (pixelshot chỉ nhận URL/HTML/PDF) — file copy vào references/ nhưng không index. Route cho
  owner quyết đường graduate (issue design-os repo).
