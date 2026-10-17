# Các round còn lại của Voice Manipulator

Cập nhật theo ledger/source tới round46 (2026-10-17); batch41–45 đã hoàn tất
triển khai, kiểm tra hồi quy và báo cáo. Các gate độc lập bên dưới còn mở.
Danh sách này thay mục “Vòng chính xác đề xuất tiếp theo” cũ của bản kế hoạch.
Số41–45 là số thực hiện theo đợt; các mã VM/VC là phạm vi chức năng. Một mã có
thể cần nhiều vòng sửa/nghiệm thu, nên chưa thể chốt tổng số round đến hoàn tất.

Round46 bổ sung sửa ổn định Browse/OBS và dọn pytest cũ; không đóng thêm gate
Checkpoint A hay triển khai13mã processor bên dưới. Báo cáo:
`docs/gates/hub-browse-cleanup46-20261017.md`.

## Batch41–45

| Round | Mã | Kết quả |
| --- | --- | --- |
| 41 | VM-STRETCH-IO-01 | Đo riêng hash/write/flush/fsync/close/replace/verify; giữ nguyên độ bền và kiểm chứng artifact |
| 42 | VM-STRETCH-SCHEDULE-01 | Timer đầu40ms không bị reset khi kéo liên tục; chỉ giữ thao tác mới nhất, sửa A→B→A |
| 43 | VM-STRETCH-LOCK-01 | Khóa theo output chuẩn hóa đường dẫn; output khác không phải chờ render không liên quan |
| 44 | VM-PREVIEW-RECOVERY-01 | WAV cache sai container trả lỗi kiểm chứng, có thể dựng lại; hết HTTP500 ở hai route đã tái hiện |
| 45 | VM-CHECKPOINT-A-05 | Artifact/move/reopen và browser thật; sửa hàng hướng dẫn Script bị cắt và đọc checkpoint Windows; regression đã đạt |

Browser đã mở project di chuyển có dấu, tải waveform/audio, chọn subtitle có
overlay/handle, Undo/Redo9,2↔9,6s và phát/dừng. Các mục hướng dẫn Script đã có
vùng cuộn riêng; màn hình thấp vẫn cần UAT về mức thuận tiện. Chưa đo Ctrl-drag
đến audio-ready trên browser, chưa nghe chấm chất lượng hoặc Save/Cancel native.
Chi tiết: `docs/gates/vm-checkpoint-a-preview-io-browser-20261017.md`.

## Batch36–40 đã thực hiện

| Round | Mã | Kết quả |
| --- | --- | --- |
| 36 | VM-STRETCH-PROFILE-01 | Đo riêng cache/lock/render/artifact/request, không dùng thời gian render cũ làm latency cache |
| 37 | VM-STRETCH-CPU-01 | Quét clipping bằng signed-array; cùng PCM cho kết quả trước/sau giống từng byte |
| 38 | VM-STRETCH-REUSE-01 | Tái dùng đúng tiền tố lịch sử đã kiểm hash/PCM/biên, chỉ render các thao tác mới |
| 39 | VM-STRETCH-QUEUE-01 | Xếp preview/commit có thứ tự, gộp thao tác chờ, giữ mapped seek tới khi audio có metadata |
| 40 | VM-CHECKPOINT-A-04 | Chặn counter cache sai, kiểm Undo/Redo/move/reopen và regression; gate250ms/nghe/UI còn mở |

Trên8s speech thật,5 cặp render3 thao tác cho cùng WAV: median full284ms,
tái dùng2 thao tác + render1 là214ms; có outlier556ms. Đây không phải latency
browser và chưa khép250ms. Báo cáo: `docs/gates/vm-checkpoint-a-preview-performance-20261017.md`.

## Batch31–35 đã thực hiện trước đó

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

1. Tiếp tục VM-STRETCH-01 với budget250ms: đã có timer40ms không starvation,
   khóa theo output và số đo IO sâu. Fsync hiện dao động lớn (12 render thật:
   median127ms cho riêng fsync, tổng render-call173–536ms). Cần đo cả Ctrl-drag,
   waveform/audio-ready và continuous playback; đánh giá giải pháp storage/cache
   theo contract rõ ràng. Chưa có bằng chứng để bỏ hash/durability hoặc báo gate
   đạt từ median server. Browser đã chạy được; thao tác giữ Ctrl khi drag chưa
   được kiểm chứng bằng công cụ hiện có.
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
| VM-STRETCH-01 | Preview giữ pitch, prefix cache, queue, timer40ms không starvation, khóa theo output và IO diagnostics; browser Undo/Redo/playback đã kiểm | Gate250ms chưa khép: storage/fsync dao động, chưa đo Ctrl-drag→audio-ready hay nghe continuous playback; không lấy số40ms scheduler làm tổng latency |
| VM-RIPPLE-01 | Mapping nguồn bất biến, offsets, Undo/Redo | Piecewise locked acoustic anchors; nhóm video/background liên kết |
| VM-FIX-01/02 / VM-LOUDNESS-01 | Dirty-unit generation, immutable Apply, clip/row gain, headroom và artifact | Nghe mix, repeated-edit workflow thật, identity/delivery; chạy lại sau khi có conditioning thực |
| VOICE-EXPORT-13B4 | HTTP WAV/SRT/CSV/Range, moved project giữ hash; browser tải/phát WAV preview | Save ra đường đích thật, Cancel không ghi file đích và đường có dấu; native dialog chưa được kiểm chứng |
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
