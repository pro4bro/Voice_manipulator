# Mang voice đã train sang máy khác

## Export trên máy nguồn

1. Mở **Voice Collection** ở Project Hub.
2. Chọn Collection chứa model đã train. Nếu model còn trong project, dùng
   **Add to Collection** trong Sound Library trước.
3. Bấm **Export package for ...** bên cạnh model cần mang đi. Trình duyệt tải
   một file ZIP cho model đó.

ZIP giữ checkpoint/adapter hoặc bộ RVC `.pth` + `.index`, reference audio,
Speaker Profile, consent evidence và lineage cần thiết. Base model dùng chung
và runtime không nằm trong ZIP. Chép ZIP nguyên vẹn sang máy đích.

## Import trên máy đích

1. Mở **Voice Collection**, chọn Collection đích hoặc tạo bằng **+ New Collection**.
2. Bấm **Import voice package** và chọn ZIP đã export. Chờ thông báo import thành công.
3. Mở project cần sử dụng; trong phần import từ Collection của Sound Library,
   tick model vừa thêm rồi bấm **Import đã chọn**.
4. Dùng model trong Voice Manipulator với engine/base model tương thích đã cài
   trên máy đích.

App kiểm tra định dạng, đường dẫn, hash, các file bắt buộc và lineage trước khi
đưa model vào Collection. File không hợp lệ báo lỗi và không để lại model nhập dở.
Import lại cùng model vào cùng Collection dùng entry đã có.

Hiện hỗ trợ package của **LoRA, full checkpoint và RVC** do Pro4Bro export.
Giới hạn mỗi package: **8 GiB dữ liệu sau giải nén, 20.000 file**. Import một
model không tự tạo một Voice Model Set đã nghiệm thu trên máy đích.

## Selection, Mute và Solo trong Timeline

- Chọn footage: mở các track đã Import của footage đó.
- Chọn một track hoặc Ctrl/Shift chọn vài track trong cùng footage: chỉ những
  track đó có player và Script tương ứng.
- **M** bật/tắt Mute; **S** bên dưới bật/tắt Solo. Có Solo thì chỉ các track đang
  chọn và có Solo được nghe. Có thể Solo nhiều track; Mute vẫn có hiệu lực.
- Gain/Mute/Solo giữ trạng thái khi đổi selection hoặc view trong phiên project.
  Gain nghe lại không thay PCM/MKA gốc, gain xử lý đã lưu, STT hoặc dữ liệu training.

Footage OBS lỗi chưa có MKA cũng có menu chuột phải: mở, thử lại hoặc đưa vào
Recycle Bin. **OBS RECYCLE BIN** có Restore và Delete permanently; xóa vĩnh viễn
cần xác nhận. Bản ghi đang chạy hoặc còn tác vụ xử lý được chặn thao tác xóa.
