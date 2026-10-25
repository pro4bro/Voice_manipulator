# Script dùng chung và cách phát âm từ định dạng

Ngày: 2026-10-25. Nhánh: `codex/expressive-engines`.

## Yêu cầu và trạng thái

| Yêu cầu | Trạng thái |
| --- | --- |
| Input và Voice Manipulation dùng cùng editor thường, cột speaker/nội dung | Triển khai trong VM-SCRIPT-UNIFIED-01; cần nghiệm thu Browser |
| Cuộn toàn vùng soạn, không mất nửa chiều cao | Cùng viewport/scrollbar và flex layout; cần nghiệm thu kích thước thật |
| Quét/copy nội dung, speaker, hoặc cả hai theo lượt nói | Cùng serializer; kiểm tra tự động có cả ba trường hợp |
| Timeline co kéo chiều cao | Có divider ngang, phím mũi tên, lưu theo page trên máy |
| Kéo playhead không bị selection Script kéo về đầu từ | Chặn seek/pan phản hồi trong gesture; highlight text không đổi DOM Selection |
| Giữ âm cuối đầy đủ | NEXT: VM-VOICE-ENDINGS-01, chưa sửa pipeline âm thanh |
| Xuống dòng thay đổi nhịp/thời lượng | PLANNED: VM-SCRIPT-DELIVERY-01, chưa áp dụng vào synthesis |
| HOA 30%, B 60% + to hơn, U 90% + la hét | PLANNED: VM-SCRIPT-DELIVERY-02, chưa áp dụng vào synthesis |

AGENTS.md yêu cầu mỗi invocation hoàn thành một round có giới hạn, kiểm tra và
dừng. Round giao diện này không đổi schema Script hoặc chạy inference/training.
Các yêu cầu phát âm bên dưới vẫn mở; đây là kế hoạch thi công, chưa phải chức năng
đã hoạt động. Phase03 giữ60%, Phase06 mở.

## VM-SCRIPT-UNIFIED-01 — giao diện và đồng bộ thời gian

- `ScriptTextPane` dùng chung viewport, scrollbar, editor hai cột và highlight khi
  phát. `ScriptTextView` giữ cùng copy, paste literal, Alt+Enter, Ctrl+Arrow và
  Undo/Redo cục bộ. Input dùng adapter `TranscriptTextView` để nối về text/words
  gốc, giữ nguyên từng ký tự và timing; chưa có STT thì multiline vẫn một lượt.
- Đổi speaker theo lượt dùng cùng grouping với bảng. Sau khi sửa từ đầu lượt,
  editor giữ ID/ranh giới đang soạn đến khi reconcile timing, kể cả parent dựng lại
  mảng words/speakers có cùng giá trị. Mỗi nguồn giữ clock/revision riêng.
- Highlight phát bằng CSS Highlight API, không focus/setSelectionRange. Range
  đang gõ hoặc quét copy không trở thành selection của từ đang phát. Timeline
  không seek/pan theo selection trong lúc đang kéo/scrub.
- Nhiều nguồn đồng thời giữ một nguồn cuộn; chọn nguồn trên Timeline đổi nguồn
  theo dõi. Cuộn/soạn tay ưu tiên người dùng; tương tác Timeline khôi phục follow.
- Divider trên Timeline điều chỉnh toàn module, chặn chiều cao quá nhỏ/lớn,
  xử lý pointer cancel/blur/unmount và lưu chiều cao theo page trong localStorage.
- Chế độ AI comparison, live transcript và gán nhãn chuyên dụng tiếp tục dùng
  presentation riêng. Chúng không phải normal text view. Không bỏ tính năng đó
  chỉ để dùng chung một DOM cho mọi chế độ.

## NEXT — VM-VOICE-ENDINGS-01: bảo toàn âm cuối

### Bằng chứng từ mã hiện tại, chưa kết luận nguyên nhân audio thực tế

- `voice_script_speaker.py::trim_to_words` cắt đuôi theo thời gian từ cuối do STT
  đánh dấu trusted cộng300ms. Nếu STT kết thúc sớm, mốc này có thể nằm trong âm cuối.
- OmniVoice upstream `_postprocess` mặc định remove silence và fade100ms; product
  worker chỉ tắt postprocess/đổi fade5ms khi duration được khóa. Một lỗi có thể đã
  xảy ra trước khi product nhận WAV. Upstream được đọc, không sửa.
- Cần tách âm do model chưa phát hết, âm bị postprocess xóa, âm bị product trim,
  và âm bị cắt ở giới hạn Fix clip. Thêm silence sau một âm đã mất không sửa nó.

### Thi công và nghiệm thu

1. Lưu fixture riêng gồm raw engine WAV, WAV sau từng bước, text và word timing;
   tái hiện câu bị lẹm. Không sửa media/project của chủ dự án để thử.
2. Viết regression có voiced/quiet terminal phoneme vượt mốc STT; kiểm tra cả STT
   ước lượng, STT trusted nhưng kết thúc sớm, silence dài và sample cuối có tín hiệu.
3. Chính sách natural duration phải giữ hết tín hiệu cuối và một khoảng nhả câu;
   chỉ trim phần đã xác nhận là silence. Đánh giá postprocess OmniVoice qua adapter
   sản phẩm, không chỉnh `engines/`. Không kéo giãn toàn câu để che mất âm cuối.
4. Đưa chính sách mới vào fingerprint cache. Giữ clip/output cũ bất biến; xuất
   derivative mới. Duration khóa/Fix không được lấn đoạn sau: báo không-fit hoặc
   dùng fit đã kiểm chứng, không cắt bỏ âm để khớp budget.
5. Kiểm tra WAV sample rate/channels/format, peak/clipping, thời lượng, từ cuối,
   boundary/crossfade, play/export cùng composition. Nghe A/B nhiều câu tiếng Việt
   bằng model thật trước khi ghi nhận hết lỗi.

## VM-SCRIPT-DELIVERY-01: xuống dòng điều khiển nhịp

- Hiện `scriptReadiness` chuẩn hóa whitespace trước khi gửi lời đọc; API có
  `sourceText` để giữ văn bản hiển thị. Dấu xuống dòng chưa có nghĩa về pause.
- Giả định đang đề xuất: xuống dòng thêm pause, bỏ xuống dòng giảm pause; không
  tạo row mới và không tự giãn mọi từ. Câu hỏi tùy chọn về pause/giãn lời đã gửi
  trong phiên, chưa có trả lời; chưa coi đây là lựa chọn đã được chủ dự án duyệt.
- Giữ raw text/newline qua request, job, cache và snapshot. Biên dịch điểm nghỉ
  độc lập với row/speaker; pause thuộc timeline timecode, duration allocation,
  subtitle và output metadata. Không nhờ model đoán newline đã bị bỏ.
- Kiểm tra blank line, Alt+Enter, paste, merge legacy, nhiều Fix rải rác, duration
  khóa, Stop/retry/cache, export tổng và reopen/move project. Đo thời lượng pause
  bằng số sample; chốt giá trị pause mặc định trong round này.

## VM-SCRIPT-DELIVERY-02: nhấn giọng theo cụm từ

- Nút B/U hiện chỉ là state CSS của cả view. Cần lưu định dạng theo khoảng ký tự
  trong từng row và hiển thị giống nhau ở bảng/text trước khi nối inference.
- Lưu/chỉnh khoảng định dạng qua gõ, IME, paste, replace, Undo/Redo, gộp legacy,
  tách/gộp row, Version checkout và migration. Copy plain text giữ nội dung; export
  Script và snapshot giữ ý định phát âm. Không gửi thẻ HTML như lời thoại.
- Mức yêu cầu: chữ HOA0.30, đậm0.60, gạch dưới0.90 kèm shout. Khi chồng định dạng,
  đề xuất lấy mức cao nhất, không cộng dồn; câu hỏi tùy chọn chưa có trả lời.
  Phần trăm là intensity mong muốn, không phải phần trăm gain hoặc số dB.
- Phân biệt nhấn giọng/vocal effort và gain hậu kỳ. Tăng gain không tạo la hét.
  Mapping engine phải giữ speaker identity; engine không đáp ứng phải báo rõ
  trước generation, không đánh dấu applied bằng metadata khi audio không có.
- Thử mapping có thật của từng engine/Voice Model; chọn mức native được hỗ trợ
  hoặc Voice Model Set hợp lệ. Không trộn LoRA ngẫu nhiên theo từ và không mặc
  định mọi voice clone/train nhận cùng emotion/intensity/shout conditioning.
- Thay đổi nhấn giọng phải làm dirty/cache/Fix nhận đúng vùng, giữ offset qua text
  normalization và báo effective/requested trong delivery report. Kiểm tra gain
  theo headroom, clipping và nghe A/B thay vì quy đổi trực tiếp0.9 thành+90% gain.

## Nghiệm thu UI đang mở

Browser hiện trả `Local browser use is disabled in Work settings` ngay ở inventory;
không có tab để kiểm tra. Cần native dark/light: kéo divider, viewport đủ chiều cao,
cuộn dài, copy xuôi/ngược ba kiểu cột, caret/IME/Undo, playhead ở zoom/pan khác nhau,
subtitles ghim và nhiều track nói đồng thời. Unit test không thay nghiệm thu này.
