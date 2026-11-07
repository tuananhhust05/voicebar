<div align="center">

# Voicebar

**Hỏi Claude bằng giọng nói ở bất kỳ đâu trên máy tính. Nghe câu trả lời bằng tiếng Việt hoặc tiếng Anh.**

Trợ lý giọng nói chạy trên menu bar (macOS) và khay hệ thống (Windows). App dùng
[Claude Code CLI](https://docs.claude.com/en/docs/claude-code) đã cài và đăng nhập sẵn trên máy bạn.

[English](README.md) · [Tiếng Việt](README.vi.md)

</div>

> [!NOTE]
> **Trạng thái: đang phát triển bản v1.** Bản web prototype chạy được nằm trong
> [`legacy/web-prototype`](legacy/web-prototype). Bản desktop đang được xây dựng theo
> [tài liệu thiết kế](docs/superpowers/specs/2026-11-07-desktop-voice-assistant-design.md).

## Tính năng

- **Phím tắt toàn cục, rảnh tay.** Bấm <kbd>⌥ Space</kbd> (macOS) hoặc <kbd>Ctrl Alt Space</kbd> (Windows) rồi nói. Ngừng nói là câu hỏi tự gửi đi.
- **Song ngữ.** Nhận giọng và đọc to cả tiếng Việt lẫn tiếng Anh.
- **Đọc ngay khi đang trả lời.** Câu đầu tiên được đọc trước khi Claude viết xong cả câu trả lời.
- **Hỏi về nội dung vừa copy.** Phím tắt thứ hai gửi kèm đoạn chữ trong clipboard.
- **Lịch sử hội thoại.** Mở lại cuộc trò chuyện cũ, Claude vẫn nhớ ngữ cảnh.
- **Dùng chính Claude CLI của bạn.** Không cần API key, không cần tài khoản riêng.
- **An toàn.** Claude chạy với tools, MCP và cài đặt người dùng đều bị tắt, chỉ trả lời được bằng lời.

## Cách hoạt động

| Thành phần | macOS                                | Windows                              |
| ---------- | ------------------------------------ | ------------------------------------ |
| Nhận giọng | Apple Speech, hiện chữ trong lúc nói | whisper.cpp, chạy offline trên máy   |
| Đọc to     | Giọng hệ thống (_Linh_)              | Giọng hệ thống (_Microsoft An_)      |
| Claude     | `claude` CLI trên máy                | `claude.exe` / `claude.cmd` trên máy |

## Yêu cầu

- macOS 13+ hoặc Windows 10/11 x64
- Đã cài và đăng nhập Claude Code CLI (chạy `claude` rồi gõ `/login`)
- Có giọng đọc tiếng Việt:
  - macOS: _System Settings → Accessibility → Spoken Content → System voice → Manage voices_ → _Linh_
  - Windows: _Settings → Time & language → Language & region → thêm tiếng Việt_

## Phát triển

```bash
git clone https://github.com/tuananhhust05/voicebar.git
cd voicebar
npm install
npm run dev
```

Xem thêm các lệnh trong [README tiếng Anh](README.md#development) và [CONTRIBUTING.md](CONTRIBUTING.md).

## Giấy phép

[MIT](LICENSE) © 2026 tuananhhust05

Voicebar là dự án độc lập, không liên kết với Anthropic. "Claude" và "Claude Code" là thương hiệu của Anthropic PBC.
