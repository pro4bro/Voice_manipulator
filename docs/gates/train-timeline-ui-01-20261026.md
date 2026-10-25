# TRAIN-TIMELINE-UI-01 — Log Training và transport Timeline dùng chung

Ngày: 2026-10-26. Phạm vi: một round frontend theo ảnh và yêu cầu của chủ dự án.

## Thay đổi

- Log ở Training chỉ lấy journal của các run thuộc batch đang xem. Bỏ việc trộn
  activity API, STT, TTS, engine của tác vụ khác; vẫn có lệnh, step/loss, cảnh báo,
  lỗi, checkpoint và nút Log đầy đủ. Lịch sử giữ nguyên các run/artifact thật.
- Bỏ icon trang trên thanh điều hướng; giữ số thứ tự và tên trang.
- Timeline thường, đa track import, OBS và alignment LipSync cùng dùng bố cục
  transport: Play ở trái, thời điểm hiện tại trên tổng thời lượng, canh phải;
  thanh tua khớp hai mép vùng waveform đang xem. RATE/gain/CLIP lên header phía
  phải, sau nhóm edit và zoom. Scrollbar được tính vào biên vùng xem.
- Với kiểu cột đa track không có rail trái, đồng hồ/Play dùng một hàng riêng phía
  trên thanh tua toàn chiều rộng, tránh chiếm diện tích của thanh tua.
- Giữ nguyên logic tua, bắt pointer, clock playback, đồng bộ Script/subtitle,
  tốc độ phát và mixer của từng loại Timeline.

## Nhái giọng trong Training hoạt động thế nào?

1. Import hoặc ghi âm ở Input, có transcript đúng và gán Speaker Profile cho
   đoạn của người cần nhái. Chọn dữ liệu đó vào dataset dùng cho Training.
2. Ở Training chọn Nhái giọng, chọn engine/model có adapter sẵn sàng, tick voice
   target rồi bấm Tạo voice nhái giọng.
3. App đọc dataset manifest và chỉ lấy đoạn của đúng Speaker Profile. Mặc định
   cần một đoạn trọn vẹn dài 3–10 giây, có text; ưu tiên gần 8 giây và transcript
   đáng tin. Nếu không có đoạn phù hợp, app báo lỗi thay vì tự cắt giữa đoạn và
   dùng transcript không khớp. Một số engine có tham số cửa sổ reference riêng.
4. App lưu audio/transcript tham chiếu cùng voice trong project, không fine-tune
   hay thay trọng số model. Sau đó vào Voice Manipulation, chọn Nhái giọng và
   voice của Speaker Profile để đọc Script bằng engine tương ứng.

Nguồn kiểm chứng: `Train.tsx`, `trainingModels.ts`,
`training_runner.py::_build_clone_voice/_publish_voice`,
`voice_reference.py::choose_reference`, `VoiceGenerator.tsx`, `VoiceScript.tsx`.
RVC trong ảnh là model chuyển giọng dùng ở Voice Changer; hai run OmniVoice LoRA
trong lịch sử là fine-tune đã hoàn tất. Chi tiết lỗi RVC xem `train-portable-rvc-01-20261025.md` và ADR0151.

## Kiểm chứng

- Regression log đã đỏ trước sửa: mong 2 dòng train nhưng nhận 5 dòng vì bị trộn
  thêm activity bên ngoài. Sau sửa giữ đúng 2 dòng và lỗi của run, loại bỏ API,
  STT, engine khác, event training trùng và journal ngoài batch.
- Focused frontend: **148/148 pass**, 5 file, 15.93 giây. Gồm TimelineNavigation,
  ImportedMultitrackTimeline, ObsLiveLinkTimeline, TimelineTransport, TrainingJob.
  Log: `.scratch/timeline-training-ui-focused.log`.
- Typecheck: pass. Build: pass, 241 modules;
  JS `index-DX26uk_N.js`, CSS `index-DWKhRzaz.css`.
- Full frontend: **175 file / 1385 test pass**, 204.11 giây.
  Log: `.scratch/timeline-training-ui-full.log`.
- Không sửa backend nên không chạy lại suite API trong round này. Gate API gần
  nhất vẫn 1630 pass / 1 timeout import VibeVoice không ổn định, xem gate trước.
- Browser inventory vẫn trả `Local browser use is disabled in Work settings`.
  Chưa xác minh native layout trên cửa sổ thật; không dùng browser automation
  ngoài công cụ được cấp để vượt giới hạn này.

## Còn thiếu

Nghiệm thu trực tiếp ở độ rộng/font thực tế: vị trí hai clock, hai mép thanh tua,
header ở mọi page; đổi CỘT/LAYER, cuộn dọc nhiều layer, resize và kéo playhead.
Full200epoch và nghe kết quả RVC vẫn là phần nghiệm thu riêng của round trước.
