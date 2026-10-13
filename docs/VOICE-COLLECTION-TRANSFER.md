# Mang voice đã train sang máy khác

## Export trên máy nguồn

1. Mở **Voice Collection** ở Project Hub.
2. Chọn Collection chứa model đã train. Nếu model còn trong project, dùng
   **Add to Collection** trong Sound Library trước.
3. Tick profile để chọn toàn bộ model bên trong, hoặc xổ profile và tick từng
   model cần mang đi. Bấm **Export đã chọn (N)** cạnh nút Import.
4. Chọn thư mục đích trong hộp thoại Windows. App ghi một ZIP cho mỗi model đã
   chọn, báo các đường dẫn đã lưu; tên trùng được thêm số, không ghi đè file cũ.

ZIP giữ checkpoint/adapter hoặc bộ RVC `.pth` + `.index`, reference audio,
Speaker Profile, consent evidence và lineage cần thiết. Nếu đã có mẫu giới thiệu
hợp lệ, ZIP mang theo cả WAV mẫu và Script có checksum. Base model dùng chung
và runtime không nằm trong ZIP. Chép ZIP nguyên vẹn sang máy đích.

## Import trên máy đích

1. Mở **Voice Collection**, chọn Collection đích hoặc tạo bằng **+ New Collection**.
2. Bấm **Import voice package**, chọn một hoặc nhiều ZIP trong hộp thoại Windows.
   Chờ thông báo số model import thành công; file lỗi được báo riêng.
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

Hộp thoại native mở trên máy đang chạy API. Nếu đang dùng app từ trình duyệt ở
máy khác, dùng **Upload ZIP từ trình duyệt** để chọn một ZIP trên máy client.
Đóng hộp thoại bằng Cancel không import/export file nào.

## Profile và mẫu giọng

- Số cạnh **Voice Collection** đếm profile khác nhau trong tất cả Collection.
  Các model cùng Speaker Profile và project nguồn nằm trong một hàng xổ được.
- Bên trong hàng model có player và Script cạnh nhau. Lần mở đầu, app tạo mẫu
  bằng chính checkpoint/LoRA đã lưu trong Collection, dùng engine hiện có trên
  máy. Trạng thái đang chờ/đang tạo có animation; mẫu được lưu để lần sau nghe lại.
- Chỉ WAV PCM 16-bit có tín hiệu, đo được ít nhất **15 giây** mới được công bố.
  Audio ngắn, thiếu output, model sai checksum, thiếu core/base model hoặc GPU
  đang bận đều báo lỗi và có **Thử tạo mẫu lại**. Không dùng reference thay mẫu.
- Script giới thiệu tên, giới tính, vùng miền, tuổi, ngày tạo, thời lượng audio
  train, engine/dạng model và thông tin cảm xúc đã xác minh. Archive mới giữ
  snapshot Dataset Manifest khớp hash của run để tính thời lượng cho speaker;
  archive cũ thiếu chứng cứ ghi **chưa có thông tin**. Reference seconds không
  phải thời lượng train. Một model cảm xúc riêng cũng không đồng nghĩa model đó
  có thể tự chọn mọi cảm xúc.
- RVC hiện chuyển đổi audio, chưa có đường tạo mẫu từ Script; UI báo chưa hỗ trợ
  mẫu dạng này. Package RVC vẫn export/import như trước.

Đồng bộ source trên branch `feat/03-04-high-quality-training`, rồi đóng/mở lại
app theo `docs/SOURCE-SYNC.md` để API nhận route mới. Portable cũ chưa Pull source
không tự có các thay đổi này. Việc nối một thư viện core/model ngoài folder app
thuộc vòng SOURCE-EXTERNAL-ASSETS-01 tiếp theo.

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
