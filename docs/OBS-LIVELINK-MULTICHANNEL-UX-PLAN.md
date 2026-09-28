# Kế hoạch OBS LiveLink: Recorder, Timeline và Script nhiều channel

**Trạng thái:** Kế hoạch chạy tuần tự ngày 2026-09-28; bản sửa này chỉ chia round, chưa triển khai sản phẩm.

**Nền tảng:** `docs/OBS-LIVELINK-UX-PLAN.md`, ADR 0012/0013, `docs/WORK-ROUNDS.md`, `CONTEXT.md`.

**Phạm vi:** Plugin OBS, Recorder khi chọn OBS LiveLink, Timeline và Script trong Speech to Text. Microphone/display và dự án cũ giữ hành vi hiện có.

## 1. Hiện trạng kiểm tra

- Plugin có Tools dialog Win32 với các control mặc định của Windows (`plugins/obs-pro4bro-bridge/src/livelink-dialog.cpp`), chưa có palette OBS hoặc logo Pro4Bro. Chưa tìm thấy asset logo PNG/SVG/ICO trong source đang theo dõi; vòng giao diện cần đưa logo chính thức vào gói plugin.
- Recorder đã có `ObsCaptureController` và nút bắt đầu/tạm dừng/dừng **app recording**. Khi chọn OBS LiveLink, `Recorder.tsx` trả về nhánh UI riêng nên nút Record quen thuộc của Recorder biến mất. Channel card hiện dùng hai dòng nhãn và meter với padding lớn.
- Trạng thái v3 phân biệt OBS recording, app recording, desired/applied forward, source missing và pending ACK. Chấm đỏ phải dựa vào **app recording đang nhận/lưu channel**, không chỉ vào OBS Record hoặc `desiredForward`.
- Timeline hiện là một `take`/`recordingPreview` và một gain/level chung. Nó chưa có chuỗi envelope theo từng OBS channel. Script live hiện dùng một chuỗi text và `textarea`, nên chưa thể giữ hai lượt nói đồng thời thành hai row.
- `ObsLiveTranscriber` hiện nhận chunk của OBS live session cũ qua endpoint v2. Endpoint chunk LiveLink v3 mới ghi PCM bền vững, chưa phát transcript theo channel vào Script. Không coi dữ liệu v2 này là đã giải quyết yêu cầu mới.
- `LIVELINK-08` đang mở: bản OBS Record đầu có PCM/MKA, bản thứ hai/thứ ba cùng process có MKV nhưng không có PCM/MKA. Phải sửa và đo lại lỗi này trước khi nghiệm thu bất kỳ dấu hiệu “đang ghi” hay waveform live nào.

## 2. Quy tắc sản phẩm

1. **Một phiên thu của app.** Recorder và OBS LiveLink mixer điều khiển cùng `ObsCaptureRecording`; không tạo bản ghi thứ hai. Nút Record của app không điều khiển nút Record trong OBS. OBS Start tự kích hoạt app theo trigger policy nếu không Ignore và target lease hợp lệ. Manual Record của app vẫn dùng được khi OBS idle.
2. **Đèn trung thực.** Đỏ chớp tắt chỉ khi app recording ở `recording`, channel đã `appliedForward`, source có mặt, không có interval disable/pause, và đường nhận PCM không báo lỗi/gap nghiêm trọng. Xám đứng yên khi không forward hoặc không thu. Trạng thái pending, paused, mất kết nối và lỗi có nhãn/icon riêng, không tô đỏ giả. Meter có tín hiệu khi idle không có nghĩa là app đang ghi. Cần thêm telemetry ACK/chunk gần nhất hoặc high-water mark vào status để phân biệt “được bật” và “thực sự nhận dữ liệu”; có trạng thái chờ ngắn trước chunk đầu.
3. **Danh tính channel khác danh tính người nói.** `channelId + sourceUuid` là khóa track; alias chỉ là nhãn. Một channel có thể chứa nhiều người. Không tự gán một `Speaker Profile` cho cả channel; diarization/final STT vẫn có thể phân biệt người trong channel sau khi thu.
4. **Một trục thời gian.** Envelope, speech span, transcript, interval và video span cùng quy chiếu từ sample clock/anchors của recording. Pause, disabled, missing và gap được vẽ tại đúng vị trí, không ép audio sát lại. Không dùng giờ đến của HTTP/browser làm timecode.
5. **Gain không phá nguồn.** Gain từng timeline là gain preview/phát lại trong Pro4Bro; meter hiển thị mức nguồn. Nó không tự chỉnh fader OBS hoặc ghi đè PCM/MKA gốc. Quy tắc này phải ghi rõ trong tooltip để tránh hiểu nhầm khi đang record.
6. **Live text là bản nháp.** Nội dung/word timing có thể trễ và đổi sau STT; final STT, sửa tay và SRT chỉ dùng dữ liệu có timing đã được xác thực. Nếu chỉ có timestamp theo đoạn, tô màu theo đoạn và gắn cờ thời gian, không giả vờ biết chính xác từng từ.

## 3. Chuỗi round để chạy tự động

`LIVELINK-08` là **gate nghiệm thu tích hợp cuối**. Các round `LIVELINK-08A` đến `08J` xây đủ luồng quan sát và xử lý trước khi đóng gate đó. Mỗi lần gọi agent làm đúng **một round** theo `AGENTS.md`, tự kiểm tra và ghi evidence; hệ thống chạy tự động có thể gọi lần kế tiếp theo cột “Vòng sau”. **Không cần anh kiểm tra hoặc phê duyệt giữa các round.** Anh chỉ kiểm tra sản phẩm sau `08J` và lượt tự nghiệm thu `LIVELINK-08`; nếu còn gate vật lý chưa thể chạy trên môi trường hiện có, báo rõ tại cuối chuỗi và giữ `LIVELINK-08` mở.

| Round | Phạm vi bàn giao | Bằng chứng tự kiểm, không yêu cầu anh thao tác | Vòng sau |
| --- | --- | --- | --- |
| `LIVELINK-08A` | Sửa lỗi PCM không đến ở lần OBS Record thứ 2/3 trong cùng process. Giữ mapping recording/channel/epoch và finalize đúng từng lần. | OBS thật Start/Stop 3 lần liên tiếp: mỗi lần có durable chunks, MKA track và MKV đúng recording ID; frame count, gap và log lỗi được lưu. Không tuyên bố L8 hoàn tất. | `08B` |
| `LIVELINK-08B` | Thêm bằng chứng thu theo channel vào status v3: recording owner, applied forward, ACK/chunk high-water, thời điểm chunk gần nhất, stall/gap và trạng thái pending. API/SSE snapshot sau reconnect phải nhất quán. | Test transition OBS Start, manual Record, Ignore, Pause, missing, disabled, API restart; status đối chiếu recording journal và chunk thật. Channel im lặng vẫn có PCM/ACK nếu đang thu. | `08C` |
| `LIVELINK-08C` | Recorder OBS LiveLink giữ nút **Record/Pause/Stop** quen thuộc, đồng bộ với OBS trigger; channel card cao khoảng 1/3 ảnh hiện tại, tên Channel trái và `Mic/Aux · trạng thái` phải trên cùng hàng, meter mảnh. Đèn đỏ chớp chỉ khi app thực sự nhận PCM; xám đứng yên khi không thu/forward; pending, paused, stalled, missing có nhãn riêng. | Component/state tests + screenshot panel hẹp/rộng; OBS Start làm nút đổi sang Stop và đúng channel đỏ, Stop trả về xám; Ignore Start không báo đỏ. Reduced motion có chữ `REC` và đèn không nhấp nháy. | `08D` |
| `LIVELINK-08D` | Xây envelope min/max/peak theo recording/channel/sample range từ PCM v3 đã ACK; stream dữ liệu giảm mẫu bằng snapshot + SSE/poll fallback, không đẩy raw PCM lên web. Lưu/rebuild từ MKA sau Stop. | Hai nguồn có âm khác nhau tạo hai envelope đúng ID; so peak/timing với PCM, thử silence, pause, disabled, gap, reconnect, giới hạn bộ nhớ/tốc độ. | `08E` |
| `LIVELINK-08E` | Timeline OBS LiveLink có **một waveform live riêng cho mỗi channel** với shared ruler/playhead, gap/pause đúng vị trí và nhãn nguồn. Sau Stop vẫn mở lại đúng track từ MKA/stem. | OBS thật ghi 2 nguồn khác nhau, nhìn thấy 2 waveform khác nhau trong lúc thu; mở lại project còn đúng channel, waveform và sample clock. | `08F` |
| `LIVELINK-08F` | Nút **Cột / Layer** nằm trái Mark In. Cột xếp ngang/cuộn ngang, gain và level nằm ngang ngay dưới waveform của từng cột. Layer xếp dọc/cuộn dọc, mỗi track cao khoảng 60% timeline hiện tại, gain/level riêng. Gain là preview/phát lại, không thay fader OBS hoặc PCM gốc. | Test/screenshot 1/2/5/20 channel, panel hẹp, zoom/scroll, chuyển mode giữ playhead/gain, keyboard và hiệu năng. | `08G` |
| `LIVELINK-08G` | Nối PCM v3 đã ACK đến live STT **tự chạy khi app ghi**, tách queue và utterance theo channel; event có recording/channel/utterance ID, sample start/end, partial/final revision, lag/error/timing trust. STT lỗi không chặn lưu audio. | Với 2 channel có lời nói, event live xuất hiện đúng source trong lúc Record; test STT chậm/lỗi, partial sửa, source đổi alias và reconnect không nhân đôi text. | `08H` |
| `LIVELINK-08H` | Script render row theo channel và thứ tự bắt đầu lượt nói; mỗi timeline hiện live subtitle riêng. A đang nói vẫn giữ row A khi B chen vào và B có row mới ngay khi speech span của B bắt đầu. | Fixture A→B→A và A+B: row/order/caption đúng channel, partial cập nhật tại chỗ, click row seek về nguồn; OBS thật thấy draft text trong lúc ghi. | `08I` |
| `LIVELINK-08I` | Tính giao speech intervals khác channel, tô đỏ đoạn text của cả hai row khi nói đồng thời; phần B sau khi A ngừng trở lại màu thường. Marker trên Script và timeline bấm nghe lại đúng đoạn/stem. Cùng-channel chỉ đánh dấu nghi vấn có bằng chứng, không tự tách người. | Test overlap một phần/toàn phần, boundary, đảo A/B, STT đến trễ và timing không tin cậy; so marker với sample clock và audio nghe lại. | `08J` |
| `LIVELINK-08J` | Làm plugin dialog đồng bộ màu, font, spacing, meter và panel với OBS; thêm logo Pro4Bro vào header/package mà không đổi pairing, forward, alias. Tìm asset thương hiệu hiện có trước; nếu không có, tạo mark + wordmark vector Pro4Bro trong sản phẩm và để anh duyệt hình tại lượt kiểm tra cuối. | Build/package và mở trong OBS thật; screenshot dark/light, DPI 100/125/150%, 1/5/nhiều source, keyboard, install/repair. | Gate `LIVELINK-08` |

Sau `08J`, gate `LIVELINK-08` chạy **ma trận tích hợp**: 1/2/5 nguồn, ít nhất 3 phiên Record liên tiếp, OBS/manual/Ignore, pause, source off/on, API restart, 30 phút có cue đầu/giữa/cuối/quanh pause, MKA/MKV/Script/live STT/overlap và chuyển project bằng Open Existing. Lưu raw cue offsets và artifact; từng cue phải đạt ngưỡng <=200 ms hiện có. Gate portable trên **máy Windows thứ hai** của `PORT-03B` chỉ được đánh pass khi thật sự có máy đó. Nếu không sẵn máy, hoàn tất mọi kiểm tra có thể tự chạy, để riêng gate này mở và trình anh danh sách kiểm tra cuối cùng thay vì yêu cầu anh xem từng round.

### Quy tắc chuyển vòng tự động

1. Trong round, sửa lỗi phát hiện bởi test hoặc OBS smoke cho đến khi tiêu chí round pass; ghi lệnh, số liệu, ảnh/artifact, thay đổi và rủi ro vào `docs/WORK-ROUNDS.md`.
2. Sau một round đã pass, báo ngắn kết quả và **tên round kế tiếp**; lần gọi tiếp theo bắt đầu đúng round đó. Không hỏi anh xác nhận ở ranh giới các round. Không mở rộng round để làm luôn round kế.
3. Nếu thiếu điều kiện ngoại vi (ví dụ máy Windows thứ hai), không giả lập thành công. Tiếp tục các round độc lập còn làm được; chỉ dừng chuỗi nếu thiếu điều kiện làm cho round kế không thể tạo ra kết quả đúng. Ghi chính xác blocker và bằng chứng.
4. `LIVELINK-08` và `PORT-03B` giữ trạng thái mở cho tới khi toàn bộ gate tương ứng pass. User review cuối cùng không thay thế artifact check và cũng không được yêu cầu trước khi UI Record, waveform từng channel và live STT đều hoạt động.

## 4. Ma trận trạng thái REC cần kiểm

| OBS | App | Channel | Chấm và nhãn |
| --- | --- | --- | --- |
| Recording | Recording, PCM đang đến | Applied forward + source có mặt | Đỏ chớp, `Recording` |
| Recording | Idle do Ignore Start, chưa armed hoặc lỗi start | Bất kỳ | Xám đứng yên, lý do rõ |
| Idle | Recording thủ công | Applied forward + PCM đang đến | Đỏ chớp, `Recording` |
| Bất kỳ | Recording | Không forward / source missing / channel interval disabled | Xám đứng yên, `Disabled` / `Missing` |
| Bất kỳ | Paused | Applied forward | Không chớp; nhãn `Paused` riêng |
| Bất kỳ | Recording nhưng ACK/chunk dừng quá ngưỡng | Applied forward | `Stalled`/gap cảnh báo, không báo đang thu bình thường |

## 5. Gate kiểm chứng mỗi vòng

- Frontend: `npm test`, `npm run typecheck`, `npm run build` trong `apps/web`; backend: `python -m pytest services/api/tests -q` từ repo root bằng interpreter sẵn có. Native plugin: build/package và mở trong OBS thật khi đổi plugin. `git diff --check`; không sửa `engines/OmniVoice`.
- Test logic tập trung vào transition, channel identity, ordering và overlap; kiểm trực quan screenshot ở chế độ cột/layer và strip 1/3. Không dùng mock để tuyên bố chất lượng audio, thời gian hoặc tương thích OBS.
- Audio: đối chiếu sample rate, channel layout, frame count, min/max envelope, clipping, thời điểm bắt đầu/kết thúc/pause, discontinuity và boundary; giữ source media, project-relative artifact và provenance.
- Live STT có thể trễ do hàng đợi/model. UI ghi rõ `Live draft`, trạng thái chờ/lỗi và không khiến chấm REC phụ thuộc vào việc STT thành công.

## 6. Điểm còn cần chốt trước khi code vòng tương ứng

- Logo chính thức chưa hiện diện dưới dạng asset ảnh trong checkout đã kiểm tra. `LIVELINK-08J` kiểm tra thêm asset của bản đóng gói; nếu vẫn không có, tạo logo vector mới trong sản phẩm. Anh duyệt hình thương hiệu một lần ở lượt kiểm tra cuối; không giữ các round âm thanh chờ asset.
- Ngưỡng VAD, độ dài utterance và tốc độ envelope/SSE sẽ đo trên fixture và OBS thật trước khi cố định. Giao thức sự kiện STT mới cần version/revision và migration đọc dữ liệu cũ, không thay đổi ý nghĩa `Speaker Profile`.
- Nếu muốn gain trong Pro4Bro thật sự thay đổi **âm thanh được OBS thu**, đó là một quyết định routing/capture khác với kế hoạch gain preview không phá nguồn ở trên và phải thiết kế/đo riêng.
