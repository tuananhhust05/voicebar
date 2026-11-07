# Trợ lý giọng nói (local)

Thu âm trên trình duyệt → Claude CLI **của chính máy Mac** → đọc to bằng giọng tiếng Việt của máy.

```
Chrome ──▶ container :4870 (Express + EJS, SSR) ──▶ bridge trên Mac :4871 ──▶ claude -p (đã đăng nhập sẵn)
  ▲  nhận giọng vi-VN                                                              │
  └──────────── speechSynthesis (giọng "Linh") đọc dần từng câu ◀──────────────────┘
```

## Chạy / dừng

```bash
./start.sh     # bật bridge + docker compose up, tự tạo BRIDGE_TOKEN trong .env
./stop.sh      # dừng cả hai
```

Mở http://localhost:4870 bằng Chrome.

## Vì sao cần bridge?

Claude CLI trên Mac lưu đăng nhập trong Keychain, nên container không dùng được. `bridge/bridge.js` (Node thuần, không thư viện) chạy trên máy và gọi `claude -p` bằng tài khoản đang đăng nhập.

An toàn:
- Chỉ nghe ở `127.0.0.1:4871` và bắt buộc `BRIDGE_TOKEN`.
- Tham số CLI cố định: `--tools ""` (Claude không chạy được lệnh hay đọc file nào trên máy), `--strict-mcp-config`, `--setting-sources project`.
- Container chỉ gửi được câu hỏi, session id và tên model.

## Cấu hình (`.env`)

- `CLAUDE_MODEL`: `haiku` (nhanh nhất), `sonnet`, `opus`.
- `HOST_PORT`: cổng web (mặc định 4870; 3000 và 5001 trên máy đã có app khác dùng).
- `BRIDGE_PORT`: cổng bridge (mặc định 4871).
- Log của bridge nằm trong `logs/bridge.log`. Lịch sử hội thoại lưu ở `~/.claude/projects/` (thư mục `bridge-workspace`).

## Lưu ý

- Nhận giọng nói của Chrome gửi âm thanh lên server Google, nên cần Internet.
- Phím tắt: `Space` bật/tắt micro, `Esc` dừng đọc.
- Bridge không tự chạy lại sau khi khởi động lại máy. Lúc đó chạy lại `./start.sh`.
