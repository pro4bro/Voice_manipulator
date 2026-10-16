# Các round còn lại của Voice Manipulator

Cập nhật theo ledger/source tới round35 (2026-10-16); batch31–35 đã hoàn tất
phần triển khai, kiểm tra tích hợp và báo cáo. Các gate độc lập bên dưới còn mở.
Danh sách này thay mục “Vòng chính xác đề xuất tiếp theo” cũ của bản kế hoạch.
Số31–35 là số thực hiện theo đợt; các mã VM/VC là phạm vi chức năng. Một mã có
thể cần nhiều vòng sửa/nghiệm thu, nên chưa thể chốt tổng số round đến hoàn tất.

## Batch31–35 đã thực hiện

| Round | Mã | Kết quả cần có |
| --- | --- | --- |
| 31 | VM-WORD-AUDITION-01 | Nghe từng từ trên output đã lưu, kể cả từ chưa tin cậy |
| 32 | VM-WORD-REVIEW-01 | Người dùng sửa/xác nhận biên từ, lưu output mới giữ nguyên WAV |
| 33 | VM-REVIEW-EXPORT-01 | Tải báo cáo đối chiếu ba phương án cùng nhận xét đã lưu |
| 34 | VM-TIMING-RECOVERY-01 | Phân biệt lý do hết hiệu lực, retry và phản hồi job đúng owner |
| 35 | VM-CHECKPOINT-A-03 | Kiểm tra tích hợp, cập nhật danh sách còn lại và giới hạn nghiệm thu |

Đã có công cụ nghe mốc từ, nhập biên và lưu output mới. Chúng sửa annotation
trên audio đã có; chưa khiến model tự phát từng từ đúng mốc người dùng đặt.
Các bản speech thật vẫn chưa có xác nhận nghe do người dùng lưu.

## Thứ tự tiếp tục đề xuất

1. Profile và tối ưu VM-STRETCH-01 với budget250ms hiện hữu; đây là phần có số đo
   thiếu cụ thể và có thể tiếp tục độc lập khi công cụ UI chưa hoạt động.
2. Chứng minh conditioning giữ identity cho VM-DELIVERY-01, rồi mới nối lịch
   VM-REF-RANDOM-01 vào âm thanh/Fix. Nếu engine không hỗ trợ thì giữ capability
   unavailable và mở feasibility cho một engine tương thích, không ép pass.
3. Hoàn thành kiểm tra timing/biên bằng tai, A/B/C và workflow dài; dùng công cụ
   review để ghi đúng những từ/bản đã nghe. Browser/native Save cần runtime UI
   hoạt động trước khi khép VOICE-EXPORT-13B4.
4. Khi Checkpoint A được nghiệm thu, làm VC-GATE-02 và các nhánh phía dưới theo
   dependency. Các lỗi phát hiện trong UAT sẽ có round sửa riêng.

## Ưu tiên trước processor mới — Checkpoint A còn mở

| Hạng mục | Phần đã có | Việc còn phải làm / phụ thuộc |
| --- | --- | --- |
| VM-GEN-01 / VM-PATCH-01 / VM-PATCH-REF-01 / VM-PATCH-HYBRID-01 | Artifact thật từ model train, clone context và hybrid; preview/Apply, lịch sử, so sánh | Anh nghe A/B/C lời đọc, giống giọng, cách thể hiện và biên nối; lỗi tìm được cần round sửa riêng |
| VM-PATCH-02 / STT-TIMING-ACCURACY-01 | Target frame chính xác, native duration2.16s, ASR sửa timing23/25 từ | Kiểm tra biên từ bằng tai, mẫu ngắn/dài/đầu/cuối/im lặng; đánh giá năm ngôn ngữ trên dữ liệu thật |
| VM-DELIVERY-01 | Lưu yêu cầu và capability preflight, chặn conditioning chưa hỗ trợ | Engine/model giữ cùng danh tính và sinh được emotion/whisper/shout; benchmark cùng text/speaker, ít nhất hai cảm xúc và nhiều mức phát giọng |
| VM-REF-RANDOM-01 | Nguồn/đặc tính, seed và lịch random có lưu/replay | Áp lịch vào conditioning audio thật, edit/lock event trên Timeline, nối Fix; phụ thuộc delivery được kiểm chứng |
| VM-TIMING-REF-01 / VM-DURATION-01 | Timing template, budget/lock, native duration và đo frame | Thực thi anchor từng từ/phrase khi model hỗ trợ, partial locks và trường hợp text không fit; không đồng nhất time-stretch với model obey word anchors |
| VM-STRETCH-01 | Preview WAV giữ pitch, Ctrl handles, waveform/audio và cache | Cold end-to-end250ms chưa đạt (đã đo312–812ms); tối ưu có profile, continuous drag/playback/browser và nghe |
| VM-RIPPLE-01 | Mapping nguồn bất biến, offsets, Undo/Redo | Piecewise locked acoustic anchors; nhóm video/background liên kết |
| VM-FIX-01/02 / VM-LOUDNESS-01 | Dirty-unit generation, immutable Apply, clip/row gain, headroom và artifact | Nghe mix, repeated-edit workflow thật, identity/delivery; chạy lại sau khi có conditioning thực |
| VOICE-EXPORT-13B4 | HTTP WAV/SRT/CSV/Range, moved project giữ hash | Save ra đường đích thật, Cancel không ghi file đích, đường có dấu, playback; cần công cụ browser/native hoạt động |
| VM-SCRIPT-01 / VM-SELECTION-01 / VM-NAV-01 / VM-REF-DETAIL-01 | Hierarchy/selection/overlay/markers/slot navigation đã có source và test | UAT với Script dài và năm ngôn ngữ; hoàn thiện vấn đề thực tế tìm thấy, không làm lại toàn bộ code đã có |

Các hàng trên là phần còn thiếu hoặc gate nghiệm thu, không phải tất cả đều là
processor cần viết lại. Checkpoint A chỉ khép khi có bằng chứng tương ứng; test
xanh không tự thay thế việc nghe, thao tác browser/native hoặc đo hiệu năng.

## Sau Checkpoint A — các vòng chức năng đã có trong kế hoạch

Theo thứ tự phụ thuộc trong `docs/VOICE-MANIPULATOR-NEXT-PLAN.md`:

| Nhánh | Các mã còn lại | Điều kiện/kết quả chính |
| --- | --- | --- |
| Voice Changer | VC-GATE-02 → VC-FILE-01; VC-LIVE-02 | Corpus ít nhất40 utterance, kiểm chất lượng chuyển giọng, file→Take; live cần calibration, session ownership và đo thiết bị thật |
| Voice Isolator | VM-ISOLATE-01 → VM-ISOLATE-02 → VM-ISOLATE-03 | Chọn engine và bài toán voice/background, output stems thật, rồi target-speaker/overlap; diarization không tự tạo stem |
| Nhận diện cảm xúc | VM-EMOTION-01 → VM-EMOTION-02 | Benchmark Việt/Anh/Trung/Nhật/Hàn, nhãn/độ tin cậy, gợi ý có người review; khả năng train TTS cảm xúc là gate riêng |
| Voice Dubber | VM-DUB-01 → VM-DUB-02; VM-DUB-ANALYZE-01 → VM-DUB-TRANSLATE-01 → VM-DUB-AUTO-01 | TTS cue theo cast, fit/mix, hiểu clip/giữ nhân vật, dịch ngữ cảnh/budget và job cha resume; auto cảm xúc phụ thuộc emotion và delivery |

Đây là **13 mã chức năng sau Checkpoint A** (3 Changer,3 Isolator,2 Emotion,
5 Dubber), chưa tính các round sửa/nghiệm thu. Checkpoint B đòi processor tạo
artifact thực, không chỉ giao diện hoặc planner.

## Hướng nghiên cứu chưa ấn định round triển khai

- Mobile/offline TTS: chọn Android/iOS và thiết bị; đo RAM/storage/RTF/pin/nhiệt,
  export/quantization và khả năng load adapter đúng base model.
- Custom voice cho Convai/dịch vụ ngoài: xác minh API/plan/BYOTTS hiện hành,
  streaming/latency/auth và contract kết nối local voice đã qua gate.
- Digital Human/LipSync: Phase06, rig/blendshape/runtime, audio–frame sync và
  biểu cảm; voice do người dùng train phải là artifact đã kiểm chứng.

Các hướng này cần feasibility riêng khi anh chọn triển khai. Chưa cộng chúng
vào13 mã phía trên. Phase03 publication/calibration, Phase04 session và
SOURCE-EXTERNAL-ASSETS-01/OBS/STT của queue chung giữ dependency riêng.
