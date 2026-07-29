# Direction brief (Fable) — Hotfix 1.4 + Tầng B exec harness

> Repo đích: `/Users/jang/Products/figma-design-agent`. Căn cứ:
> `opah/plans/reports/research-260729-1006-figma-agent-improvement-verification.md` (mọi claim
> đã verify) + backlog `/Users/jang/Products/VSF-PCP/docs/figma-design-agent-improvement-backlog.md`.
> Brief này là DIRECTION — Opus author spec/plan chi tiết, không đảo các quyết định dưới đây.

## Phạm vi đợt này

1. **Hotfix 1.4** — eviction loop + route nhầm file (data-integrity).
2. **Tầng B** — exec-js harness: diệt class im-lặng-sai (2.1, 2.5), undo-group (2.2),
   commitUndo per-command (2.4), stdlib fail-loud (3.1, 3.2, 3.4, một phần 2.3, 4.1).

KHÔNG đụng: multi-file broker/queue (Tầng A — đợt sau), typed commands mới (Tầng C).

## Quyết định kiến trúc (locked)

### Hotfix 1.4
- `broker-daemon.ts` PLUGIN_HELLO: đã có plugin khác giữ slot → **TỪ CHỐI register mới**
  (gửi event lỗi kèm fileName đang giữ, close ws mới với reason rõ), KHÔNG terminate ws cũ.
  `ui-relay.ts`: nhận rejection → NGỪNG auto-reconnect + hiển thị trạng thái trong panel
  ("connection held by file X") — loop chết hẳn.
- **File-guard ở envelope (forward-compatible với Tầng A):** CLI flag `--file <name>` → param
  `expectedFile`; plugin main dispatch so `figma.root.name` TRƯỚC khi chạy → mismatch =
  `E_WRONG_FILE`, không execute. Mọi reply (mọi command) đính `fileContext: {fileName}`.
  Broker vẫn pure relay — chỉ đọc envelope, không đọc cmd.

### Tầng B (plugin `opExecJs` + CLI `exec-js`)
- **Wrapping:** giữ dual-wrap (expression → statement) NHƯNG: (a) normalize trailing `;`/space
  trước expression attempt (root cause 2.5); (b) envelope thêm `executed: true` + `warning` khi
  `result === undefined` ("no explicit return — side effects may still have applied"); CLI in
  warning to, không nuốt. Contract: script nhiều statement PHẢI `return` tường minh.
- **`--undo-group` (opt-in):** pattern ĐÃ SMOKE-TEST, không dùng pattern nào khác:
  `commitUndo (C0) → script → lỗi? commitUndo (C1) + triggerUndo + báo rolledBack:true trong
  error; thành công? commitUndo`. Naive commit-before KHÔNG hoạt động (đã chứng minh).
- **commitUndo per-command (2.4):** sau MỖI dispatch mutating thành công (mọi executor +
  exec-js) → `figma.commitUndo()` — user Cmd+Z granular. Đặt ở dispatch wrapper `main.ts`.
- **stdlib `ui` inject vào exec scope** (param thứ 2 của wrapper, file mới
  `plugin/src/main/exec-stdlib.ts`, tôn trọng rule 200 dòng):
  - `ui.setProps(inst, props)` — prefix-match suffix `#id`; INSTANCE_SWAP: nhận node-id
    (VERIFIED) lẫn key (tự `importComponentByKeyAsync` → id); không thấy prop → THROW kèm
    danh sách prop khả dụng.
  - `ui.swapInstance(inst, ref)` — ref = id|key → resolve → `swapComponent`.
  - `ui.boundFill(node, varName)` — assert variable tồn tại + assert `boundVariables` sau
    bind; fail → THROW (3.4).
  - `ui.byPath(rootId, [names…])` — re-find theo parent-chain khi node-id chết (2.3).
  - `ui.q(node, {depth, fields})` — serialize có projection (4.1), tái dùng `serialize-node.ts`.
- Sandbox facts (đừng re-research): `AsyncFunction` bị chặn, chỉ `eval`; ES2020+; không
  browser API (không setTimeout).

## Acceptance (Fable audit sẽ soi đúng các mục này)

1. Mở plugin ở 2 file → KHÔNG loop; plugin thứ 2 hiện trạng thái rejected rõ; broker log 1
   dòng warning, không storm.
2. `figma-agent exec-js --file 'Sai Ten' <script>` → `E_WRONG_FILE`, canvas không đổi.
3. Script kết thúc `})();` → có `warning` + `executed:true`, KHÔNG còn silent null (2.5).
4. `--undo-group` + script lỗi giữa chừng (có await ở giữa) → canvas về đúng state trước
   script (lặp lại smoke pattern); không đụng undo step trước đó.
5. `ui.setProps` với INSTANCE_SWAP key → swap đúng; prop sai tên → throw kèm danh sách.
6. Sau chuỗi lệnh, Cmd+Z revert TỪNG lệnh không phải cả session (2.4, verify tay).
7. `npm run typecheck && npm run lint && npm run build` (+ test nếu repo có) pass.
8. Mọi reply chứa `fileContext.fileName`.

## Ràng buộc

- DECISIONS.md là luật: no MCP, broker pure relay (envelope-level metadata OK), Figma Free,
  plugin+CLI ship cùng nhau (PROTOCOL_VERSION giữ 1 — thay đổi additive).
- Mỗi phase budget 1 run trên canvas THẬT (hard-won rule; fixture page `[fixture] …`, xóa sau).
- Modularize >200 dòng; kebab-case; comment giải thích invariant, không nhắc plan/audit label.
