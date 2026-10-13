# Đồng bộ code bằng GitHub Desktop

Quyết định owner, 2026-10-13: trước mắt đồng bộ cùng source qua GitHub, thay cho
việc tạo và áp nhiều gói app update trên máy test. Portable mới sẽ mang đầy đủ
source app và dùng thư viện core/model ngoài folder app; xem ADR0074.

## Repository và branch

- Repository: `https://github.com/pro4bro/Voice_manipulator.git`
- Branch chứa toàn bộ thay đổi hiện tại: `feat/03-04-high-quality-training`.
- Chọn đúng branch trên cả hai máy. `main` chưa chứa toàn bộ công việc này.
- `engines/OmniVoice` là submodule upstream riêng, không phải code app bị thiếu.

## Máy phát triển

1. Mở repository trong GitHub Desktop, chọn branch trên.
2. Commit các thay đổi code/tài liệu, sau đó **Push origin**.
3. Không commit `.runtime`, `.cache`, `.tools`, `.venv`, `node_modules`,
   `apps/web/dist`, `data`, project, bản thu hoặc checkpoint. Các thư mục này
   đã được `.gitignore` bảo vệ.

## Máy thứ hai

1. Trong GitHub Desktop: **File → Clone repository → URL**, nhập URL trên.
   Clone vào một folder source mới. Một portable đã đóng gói không có `.git`
   nên chưa phải repository để GitHub Desktop có thể Pull.
2. Chọn **Current branch → feat/03-04-high-quality-training**.
3. Mỗi lần đồng bộ: đóng app, bấm **Fetch origin**, rồi **Pull origin**.
   Nếu máy test có sửa code riêng, commit hoặc xử lý thay đổi đó trước khi Pull;
   không chọn Discard khi còn thay đổi muốn giữ.
4. Lần đầu clone, cài Node/npm và chuẩn bị dependency frontend:

   ```powershell
   cd <folder-source>\apps\web
   npm ci
   npm run build
   ```

   Chạy lại `npm ci` khi `package-lock.json` đổi. Launcher tự rebuild frontend
   khi source mới hơn dist; nếu báo thiếu npm thì kiểm tra cài Node và PATH.
5. Mở bằng `open-pro4bro-console.bat`. Cần reload toàn bộ controller/API/Studio:
   `open-pro4bro-console.bat restart`. Dừng: `open-pro4bro-console.bat stop`.

**Git chỉ đồng bộ code.** Clone mới chưa có Python embedded, STT/TTS/RVC models,
FFmpeg hoặc data/project. App hiện tại vẫn tìm phần nặng theo layout `.runtime`,
`.cache`, `.tools` và engine được cấu hình. Máy đã có source với các thành phần
đó chỉ cần Pull rồi mở lại. Máy chỉ có portable cũ chưa được tự động nối phần
nặng vào clone mới bằng một đường dẫn; đó là acceptance của vòng kế tiếp, không
phải chức năng đã hoàn tất ở SOURCE-SYNC-01. Giữ portable/core đang dùng cho đến
khi đường dẫn thư viện chung được kiểm tra. Project mang sang phải dùng Open
Existing và giữ `project.json` cùng assets.

## Các BAT được giữ

| Vị trí | Chức năng |
| --- | --- |
| Root: `open-pro4bro-console.bat` | Mở, dừng, restart, xem status app |
| Root: `INSTALL-OBS-PLUGIN.bat` | Cài/repair plugin OBS |
| Root: `VERIFY-PORTABLE.bat` | Kiểm tra runtime/model của portable cũ |
| Root: `UPDATE-PORTABLE.bat` | Tương thích các portable đã phát hành |
| `scripts/maintenance/setup-pro4bro.bat` | Setup dependency cho máy phát triển |
| `scripts/maintenance/update-omnivoice.bat` | Cập nhật upstream engine theo kiểm tra Git |
| `scripts/maintenance/MAKE-PORTABLE-UPDATE.bat` | Tạo gói numbered update cũ khi cần |

`start-pro4bro.bat` và `restart-pro4bro.bat` đã bỏ vì chỉ gọi lại open-console.
Các updater/migration vẫn hiểu tên cũ để tương thích portable đã phát hành.
Luồng thường ngày trên hai máy là GitHub Desktop Pull, không phải MAKE/APPLY.

## Portable mới: acceptance kế tiếp

**SOURCE-EXTERNAL-ASSETS-01** phải đạt trước khi gọi bản mới là portable:

- Mang đầy đủ source app từ đúng Git commit, UI build và Studio adapter cùng
  version; không dùng một allowlist app rút gọn khác source.
- Người dùng khai báo một folder thư viện core/model trên từng máy; cấu hình
  đường dẫn là local, bị ignore, không đẩy đường dẫn máy A sang máy B.
- Dùng lại runtime, engine và weights đang có; không âm thầm copy/download hoặc
  ghi adapter app vào thư viện chung. Xác minh Python không import API/Studio
  cũ từ thư viện; nhiều bản app không ghi đè adapter của nhau.
- Kiểm tra runtime/model và báo chính xác phần thiếu. VibeVoice vẫn trong list,
  thiếu payload thì unavailable, không báo sẵn sàng giả.
- Mở Existing Project độc lập với thư viện model; model train của người dùng
  và checkpoint project giữ provenance và đường dẫn project-relative.
- Thử trên đường dẫn/ổ khác, kiểm tra source/main/portable behavior và artifacts
  thật trước khi bỏ cách cập nhật portable cũ.
