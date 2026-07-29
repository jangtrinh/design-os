# Canvas validation — 2026-07-29, VSF - PCP (live), build `v0.1.0 · cba0796`

Toolchain: CLI/broker npm-linked từ tree này (broker pid 94670), plugin hot-swapped vào path
Figma đăng ký. Mọi lệnh chạy với `--file "VSF - PCP"` (dogfood phase-03). Fixture tự dọn
trong-script + sweep cuối (`cleaned: 4`).

| Check | Kết quả | Bằng chứng |
|---|---|---|
| A8 fileContext mọi reply | ✅ | exec-js/get-selection đều trả `fileContext:{fileName:"VSF - PCP",fileKey:null}` |
| A2 wrong-file | ✅ | `--file 'Definitely Not This File'` → chặn TẠI ROUTING: `E_NO_PLUGIN "no Figma plugin matching --file … connected files: [VSF - PCP]"`, exit 1, canvas không đổi. (E_WRONG_FILE plugin-side là lớp 2, kích khi routing khớp nhưng scene lệch — không tái hiện được với 1 plugin đúng tên) |
| A3a trailing-`;` IIFE | ✅ | `mode: expression`, result = frame id thật, `executed: true` — hết class 2.5 |
| A3b statement no-return | ✅ | `warning: "no explicit return …"` trong envelope + stderr; stdout vẫn 1 JSON — hết class 2.1 |
| A4 undo-group rollback | ✅ | throw sau mutation + async boundary → `rolledBack: true`, frame tạo trong script BIẾN MẤT, marker của step trước CÒN NGUYÊN |
| A4b empty-group | ✅ | throw trước mọi mutation → sentinel giữ group non-empty, marker trước đó không bị undo ăn |
| BLOCKER-scenario (review #1) | ✅ | script `--undo-group` tự sweep sentinel rồi thành công → `executed: true`, kết quả GIỮ NGUYÊN (không rollback oan) |
| A5 `ui.setProps` node-id | ✅ | swap INSTANCE_SWAP bằng node-id OK, trả map resolved |
| A5 `ui.setProps` key (local) | ✅ fail-loud | key local unpublished → `THROW component not found for property … <key>` (import path chỉ ăn key published — giới hạn platform, contract lớn tiếng đúng thiết kế) |
| A5 sai tên prop | ✅ | `THROW property "Icn" not found — available: Icon#… on "Host"` |
| A5 `ui.boundFill` fills mặc định | ✅ | positive case sống: bind + assert qua node-level mirror OK (yêu cầu của review #3) |
| A5 boundFill var không tồn tại | ✅ | `THROW variable not found` — hết class 3.4 |
| strokeWeight probe (review #4) | ✅ VERIFIED | `setBoundVariable('strokeWeight')` re-key thành `strokeTop/Bottom/Left/RightWeight` — expansion map exact, đã promote comment provisional |
| ui.byPath rỗng / ui.q projection | ✅ | byPath([]) throw; q trả `{id,name,type}` đúng fields |
| A6 granular ⌘Z | ⏳ MANUAL | cần user bấm ⌘Z sau chuỗi lệnh — chưa chạy |
| A2b routing 2 file positive | ⏳ | cần file thứ 2 mở plugin; nhánh REFUSE khi không khớp đã proven ở A2 |

Ghi chú vận hành: `status --file <sai>` trả full status exit 0 (status là broker-answered,
filter cục bộ — deviation #3 của implementer, documented; cân nhắc siết ở wave sau nếu gây nhầm).
