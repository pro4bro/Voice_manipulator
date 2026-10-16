# Kế hoạch các vòng tiếp theo của Voice Manipulator

Ngày lập: 2026-10-14. Cập nhật: 2026-10-15. Trạng thái: đã thực hiện tới vòng17, có các slice/gate còn mở;
phân biệt phần code đã triển khai và các gate nghiệm thu còn mở bên dưới.
Đã cập nhật theo yêu cầu owner: duration theo clip/đoạn/câu, mood/emotion và
whisper/shout; ba chiến lược Patch; Isolator theo định nghĩa gốc; Dubber tự động.
Bổ sung 2026-10-15: timing từ reference, chọn vùng ba chiều và overlay,
multi-selection với navigation markers, Ctrl-handle time-stretch/ripple và
Fix Voice Generated theo revision chỉ sinh lại các đơn vị còn thay đổi.
Bổ sung cùng ngày: import/đánh dấu nhiều reference footage, gán đặc tính theo vùng
qua right-click và random riêng giá trị/thời điểm trên lịch áp dụng được lưu.
Bổ sung Reference Detail ở cột phải: slot hai dòng theo từng vùng đã gán, xổ
chi tiết từng reference footage và các đặc tính được chọn.

## Cập nhật round17 — 2026-10-16

Fix Apply/gain/target carryover đã nối; speech thật5.71s137040frames0clip, gap/row2
byte-exact, source/metadata/idempotence/move pass. API48/UI75/build; tiếp theo
Flow01/Patch01/PatchRef01. Chưa khép quality/conditioning/browser gates.

## Cập nhật round16 — 2026-10-16

VM-FIX-01 clip queue/checkpoints/Stop/retry và UI đã tích hợp; model full thật
tạo2.68s64320frames,0clipping/no-op/source hash/lease pass. API12/UI18/build pass.
Chưa Apply output: tiếp theo VM-FIX-02 rồi VM-FLOW-01/VM-PATCH-01/VM-PATCH-REF-01
trong nhóm năm round owner yêu cầu. Gate nghe/identity/word timing/browser và
conditioning vẫn mở. Chi tiết ở gate rounds16–20 và ADR0079.

## Tiến độ vòng6–10 — 2026-10-15

**Cập nhật vòng11–15:** ripple/stretch preview, delivery capability preflight,
gain render và schedule random đã tích hợp source. Cách diễn và random vẫn chưa
có conditioning đã kiểm chứng; cold312–812ms chưa đạt250ms, browser/nghe/identity
còn mở. Gate tổng rounds11–15 phân biệt processor thực với planner. Vòng tiếp
theo theo kế hoạch VM-FIX-01 giữ các dependency trên và STT acoustic review.
Lịch sử vòng6–10 bên dưới không thay thế trạng thái mới này.

Reference Detail, resolver, timing source/template, markers và duration planner/
native generation đã triển khai. Model clone GPU32step đã tạo mẫu1.78s tự nhiên,
1.42s ngắn,2.60s dài và clip hai profile4.95s gồm.35s nghỉ; timing override,
reuse2/2 và move/reopen/hash/PCM/boundary đã qua. Đây chưa phải nghiệm thu nghe,
identity, exact word anchors hay browser/native UI. Emotion/intonation/shout/
whisper, loudness/random/Fix, Ctrl-stretch/ripple còn ở các vòng đã định sau.
Gate tổng: `docs/gates/voice-manipulator-rounds6-10-20261015.md`, ADR0077.
Vòng tiếp theo: **VM-RIPPLE-01**. Phần nhóm đầu dưới đây là lịch sử tại thời điểm
kết thúc năm vòng đầu; trạng thái hiện tại ưu tiên đoạn này và các ledgers.

## Tiến độ nhóm năm vòng đầu — 2026-10-15

- VM-GEN-01 đã sửa fingerprint/cache và chạy model full thật trên CPU; lượt thử
  timeout sau 291.16s. Khi GPU trống, lượt native Windows đã tạo WAV full thật
  2.2s trong70.48s. Sau đó full/clone/LoRA Script thật đã qua sửa1/reuse2,
  Stop2, retry3/3 và move/reopen reuse3/3, hash/PCM/boundary đúng. Gate nghe,
  word alignment thực và browser/native còn mở trong báo cáo tổng.
- VM-SCRIPT-01, VM-REF-LIB-01, VM-SELECTION-01 và VM-REF-ASSIGN-01 đã triển khai
  main source, có kiểm tra tự động và nghiệm thu API với WAV PCM riêng. Script,
  role reference và binding đi theo project khi move/Open Existing.
- Chưa có browser provider để nghiệm thu bố cục/thao tác thực. Cấu hình duration,
  emotion/delivery/gain và reference vẫn là ý muốn được lưu, chưa phải processor
  đã thực hiện; các vòng duration/delivery/resolve/random/Fix còn ở phía sau.
- Vòng tiếp theo là **VM-REF-DETAIL-01**, gồm slot hai dòng, xổ chi tiết và bấm
  nội dung slot để điều hướng đồng thời Timeline/Script. Chi tiết và số kiểm tra
  cuối ở `docs/gates/voice-manipulator-first-five-20261015.md` và ADR0076.

Mục tiêu là hoàn thiện một luồng có thể sử dụng và kiểm chứng: chọn model giọng,
đọc Script, nghe và sửa đầu ra, xử lý tiếp, rồi xuất artifact của project. Ưu tiên
Voice Over và Voice Patch trước; Voice Changer là page riêng có các dependency
chung. Isolator và Dubber tiếp nối sau khi có job và lineage dùng chung.

Kế hoạch này bổ sung chi tiết Phase 05; không thay thế queue trong
`docs/WORK-ROUNDS.md`, không ghi nhận hoàn thành Phase 03 hoặc Phase 05.
Khi bắt đầu mỗi vòng phải đối chiếu lại ledgers và working tree. HUB-COLLECTION-01
đã tích hợp main source theo ledger 2026-10-14; native/GPU inference acceptance
vẫn còn mở sau lần CPU chạy 583.06 giây không tạo WAV. Các slice đã code và
nghiệm thu artifact thực giữ trạng thái riêng. Checklist theo quy ước issue local tại
`.scratch/voice-manipulator-next/`, giữ nguyên `tasks/plan.md` của OBS.

## Hiện trạng đã đối chiếu

| Khả năng | Bằng chứng hiện có | Khoảng trống cần xử lý |
| --- | --- | --- |
| Voice Over | `VoiceGenerator.tsx`, `voice_script_speaker.py`, `file_voice_outputs.py`: chọn voice từng dòng, job, cache clip, ghép WAV, word timing, Stop | Nghiệm thu model thật import từ Collection, nhiều dòng/người nói, tái sử dụng đúng clip và kết quả sau reopen/move |
| Export | Route WAV/SRT và `VoiceOutputPanel.tsx`; VOICE-EXPORT-13B3 đã kiểm tra WAV thật và SRT hợp lệ | Bằng chứng lưu file thật, hủy Save và vị trí lưu qua browser/native còn mở |
| Library/Collection | USER-FEEDBACK-14 tách bộ lọc generate khỏi training; PORT-FEEDBACK-02 có ZIP model; HUB-COLLECTION-01 đã tích hợp | Native/GPU inference bằng đúng archived model còn cần HUB-COLLECTION-UAT-01 |
| Voice Patch | `VoicePatch.tsx` có START/END, text và nút bấm | Chỉ nhận `hasTake`, nút không có callback; chưa có processor, artifact hoặc persistence cho patch |
| Isolator / Dubber | `workspaceManifest.ts` khai báo hai mode trong `plannedModes` | Chưa có luồng processor hoàn chỉnh; cần source audio và dữ liệu chọn vùng phù hợp từng mode |
| Voice Changer | Page riêng, RVC worker, preflight thiết bị, native stream, record hai kênh | Gate tiếng Việt thiếu/không đạt; chưa hoàn tất file job, similarity, cross-gender và loopback latency |
| Emotion | Tag file/từ thủ công; bộ SpeechBrain local có 27 clip nghe thử | Chưa có processor production; tiếng Việt trong bộ mới là TTS, score trên silence từng sai rất cao |

Nguồn tiến độ chính: `docs/PROJECT-STATUS.md`, `.planning/ROADMAP.md`,
`.planning/phases/05-manipulator-pipeline/05-CONTEXT.md`,
`.planning/phases/05-manipulator-pipeline/05-01-PLAN.md`.
Không dùng bảng baseline 2026-09-22 để phủ nhận các slice triển khai sau đó.

## Yêu cầu chức năng owner đã chốt

### Voice Over theo clip, đoạn và câu

Script có cấu trúc clip → đoạn → câu. Người dùng có thể tách/join câu, chỉnh text,
gán người nói/voice và yêu cầu generate lại một câu. Mỗi câu giữ ID, quan hệ cha,
revision và các override; câu mới kế thừa cấu hình cha nhưng không làm mất tag
đã gán khi tách. Một câu ngôn ngữ đích không nhất thiết tương ứng một câu nguồn,
nên Dubber cần mapping các cue nguồn thay vì nối bằng số thứ tự dòng.

| Điều khiển | Phạm vi và hành vi |
| --- | --- |
| Thời lượng mong muốn | Toàn clip, từng đoạn hoặc từng câu; có mode tự nhiên và mode target duration. Cho khóa duration một số câu rồi phân bổ thời gian còn lại. |
| Mood | Bối cảnh/cách diễn của lời nói, ví dụ trấn an, dè dặt, căng thẳng; có note của người dùng. Mood được lưu riêng và mapping tới capability engine khi đã kiểm chứng. |
| Emotion | Emotion Label/intensity của từng câu; tag thủ công, tag từ quy trình phân tích hoặc từ Script nhập. Không tự thay tag đã được người dùng xác nhận. |
| Cách phát giọng | Thì thào, nói nhỏ, bình thường, nói lớn, la to; điều khiển hoạt động phát giọng và sắc thái, cần model/reference phù hợp. |
| Mức âm thanh | Gain/loudness cho câu/đoạn/clip để cân mix sau generation; lưu cả requested gain và gain thực áp dụng/headroom. |

Độ ưu tiên cấu hình: override câu → override đoạn → mặc định clip. Note/tag
người dùng đã khóa ưu tiên hơn gợi ý máy. Emotion, mood, delivery và gain là các
chiều riêng; một câu có thể buồn và nói nhỏ, hoặc giận nhưng cố thì thào.

Duration toàn clip gồm speech, pause giữa câu/đoạn và khoảng đầu/cuối. Khi tổng
duration đã khóa cộng pauses vượt duration clip, trả conflict trước inference.
Phân bổ duration cho câu chưa khóa dựa trên baseline đọc thực/ước lượng theo
ngôn ngữ; regenerate và đo lại, không chia đều số giây cho mọi câu. Nếu text quá
dài để đọc rõ trong target, hiển thị câu không fit và cho sửa text, tăng thời
lượng, giảm pause hoặc đổi policy. Chỉ xác nhận đạt khi WAV cuối khớp target
trong tolerance đã định nghĩa theo sample/timebase và vẫn đủ lời đọc.

Gain được áp dụng ở render/export đúng revision nếu người dùng muốn nó có trong
file; playback mixer gain không tự trở thành metadata generation. Khi tăng mức
âm vượt headroom, cần giới hạn/limiter có báo giá trị thực, không để WAV clipping.
Whisper/shout thay đổi cách phát âm và màu giọng, cần đánh giá giữ danh tính ở
cùng mức nghe để tránh chấm cao chỉ vì clip lớn tiếng hơn.

### Timing theo reference và chỉnh trực tiếp trên Timeline

Yêu cầu owner 2026-10-15: điều khiển timing mong muốn càng chặt càng tốt, ngoài
speed multiplier. Có thể lấy mẫu từ (1) clip reference riêng, (2) footage thực
đã dùng training của Speaker Profile, (3) source clip/cue đang Dub hoặc Patch.
Không suy ra tốc độ gốc chỉ từ weights/LoRA; phải còn source footage hoặc timing
features có lineage để trích speech duration, pause, rhythm và các mốc dùng được.

Timing plan gồm start/end/duration của clip/đoạn/câu, khoảng nghỉ, các mốc speech
được khóa, nguồn reference và cách mapping text. Khi text giống nhau và alignment
đã review, có thể đặt mục tiêu tới phrase/word. Khi text mới hoặc bản dịch khác
reference, chuyển envelope nhịp/pause và cue/phrase tương ứng; không ép từng từ
đích theo số thứ tự từ nguồn. UI cho xem các mục tiêu máy đề xuất trước khi khóa.
Requested targets và actual measured timing được lưu riêng; report sai số theo
boundary và các speech anchors, không dùng đủ tổng số giây để tuyên bố đã khớp
nhịp nói bên trong. Tolerance render theo sample/timebase và tolerance speech
alignment phải được định nghĩa/đo riêng trong gate; không hứa model đặt mọi từ
chính xác tới từng sample chỉ vì PCM render có thể cắt theo sample.

Explicit user timing/locks ưu tiên reference-derived suggestion; reference có
thể được tái áp dụng chủ động. Source reference, asset/hash/span/speaker/transcript,
alignment revision và các feature trích được phải di chuyển cùng project khi
project sở hữu dữ liệu. Reference không tồn tại báo missing, không chọn mẫu khác
âm thầm. Với training footage chỉ cần trích feature nếu đã có nguồn; không tự
chạy Training Run khi đổi timing reference.

#### Chọn vùng và overlay thống nhất

- Quét waveform, quét/chọn subtitle trên thanh Timeline hoặc chọn trên module
  Script đều tạo cùng selection theo asset/output revision và stable segment/
  word IDs. Timeline, waveform và Script highlight đồng bộ hai chiều.
- Mỗi vùng hiển thị **START — DURATION — END**. Duration nằm giữa hai mốc;
  lớp overlay nằm trong vùng waveform ngay dưới chỉ số thời gian Timeline,
  không đẩy xuống thành panel ngoài waveform. Giá trị dùng edited timeline
  hiện tại và cập nhật khi kéo, zoom hay ripple.
- Chọn nhiều vùng giữ tất cả highlight như nhau. Overlay của vùng đang thấy
  vẫn đọc được, không đè chữ/handle; tổng thời gian các vùng nếu có hiển thị
  riêng, không lấy min(start) tới max(end) làm duration của selection rời nhau.
- Waveform có thể chọn cả silence/chỗ không có subtitle; giữ time-range selection
  dù không có word tương ứng. Script/subtitle chỉ highlight phần thực sự mapped.
  Text chưa generate/alignment chưa có được gắn trạng thái planned/unverified,
  không tạo timestamp giả rồi coi là timing nguồn đã review.

#### Nhiều vùng và navigation markers

Khi có nhiều vùng chọn, cả Script lẫn Timeline không tự scroll để đuổi theo anchor,
selection update hoặc response async. Playback-follow cũng không được tự kéo
viewport đang xem multi-selection. Highlight ngoài viewport được báo bằng điểm/
vạch sáng trên scrollbar module Script và thanh navigator/scroll Timeline;
marker Timeline đặt theo time, marker Script theo vị trí nội dung (kể cả virtual
rows chưa mount). Zoom/filter/reorder/ripple làm cập nhật vị trí marker đúng.

Bấm marker là thao tác điều hướng chủ động: reveal vùng tương ứng trong module
được bấm, giữ toàn bộ selection, không tự đổi playhead hoặc phát audio. Marker
có hit target/keyboard access và nhãn thời gian; nhiều marker sát nhau phải có
cách chọn từng vùng, không để marker cuối che các vùng còn lại. Chọn một vùng
có thể dùng policy reveal hiện có, nhưng đổi từ nhiều sang một phải là hành động
rõ ràng của người dùng, không phải kết quả job mới về.

#### Ctrl và kéo handle để thêm hoặc rút thời lượng

Selection liên tục hiện hai handle đầu/cuối cho toàn khối câu/đoạn/clip đã chọn.
Người dùng giữ **Ctrl + left-button drag** để co/giãn duration. Cử chỉ này là
time-stretch toàn audio trong vùng, không phải trim bỏ âm đầu/cuối. Mọi selection
origin (waveform, subtitle, Script) đều đưa tới cùng handle/range contract.
Vùng chọn rời nhau giữ từng block; chỉnh block active trước, không tự kéo cả
khoảng trống và các câu chưa chọn. Cả clip/đoạn bao nhiều câu chỉ stretch theo
nhóm khi người dùng thật sự chọn parent/khối liên tục ấy.

Trong khi drag, waveform, audio nghe thử, subtitle/word preview, overlay và các
đoạn phía sau đều theo cùng time mapping. Audio dùng pitch-preserving time-stretch
preview thực (được kiểm tra chất lượng), không chỉ đổi độ rộng hình hoặc tốc độ
playhead. Nếu đang Play, preview audio cũng phải nhận mapping mới; render preview
async có revision để không phát buffer cũ ở vị trí mới. Đặt và đo ngân sách
phản hồi trước implementation, không tự nhận realtime từ cấu hình buffer.

Tăng duration của block thêm Δ làm các phần sau trong ripple group dịch +Δ;
giảm duration dịch ngược. Chỉ sửa vị trí của downstream content, không đổi lời,
gain, mood hoặc đánh dirty-generation mọi câu phía sau. Nội bộ khối được scale
qua mapping đơn điệu, cue/word anchors chuyển cùng audio. Rate/pause có thể theo
piecewise map khi có anchor khóa, không kéo vượt mốc 0, duration dương hay vùng
khóa của câu khác. Contract VM-RIPPLE-01 phải chốt pivot/anchor của cả handle đầu
và cuối, điểm áp dụng ripple và hành vi khi chạm lock trước khi viết interaction;
không lấy semantics trim một edge để thay cho yêu cầu co/giãn cả khối.

Thao tác đổi timeline mà có target tổng clip/cue khóa sẽ báo conflict và phân bổ
lại phần chưa khóa nếu policy cho phép; không tự tháo lock. Với video Dub, ripple
áp dụng dialogue group; video/background có liên kết chỉ đổi khi người dùng
chủ động chọn group ấy. Timeline nguồn để so sánh vẫn giữ nguyên. Chỉ đổi pause/
gap cần edit/assemble; không bắt TTS sinh lại câu có speech target không đổi.

Mỗi gesture là một edit transaction: Escape/cancel trả lại trạng thái trước,
pointer-up commit một bước Undo; Undo/Redo/reopen khôi phục time mapping, audio
preview, selection và downstream offsets. Source PCM không bị ghi đè. Thời gian
source, edited preview và regenerated audio giữ mapping/provenance riêng; cue
preview sau stretch không tự trở thành measured word timing của giọng đã sinh.

#### Fix Voice Generated theo các phần còn thay đổi

Sau khi sửa duration/timing, từ ngữ, âm điệu, mood hoặc emotion, người dùng bấm
**Fix Voice Generated** để chạy một batch các đơn vị còn cần generate. Đơn vị là
câu/đoạn có ID ổn định; nếu model cần context rộng hơn thì UI hiện vùng regenerate
thực trước khi chạy và không ghi đè các câu ngoài vùng Apply.

Mỗi đơn vị giữ desired revision/fingerprint, lần generate thành công, artifact
và measured timing. Fingerprint gồm text, model/base/adapter revision/hash,
reference/timing template, conditioning/mood/emotion/intonation, target duration,
speech-relative anchors và generation settings. Vị trí tuyệt đối chỉ dịch do
ripple thuộc composition mapping, không tự làm đổi fingerprint speech. Gain/
pause chỉ yêu cầu rerender nếu không đổi điều kiện phát giọng.

Batch chụp snapshot và chỉ enqueue dirty/pending/failed units cần xử lý; không
bật `force_regenerate` toàn Script. Hoàn tất một đơn vị chỉ khi WAV/timing/quality
đạt contract và fingerprint vẫn khớp intent hiện hành. Đơn vị matching đã sửa
được reuse nguyên audio/hash; sửa một câu lần nữa tạo dirty revision mới. Chạy
Fix khi không còn đơn vị cần làm là no-op có thông báo.

Nếu một đơn vị lỗi hoặc job bị Stop, các kết quả matching đã hoàn tất được giữ
để lượt sau chỉ làm phần còn lại. Nếu người dùng sửa tiếp khi job đang chạy,
response của snapshot cũ không được ghi đè edit mới hoặc đánh dấu câu đã fixed;
có thể giữ artifact cũ như candidate theo lineage. Compose output từ các unit
đã chọn revision, remeasure/verify timing trong target đã khóa, rồi cập nhật
waveform/subtitle/export cùng revision. Không sửa ngược target người dùng chỉ
vì output thực của model dài/ngắn hơn; unit không fit vẫn cần xử lý/review.

### Nhiều reference footage và gán đặc tính cho vùng chọn

Voice Manipulator có vùng **Reference** trong Library để import nhiều footage
trực tiếp hoặc lấy footage đã có trong project. Chúng dùng chung project asset
store/provenance; không nhân bản file chỉ để đặt role. Right-click một hay nhiều
footage/track có **Đánh dấu làm Reference / Bỏ đánh dấu Reference**, badge và bộ
lọc Reference. Với container đa track, binding trỏ audio track/span cụ thể đã
đọc được; không lấy nhầm mixed track. Source vẫn được giữ theo portability rule.

Reference role độc lập với tick training/STT, selected playback và model giọng.
Bỏ đánh dấu chỉ bỏ nguồn khỏi pool gợi ý mới, không xóa media hoặc các assignment
đã lưu. Binding giữ asset ID/hash/revision/span; xóa/mất source tạo trạng thái
missing cần xử lý, không tráo source âm thầm. Đánh dấu/chọn nhiều footage phản
hồi ngay; decode/alignment/feature extraction là job riêng có progress/cache.

Khi đã chọn vùng bằng waveform, subtitle hoặc Script, right-click có **Gán
reference footage…**. Cả ba điểm vào mở cùng editor bám selection snapshot.
Editor cho tick nhiều footage và nhiều đặc tính cho từng nguồn; nghe sample,
chọn span trong reference, chỉnh cường độ/priority và Apply hoặc Cancel. Có thể
gán cùng cấu hình cho nhiều vùng đang chọn, giữ riêng các range/assignment ID.
Menu trên một vùng đang chọn phải giữ cả selection hiện tại; click ngoài vùng
chọn cần hiển thị rõ selection đích mới trước khi Apply.

| Đặc tính muốn lấy | Ý nghĩa và cách kiểm tra |
| --- | --- |
| Timing | Duration, nhịp, khoảng nghỉ và speech anchors phù hợp; đi qua timing template/reference-text mapping. |
| Giọng điệu | Ngữ điệu lên/xuống, nhấn nhá, cách diễn/intonation; cần capability chuyển delivery mà giữ target identity. |
| Âm lượng | Mức loudness/envelope/độ biến thiên để cân render; không tự coi giảm gain là giọng thì thào hoặc tăng gain là hét. |
| Cảm xúc | Emotion/mood/intensity theo span, giữ nguồn của tag/feature và review state. |
| Hét to / thì thầm | Vocal delivery từ đoạn có cách phát giọng tương ứng, không chỉ mức âm thanh. |

Ví dụ một đoạn có thể dùng timing của footage A, emotion của B và envelope âm
lượng của C. Model/voice target vẫn lấy từ cast đã chọn. Lấy style từ người khác
không tự clone danh tính người đó; clone identity của Patch strategy 2 vẫn phải
qua lựa chọn cùng-speaker riêng. Mỗi đặc tính có source span/weight/strength hoặc
priority riêng; không trung bình embeddings/weights của các engine khác nhau.

Đoạn ngắn có thể tắt mọi random để áp dụng cấu hình đã resolve cho toàn vùng.
Reference có thể có biến thiên nội bộ: timing/pitch/loudness/emotion envelope
được trích theo span và map vào vùng đích khi đã có capability phù hợp. Tắt
random giữ mapping đã chọn, không bắt buộc làm phẳng toàn bộ envelope thành một
giá trị trung bình hoặc một nhãn duy nhất.
Nếu nhiều nguồn cùng mô tả một đặc tính, chế độ cố định cho chọn nguồn chính
và nguồn bổ sung; blend chỉ xuất hiện khi engine đã chứng minh khả năng blend.
Không hỗ trợ blend thì người dùng phải chọn priority hoặc chia span thay vì
âm thầm lấy file đầu. Whisper và shout cùng được tick là hai ứng viên/cách diễn;
chúng không bị chồng đồng thời lên cùng unit nếu không có capability đã kiểm
chứng cho tổ hợp ấy. User locks/explicit timing/tag ưu tiên hơn reference.

### Reference Detail ở cột phải

Thêm module tên **Reference Detail** vào cột phải của Voice Manipulator. Module
liệt kê các assignment của clip/output/Script đang mở, kể cả khi vùng đích không
còn được chọn. Apply gán reference thành công tạo hoặc cập nhật slot ngay; đọc
feature/alignment có thể vẫn đang chạy và được biểu thị bằng trạng thái đúng.
Hủy editor không tạo slot. Mỗi target span/assignment ID có một slot, nhiều
footage dùng chung vùng nằm trong cùng slot; các vùng rời nhau có slot riêng.

Mỗi slot khi thu gọn có đúng **hai dòng nội dung**:

1. **Dòng 1:** text chính xác của đoạn được gán, kể cả chỉ là phần giữa một câu.
2. **Dòng 2:** tên các reference footage đang dùng cho đoạn đó.

Nút xổ/thu gọn nằm trong header của slot, không tạo dòng thứ ba. Text/tên dài
được ellipsis và có cách xem đầy đủ; không wrap thành nhiều dòng khi thu gọn.
Vùng chỉ có time selection mà chưa có text hiển thị “Vùng audio chưa có text”
thay vì bịa transcript; các mốc thời gian nằm trong phần xổ chi tiết.

Khi xổ một slot, hiển thị riêng từng reference footage/track, span nguồn nếu
có, và đúng những đặc tính đã tick cho nguồn đó (timing, giọng điệu, âm lượng,
cảm xúc, hét, thì thầm), kèm strength/priority đã gán. Phần chi tiết cũng có
START/DURATION/END của vùng đích, hai trạng thái random thông số/random thời
điểm và trạng thái feature/schedule nếu áp dụng. Requested properties được
phân biệt với resolved/unsupported/missing; không biến một checkbox đã chọn
thành thông báo engine đã thực hiện thành công.

Slot bám stable target/assignment IDs và revision, không bám số thứ tự dòng.
Đổi text, reference, đặc tính, random schedule hoặc ripple cập nhật đúng slot;
xóa binding cuối cùng bỏ slot, reference missing vẫn có thông tin lỗi để sửa.
Split/join target có mapping assignment rõ, không nhân đôi cùng một binding.
Reopen giữ assignment và view hiện tại khôi phục từ dữ liệu project. Xổ/thu slot
không đổi playhead, không tự scroll hoặc clear multi-selection; module có scroll
nội bộ để danh sách dài không tràn cột phải.

Bấm phần nội dung một slot sẽ chọn lại đúng target và đưa cả Timeline lẫn
Script tới đoạn đó, cùng highlight đồng bộ. Đây là điều hướng do người dùng
chủ động nên vẫn thực hiện khi đang có nhiều vùng chọn. Nút xổ chỉ mở/đóng
chi tiết, không kích hoạt hành vi điều hướng của slot.

### Random giá trị và random thời điểm áp dụng

Đây là hai tick **độc lập**, mặc định tắt và có thể dùng cho bất kỳ độ dài nào.
Chọn đoạn dài không tự bật random; đoạn ngắn cũng có thể bật nếu người dùng muốn.

| Tùy chọn | Hành vi |
| --- | --- |
| Random thông số | Chọn source candidate/giá trị hoặc strength trong phạm vi của các đặc tính người dùng đã tick; thời điểm áp dụng giữ nguyên nếu tick còn lại tắt. |
| Random thời điểm áp dụng | Tạo vị trí/độ dài các vùng áp dụng trong selection, ưu tiên boundary câu/phrase; giá trị giữ cố định nếu random thông số tắt. |
| Bật cả hai | Sinh lịch gồm các vùng áp dụng và những đặc tính/nguồn/giá trị tương ứng, theo constraints đã đặt. |
| Tắt cả hai | Dùng cấu hình cố định đã resolve trên toàn vùng chọn; không tự biến thiên hoặc đổi source sau mỗi lần Fix. |

Random chỉ dùng source/property pool người dùng cho phép. Có thể giới hạn phạm
vi thời gian, min/max duration, tần suất, khoảng nghỉ và cường độ để tránh đổi
sắc thái giật cục giữa từ. Ranh giới câu/phrase ưu tiên; engine không hỗ trợ đổi
delivery trong một unit thì đề xuất split có mapping rõ trước khi generate.
Không đặt event ra ngoài selection hoặc vào khoảng hở giữa disjoint selections.

Không random danh tính target, nội dung text, ngôn ngữ hay phá locked timing.
Timing chỉ được random trong miền explicit user cho phép; tổng duration/anchors
đã khóa vẫn là constraints. Multi-property conflicts và schedule vô nghiệm phải
được báo và chỉnh, không tự bỏ bớt yêu cầu. Khi overlap events thì precedence/
blend policy hiển thị rõ và chỉ dùng tổ hợp engine hỗ trợ.

Trước inference có **Xem lịch áp dụng / Áp dụng / Random lại**. Lịch hiện thành
các span trên Timeline và danh sách câu/đoạn với footage nguồn, đặc tính, giá trị/
strength; cho chỉnh/khóa từng event và nghe preview khả dụng. Giữ source-time
mapping cùng edited-time anchors để ripple không làm nhảy lịch sang câu khác.
Nếu edit làm event vượt boundary hoặc quá ngắn, đưa vào review thay vì random lại.

Lưu seed cùng resolved event list, eligible source revisions và quyết định mẫu
theo stable unit/event ID. Seed scheduler và seed inference của engine là hai
thứ riêng; không hứa audio bit-identical giữa mọi thiết bị. Việc thêm/sửa một
câu không được làm lịch của các câu đã fixed thay đổi chỉ vì thứ tự random draw.
Fix/retry/reopen sử dụng snapshot đó, không bốc lại. **Random lại** là lệnh chủ
động, tạo revision mới trong phạm vi đã chọn; event user-lock vẫn giữ nguyên.

Schedule đã resolve là input của generation fingerprint. Chỉ những câu bị đổi
event/source/property/timing hoặc conditioning mới cần Fix; unit matching đã
hoàn tất giữ nguyên WAV/hash. Property âm lượng thuần gain/envelope chỉ rerender
khi không đổi cách phát giọng; shout/whisper/intonation/emotion đổi conditioning
thì generate lại. Unsupported hoặc chất lượng reference không đạt có trạng thái
rõ, không dùng thêm TTS tag để báo đã chuyển được đặc tính chưa kiểm chứng.

### Voice Patch có ba chiến lược

| Chiến lược | Identity và input | Cách dùng |
| --- | --- | --- |
| 1. Model train từ data sạch | Dataset sạch của đúng Speaker Profile → Training Run → model/checkpoint đã kiểm tra | Chọn model đã train để đọc text mới; nếu chưa có model thì tạo run riêng và giữ Patch ở trạng thái chờ, không ngầm train lại cho mỗi patch. |
| 2. Clone từ context | Các vùng trước/sau vùng hỏng, đúng cùng người nói, có audio/transcript thực | Thu reference sạch từ vùng xung quanh, review span, generate text mới theo giọng/ngữ điệu của context. Vùng hỏng chỉ được dùng nếu phần đó đạt QC. |
| 3. Model train + context | Model của phương án 1 và reference cùng người nói của phương án 2 | Model làm nền danh tính, context điều kiện hóa sắc thái/tốc độ/âm lượng; capability phải xác nhận phối hợp được, không trung bình hai checkpoint khác engine. |

Cả ba dùng chung source span, text mới, duration policy, mood/emotion/delivery,
gain, preview A/B, Apply và edit history. Reference phải ghi asset ID, span,
speaker, transcript và hash; tránh chọn tiếng người khác, overlap, nhạc lẫn hoặc
chính lời sai cần sửa. Khi context thiếu/sạch không đủ, báo cụ thể và cho chọn
mẫu khác hoặc đổi phương án; không âm thầm chuyển strategy.

Hybrid phải được so sánh với hai phương án riêng trên cùng text/source. Có
model nền và reference cùng lúc trong request là điều kiện kỹ thuật; đó chưa
là bằng chứng hybrid giữ identity/delivery tốt hơn. Stem nền/môi trường được
mix trở lại riêng nếu có artifact hợp lệ; dùng context để tái tạo speech rồi
khớp âm lượng, không coi noise là đặc tính cần học vào giọng.

### Voice Isolator theo định nghĩa ban đầu

`CONTEXT.md` định nghĩa Voice Isolation là tạo các voice stems từ mixed audio.
ADR0006 quy định dùng khi overlap, noise hoặc downstream cần stem. Module có
tên source `speaker-isolation` hiện hiển thị Speaker Diarization, nên cần giữ
ranh giới UI/domain rõ: diarization gán người nói/time; Isolator xuất audio thật.

Hai capability được nghiệm thu riêng: (A) tách dialogue khỏi nhạc/noise/background;
(B) tách giọng target hoặc từng người khi họ nói chồng nhau. Capability B có thể
cần đoạn reference đúng người nói và là vòng riêng; không suy từ A sang B.
Output dùng để chuẩn bị data sạch cho training, context/reference cho Patch,
và giữ background khi Dubber thay dialogue. Việc chỉ cắt các đoạn không overlap
theo diarization phải được gọi là trích span, không báo là đã tách overlap.

### Voice Dubber chạy tự động

Sau khi chọn clip, ngôn ngữ đích và chế độ, một job cha chạy chuỗi:
source → kiểm tra/tách cần thiết → STT/timing/diarization → hiểu ngữ cảnh toàn
clip → character cast/reference → emotion/mood/delivery → dịch có ngữ cảnh →
generate từng cue bằng voice của từng nhân vật → fit duration → mix → output/SRT.

Hiểu nội dung dùng toàn Script, quan hệ hội thoại, speaker turns, tên riêng,
thuật ngữ, xưng hô và bối cảnh. Visual context từ frame/subtitle là capability
tùy chọn nếu clip cần hình để disambiguate; không suy tên nhân vật từ giọng
một cách chắc chắn. Dịch theo đoạn/cảnh trước rồi mapping trở lại cue để bảo
toàn nghĩa, xưng hô và cách nói; constraints thời lượng không tự cho phép lược
mất nội dung quan trọng.

Mỗi nhân vật có một mapping identity cố định xuyên clip: dùng model đúng nhân
vật đã có hoặc reference sạch được thu từ source cho cross-language clone.
Không đổi qua model giọng stock chỉ vì source reference thiếu mà vẫn báo đã giữ
giọng. Cảm xúc người nói ở source và note/tag người dùng đều được lưu; người dùng
override/lock là ưu tiên. Cụm owner “cảm xúc của người note” được triển khai bao
gồm note/tag do người dùng gán và cảm xúc của người nói, chờ owner sửa nghĩa nếu
cần. Chưa có note thì phân tích source; confidence/unknown phải có review state.

Chế độ **Tự động** chạy tiếp các bước đủ điều kiện mà không bắt người dùng gán
từng cue. **Tự động có review** cho phép dừng ở cast/bản dịch/delivery; người dùng
chỉ sửa mục cần sửa. Reference/speaker/translation/style chưa đủ tin cậy được
đánh dấu needs-review với lý do; job không gắn nhãn đạt chất lượng khi bỏ qua
identity hoặc delivery. Output tentative có thể được nghe nhưng không tự thành
approved. Mỗi stage lưu checkpoint; sửa một cue/voice/note chỉ invalidates các
artifact phụ thuộc, không chạy lại toàn clip.

Tự động hóa generation và source emotion là hai gate khác nhau. Tag được nhập
thủ công có thể dùng trước khi recognizer emotion đạt benchmark, nhưng Dubber
auto emotion phải phụ thuộc VM-EMOTION-01/02 và capability TTS đã qua delivery
gate. Không coi recognition tốt là bằng chứng engine sinh được đúng cảm xúc.

### Khả năng hiện có và các bước còn thiếu

- Local OmniVoice `docs/generation-parameters.md` có `duration` cho một item
  hoặc list item, ưu tiên hơn speed; postprocess trimming có thể làm đầu ra ngắn.
  Product `VoiceGenerateRequest.duration` và single generator đã truyền duration.
- `VoiceScriptRow` hiện chỉ có ID/voice/text; Script worker chưa truyền duration
  từng câu, `trim_to_words` và pause assembly còn phải xét lại cho fixed duration.
- ControlRack có speed/gain; chip sắc thái chưa nối callback/conditioning.
  OmniVoice local có `whisper` trong voice-design instruct, nhưng worker product
  đang dùng clone prompt và không truyền instruct. Chưa chứng minh emotion,
  intensity hoặc shout theo câu với identity của model train.
- Worker đã có nhánh LoRA + reference. Patch cần selectable context, transcript/
  QC/provenance và acceptance cho hybrid; không cần đổi read-only upstream.
- Bổ sung MAN-04–MAN-21 trong `.planning/REQUIREMENTS.md` là yêu cầu mục tiêu,
  không phải thông báo các khả năng đã được triển khai.

## Quy tắc thiết kế và kiểm chứng

- Dùng đúng phân biệt trong `CONTEXT.md`: Speaker Profile là danh tính; Voice
  Model là artifact; Voice Model Set là aggregate đã qua gate publication.
  TTS clone/LoRA/full và RVC được lọc theo capability, không tráo checkpoint giữa
  engine hoặc coi mọi LoRA là tương thích.
- Tái sử dụng job, GPU lease, Stop, output store và word-timing hiện có. Chỉ thêm
  coordinator/port ở seam thực sự thiếu; không viết lại cả hệ thống trước khi
  có một luồng đầu cuối.
- Mỗi output mới phải có source asset/output và revision, span, model/hash,
  engine revision, settings, language, duration policy, trạng thái review và
  các đường dẫn tương đối với `project.json`.
- Giữ source; tạo derivative. Job chỉ complete khi artifact yêu cầu tồn tại,
  đọc được và có metadata nhất quán. UI chức năng chưa nối processor phải thể
  hiện trạng thái dự kiến/unavailable.
- Mỗi vòng có kiểm tra liên quan và artifact thật. Vòng thay đổi frontend chạy
  `npm test`, `npm run typecheck`, `npm run build` từ `apps/web`; vòng thay đổi
  backend chạy interpreter project với `-m pytest services/api/tests -q` từ root.
  Test mock không thay cho nghe, model inference hoặc đo thiết bị vật lý.
- Vòng xử lý audio kiểm tra rate/channel/format, duration, clipping, boundary,
  cue bounds, source hash và reopen/move. Engine/model/runtime nằm ngoài Git;
  `engines/OmniVoice` là upstream read-only. Main source và bản phân phối phải
  theo cùng contract trong `docs/PORTABILITY.md`.

## Thứ tự thực hiện

### 1. VM-GEN-01 — Nghiệm thu Voice Over bằng model thực

**Kết quả:** một project thử có Script ngắn, nhiều dòng và hai Speaker Profile;
voice từ Collection được dùng đúng artifact để tạo WAV.

**Nghiệm thu:**
- Clone và model train có sẵn được chọn, gửi đúng model/settings, tạo audio nghe
  được; loại chưa có artifact được ghi rõ chưa kiểm chứng.
- Sửa một dòng rồi generate lại chỉ tái sử dụng clip có fingerprint hợp lệ;
  Stop/retry giữ đầu ra đã hoàn tất và không xuất hiện output giả.
- Reopen và move/reconnect giữ được WAV, cast, segment, timing và lineage;
  nghe đối chiếu lời đọc và danh tính giọng.

**Phụ thuộc:** source HUB-COLLECTION-01 đã tích hợp, vẫn cần artifact thực cho
HUB-COLLECTION-UAT-01; thiếu trained model thật chuyển tới acceptance run của
Phase03, không tạo fixture giả train.
**Files/seams:** VoiceGenerator, VoiceScript, WorkspaceShell,
voice_script_speaker, generator adapters, FileVoiceOutputs.
**Xác minh:** tests liên quan + generate thực; voice/hash, PCM và output JSON.
**Requirements:** MAN-01, MAN-02, MAN-04–MAN-07, WF-01, WF-03, WF-05.

### 2. VOICE-EXPORT-13B4 — Khép nghiệm thu lưu và hủy export

**Kết quả:** tiếp tục parent VOICE-EXPORT-13B còn mở, dùng output VM-GEN-01.

**Nghiệm thu:**
- File WAV/SRT/CSV thực lưu ra vị trí người dùng chọn, identity đúng output;
  word/line cues parse được, trong duration và báo cue bỏ qua do timing trust.
- Hủy hộp thoại Save không tạo file đích hoặc báo đã lưu; kiểm tra riêng artifact
  subtitle nội bộ có thể đã được tạo trước thao tác Save.
- Đường đích có dấu/khoảng trắng, reopen và moved project đều được kiểm chứng.

**Phụ thuộc:** VM-GEN-01 và khả năng truy cập browser/native hợp lệ. Với các
output đã edit/stretch/Fix mới, acceptance export phải chạy lại sau VM-FIX-02.
**Files/seams:** VoiceOutputPanel, export/download seam, subtitle_exporter.
**Xác minh:** export thật, hash file đích, cancel không ghi file đích; nếu
tool bị policy chặn thì ghi gate còn mở, không đổi đường thực thi để né chặn.
**Requirements:** MAN-02, WF-01, WF-05.

### 3. VM-FLOW-01 — Nối output tới bước tiếp theo

**2026-10-16 round18:** implemented whole-row transfer, revision/hash/identity and
late-response guards; API11/UI59/build and real source/reopen pass. Processing
remains unavailable until VM-PATCH-01; no partial-word or human quality claim.

**Kết quả:** một đường cụ thể Voice Output → Voice Patch, dùng asset/output ID.

**Nghiệm thu:**
- Capability xác định thao tác khả dụng và điều kiện thiếu; Patch chưa chạy
  được thì UI nói rõ, kể cả khi đang có Take.
- Chuyển output/vùng chọn vào Patch giữ source identity và revision; đổi
  lựa chọn không để response cũ gắn kết quả vào source mới.
- Contract job/output dùng chung giữ progress, cancel, error/retry và validation
  artifact; không phải export rồi re-import để chuyển bước.

**Phụ thuộc:** VM-GEN-01; cơ chế session ownership của Phase04 cần hoàn tất
trước khi mở rộng live hoặc docking. **Seams:** workspace manifest/registry,
workflow ports và existing job/output stores. **Xác minh:** transition/late-response
tests, reopen, source ID/lineage. **Requirements:** MAN-03, WF-01–WF-04.

### 4. VM-PATCH-01 — Vá một dòng hoặc segment

**2026-10-16 round19:** source implemented with trained full/LoRA plus saved clean
reference, preview/Apply, natural ripple/Stop/reopen. API20/UI73/build and actual
full voice5.07s0clip/PCM/hash pass. Human listening/identity/browser and exact
word timing remain open; unsupported gain/timing/expressive requests block.

**Kết quả:** chọn segment của Voice Output hoặc source audio có Script/timing,
sửa lời đọc, dùng model train từ data sạch (phương án 1) để tạo replacement và
xuất một revision mới. Clone-only và hybrid có các vòng bổ sung riêng bên dưới.

**Nghiệm thu:**
- Preview A/B source/replacement; chỉ Apply mới tạo revision được chấp nhận,
  source và phiên bản trước còn nguyên.
- V1 dùng duration policy `ripple`: replacement được giữ độ dài thực; phần sau
  và cue offsets được dịch đồng bộ, không tuyên bố đã giữ timing cũ.
- Ghép không có click bất thường; error/cancel không apply; undo/redo/reopen
  trỏ đúng revision và artifact.

**Phụ thuộc:** VM-FLOW-01, VM-DURATION-01 và model train thực. **Seams:** VoicePatch, timeline selection,
generation adapter, patch job/composition. **Xác minh:** WAV thật, PCM vùng ngoài
patch (trừ boundary blend được khai báo), source hash và cue bounds.
**Requirements:** MAN-01–MAN-03, MAN-08, WF-01–WF-03, WF-05.

### 5. VM-PATCH-02 — Vá từ/vùng chọn và chính sách giữ thời gian

**Kết quả:** chọn từ hoặc span trên Timeline; sinh lại với context đủ nghe tự nhiên.

**Nghiệm thu:**
- Vùng thay xác định theo timing đã review; span/context hiển thị cho người dùng,
  không giả định TTS có thể sửa chính xác một từ độc lập.
- Cho chọn ripple hoặc giữ thời lượng; chế độ giữ thời lượng chỉ Apply sau khi
  fit/quality gate đã đạt, thiếu khả năng thì báo lỗi có hành động sửa.
- Nghe ranh giới, lời đọc, tốc độ và giọng; đo lại timing vùng thay, cập nhật
  SRT và lưu edit history bền vững.

**Phụ thuộc:** VM-PATCH-01, VM-PATCH-REF-01, VM-PATCH-HYBRID-01,
VM-SELECTION-01, VM-STRETCH-01, VM-FIX-02 và STT timing review. **Seams:** patch renderer,
time fitting, word alignment, Timeline. **Xác minh:** ngắn/dài hơn source,
đầu/cuối file, im lặng, cue bounds và blind A/B. **Requirements:** MAN-02, MAN-08, WF-01–WF-03.

### Checkpoint A — Voice Over và Patch dùng được

Chỉ chuyển sang processor mới khi một project thật tạo theo timing reference/
duration/câu và delivery → chọn đồng bộ → Ctrl-stretch/ripple nghe được → Fix
chỉ dirty units → vá bằng ba phương án → export → reopen/move thành công.
Export browser/save chưa đủ bằng chứng được giữ là gate
mở riêng; không gọi whole checkpoint complete.

### 6. VC-GATE-02 — Hoàn tất đánh giá chuyển giọng offline

**Kết quả:** tiếp tục 05-01 bằng corpus đông đủ thay cho smoke set cũ.

**Nghiệm thu:**
- Freeze hash ít nhất 40 utterance, hai nguồn/hai target và cặp khác giới;
  giữ các target chất lượng đã ghi trong 05-01, không hạ để lấy pass.
- Đo CER source/output, F0, similarity đã calibrate, GPU/CPU RTF và nghe A/B;
  vượt gate CER cross-speaker hiện đang fail phải có bằng chứng mới.
- Chỉ engine đạt mới đi vào product path; engine fail giữ report và lý do.

**Phụ thuộc:** artifact target thật, calibration/publication Phase03 và xác nhận
gate provisional của 05-01 trước khi đo acceptance. **Seams:** evaluation runner,
SpeakerEmbedder, RVC adapter. **Xác minh:** frozen report + WAV pairs + owner A/B.
**Requirements:** MAN-03, WF-01, WF-03.

### 7. VC-FILE-01 — Chuyển giọng từ file thành Take

**Kết quả:** source asset/span → model chuyển giọng → Take có lineage và preview.

**Nghiệm thu:**
- Chọn file/vùng, target tương thích, pitch/settings; job có progress/cancel/retry
  và publish audio project-owned đã kiểm tra.
- Chỉ kế thừa timing khi capability và duration thực chứng minh được; trường hợp
  còn lại đưa qua STT/alignment và review.
- Reopen/move giữ source/model/output; output chuyển sang Patch/export bằng ID.

**Phụ thuộc:** VC-GATE-02, VM-FLOW-01. **Seams:** VoiceConverter file port,
file conversion job/output, frontend selection. **Xác minh:** artifact thật,
duration drift, model/hash/lineage và cancel. **Requirements:** WF-01–WF-05, MAN-03.

### 8. VC-LIVE-02 — Khép đo độ trễ và ổn định thiết bị

**Kết quả:** đo live path đã có và nối đúng routing device.

**Nghiệm thu:**
- Loopback latency median/p95 đo vật lý; 05-01 đặt target ≤300 ms, hard limit
  500 ms và vẫn là provisional cho tới khi được xác nhận.
- Silence, underrun, đổi/mất thiết bị, Stop/app close được kiểm tra; không còn
  process giữ mic/GPU sau khi owner session kết thúc.
- Training lease contention được xử lý đúng; record input/output nghe được,
  kéo panel/đổi page không ngắt session đã sở hữu.

**Phụ thuộc:** VC-GATE-02, WorkspaceSession Phase04, thiết bị/virtual cable thực.
**Seams:** existing worker/VoiceInput/device preflight, session owner.
**Xác minh:** impulse loopback, sustained native run, recording và process evidence.
**Requirements:** MAN-03, WF-01, WF-03, WF-05.

### 9. VM-ISOLATE-01 — Chọn một bài toán tách và kiểm chứng engine

**Kết quả:** feasibility có input/output contract và một engine phù hợp bài toán.

**Nghiệm thu:**
- Định nghĩa gốc gồm voice stems từ mixed audio. Benchmark voice/background
  trước, rồi target-speaker overlap ở VM-ISOLATE-03; mỗi capability có gate riêng.
- Kiểm tra revision/license/runtime, chạy corpus nhỏ có nhạc/noise/overlap,
  nghe residual và bảo toàn lời đọc trước khi chọn adapter.
- Report đề xuất engine hoặc từ chối, mức VRAM/RTF và giới hạn source.

**Phụ thuộc:** Checkpoint A. **Seams:** research/evaluation outside engines.
**Xác minh:** stem WAV thật, source hash, duration, A/B.
**Requirements:** MAN-01, MAN-03, MAN-09, WF-01.

### 10. VM-ISOLATE-02 — Luồng Isolator đầu cuối

**Kết quả:** source vào mode Isolator, publish voice/background stems được nghe.

**Nghiệm thu:**
- Source audio được chọn/import hoặc nối từ output theo mode capabilities;
  job chỉ ready sau khi đủ các stems yêu cầu và metadata hợp lệ.
- Preview từng stem và mix lại; giữ duration/offset, source và settings lineage.
- Cancel/error/retry và move/reopen hoạt động; chuyển voice stem sang bước hợp lệ.

**Phụ thuộc:** VM-ISOLATE-01, VM-FLOW-01. **Seams:** separator adapter/job,
source-picker composition, stem UI/output store. **Xác minh:** thực media có nhạc,
STT trên stem và nghe chất lượng. **Requirements:** MAN-01–MAN-03, MAN-09, WF-01–WF-05.

### 11. VM-DUB-01 — Tạo speech từng cue từ Script dịch

**Kết quả:** footage/STT nguồn → Script ngôn ngữ đích → voice cast → audio từng cue.

**Nghiệm thu:**
- Nhận bản dịch từ VM-DUB-TRANSLATE-01 hoặc bản dịch người dùng; giữ Script/timing
  gốc và review state. Không bắt buộc người dùng dịch/gán từng cue trong auto mode.
- Mỗi cue/speaker chọn voice tương thích và language đã thử; job reuse/retry
  theo fingerprint, có review clip và yêu cầu độ dài.
- Lượt đầu chỉ một cặp Việt–Anh; Trung/Nhật/Hàn thêm sau acceptance engine thực.

**Phụ thuộc:** VM-DUB-ANALYZE-01, VM-DUB-TRANSLATE-01, VM-DELIVERY-01,
VM-LOUDNESS-01, STT timing và voice support đã kiểm tra.
**Seams:** target-script/cue store, VoiceGenerator, cue jobs. **Xác minh:** cue
audio + translated-script revision + nghe meaning/pronunciation/identity.
**Requirements:** MAN-01–MAN-03, MAN-05–MAN-07, MAN-10, WF-01–WF-03.

### 12. VM-DUB-02 — Fit timing và mix bản lồng tiếng

**Kết quả:** cue audio được chấp nhận → dub track/mix → WAV/SRT.

**Nghiệm thu:**
- Với video, mặc định giữ timeline nguồn: auto-fit/regenerate và dịch rút gọn
  có kiểm tra nghĩa trong giới hạn đã nghiệm thu. Clip không vừa cần review;
  ripple chỉ khi người dùng chủ động cho phép thay timeline.
- Giữ pause/offset và overlap có chủ ý; background reuse chỉ khi đã có stem
  hợp lệ; nghe mix không clipping, nhạc không che lời.
- Export WAV/SRT và review cùng video nếu source có video; lineage và move/reopen
  giữ được toàn bộ cue/mix artifacts.

**Phụ thuộc:** VM-DUB-01, VM-PATCH-02, VM-TIMING-REF-01, VM-FIX-02;
VM-ISOLATE-02 khi cần giữ background. Dùng timing của source Dub làm reference,
giữ bản đồ source/edited clock khi dialogue đã ripple.
**Seams:** duration fitter, mix compositor, export/review. **Xác minh:** sync đo
trên video/audio thực, boundaries và toàn bộ SRT.
**Requirements:** WF-01–WF-05, MAN-03, MAN-05, MAN-10.

### Checkpoint B — Processor mới tạo artifact thực

Isolator và Dubber chỉ bỏ `plannedModes` cho capability đã có evidence, gồm
VM-DUB-AUTO-01 đối với lời hứa chạy tự động. Không coi
quality gate Voice Changer là complete chỉ vì file/live jobs chạy được.

### 13. VM-EMOTION-01 — Benchmark nhận diện cảm xúc năm ngôn ngữ

**Kết quả:** xác định model/cách sử dụng đáng tin trước khi tích hợp tagging.

**Nghiệm thu:**
- Corpus tách nghe thử và held-out người thật có nhãn; Việt cần thay các mẫu TTS
  bằng bản thu có nhãn trước khi dùng làm accuracy ground truth.
- Đo confusion/macro-F1 theo từng ngôn ngữ, unknown/non-speech, silence/noise,
  thời gian cửa sổ/độ trễ; giữ nhãn và score thô có provenance.
- So sánh SpeechBrain baseline với candidate phù hợp đa ngôn ngữ; không dùng
  softmax bão hòa như xác suất đã calibrate hoặc tự động ghi đè tag đã review.

**Phụ thuộc:** corpus hợp lệ và người nghe; có thể nghiên cứu độc lập, GPU runs
phải tuần tự với generation/training. **Seams:** local benchmark only.
**Xác minh:** repeatable corpus/hash/report + listening judgments.
**Requirements:** STT-12, MAN-03, WF-01.

### 14. VM-EMOTION-02 — Gợi ý tag cảm xúc có review

**Kết quả:** phân tích một asset thành gợi ý theo span có thể chấp nhận/sửa/bỏ.

**Nghiệm thu:**
- Chỉ chạy language/capability qua benchmark; silence/out-of-domain có abstain,
  review không bị mất khi job mới về hoặc source thay revision.
- Người dùng xác nhận trước khi cập nhật Emotion Label; nhãn recognition và
  capability emotion của TTS/Model Set được mapping tường minh.
- Dubber auto có thể đọc proposal chưa xác nhận thành output tentative; giữ
  proposal/review state và không ghi đè tag người dùng đã lock.
- Chỉ generation engine đã hỗ trợ delivery ấy mới nhận điều khiển cảm xúc;
  không dùng recognition để hứa tạo được mọi sắc thái.

**Phụ thuộc:** VM-EMOTION-01; emotion-model publication Phase03 khi dùng Set.
**Seams:** emotion adapter/job, annotation UI/store, generator capability.
**Xác minh:** provenance/revision/conflict tests + real reviewed audio.
**Requirements:** STT-12, MAN-03, MAN-06, MAN-10, WF-01, WF-03.

## Các vòng bổ sung để đáp ứng yêu cầu mới

Các round ID cũ được giữ để không mất traceability. Thứ tự chạy thực tế nằm
trong checklist; các dependency dưới đây được chèn vào trước consumers tương ứng.

### VM-SCRIPT-01 — Clip, đoạn và câu có cấu hình kế thừa

**Kết quả:** Script lưu cấu trúc, speaker/voice và các override của câu.
**Nghiệm thu:**
- Tách/join câu giữ text, stable ID/provenance và tag người dùng; review cách chia
  ở Việt/Anh/Trung/Nhật/Hàn, không dựa duy nhất vào dấu chấm ASCII.
- Duration, mood/emotion/intensity, delivery, gain và note có precedence câu →
  đoạn → clip; lock/override rõ, câu không đổi được reuse đúng fingerprint.
- Reopen/move và legacy Script hoạt động; old row được migrate không mất dữ liệu.
**Phụ thuộc:** VM-GEN-01. **Seams:** VoiceScript, domain row schema/persistence,
cache identity. **Xác minh:** migration/split/join/override tests, real Script.
**Requirements:** MAN-04, MAN-06, MAN-07, WF-01, WF-03.

### VM-DURATION-01 — Generate theo thời lượng clip/đoạn/câu

**Kết quả:** duration planner phân bổ budget và worker thực thi target mỗi câu.
**Nghiệm thu:**
- Global target tính cả pauses; partial locks phân bổ phần còn lại, conflict
  bị chặn trước inference; UI có requested/actual duration per unit.
- Native duration được dùng khi engine hỗ trợ; xử lý trim/padding/gap rõ,
  đo WAV sau assemble và báo không-fit khi speech không đủ chất lượng.
- Test thực natural/shorter/longer target, locks, multi-speaker/pauses và text
  không thể vừa; lời đọc không bị cắt để đạt số giây.
**Phụ thuộc:** VM-SCRIPT-01, VM-TIMING-REF-01. **Seams:** duration planner, Script worker,
generator capability, timing/assemble. **Xác minh:** duration/PCM/cue bounds + A/B.
**Requirements:** MAN-05, WF-01, WF-03, WF-05.

### VM-DELIVERY-01 — Mood, emotion và whisper/shout theo câu

**Kết quả:** một đường conditioning đã kiểm chứng giữ voice identity và cách diễn.
**Nghiệm thu:**
- Map note/tag tới reference, compatible Model Set member hoặc engine control;
  ghi method/request thực. Tag thủ công chạy được trước automatic recognition.
- Whisper/nói nhỏ/bình thường/nói lớn/la và ít nhất hai cảm xúc được nghe trên
  cùng text/speaker; đánh giá fidelity/identity theo language, từ chối combo chưa
  đạt thay vì báo đã điều khiển được mọi model/ngôn ngữ.
- Strength/note override persist, đổi tag invalidates đúng cache; emotion và
  gain không bị trộn thành một tham số. Không ép dùng instruct voice-design
  nếu nó làm thay danh tính voice train/clone.
**Phụ thuộc:** VM-SCRIPT-01, VM-REF-RESOLVE-01, mẫu/model delivery hợp lệ. **Seams:** generator
capability/conditioning, Script overrides, reference/model resolver.
**Xác minh:** real same-speaker A/B, normalized audition level + provenance.
**Requirements:** MAN-06, MAN-07, MAN-03, WF-01.

### VM-LOUDNESS-01 — Gain/loudness render theo câu và clip

**Kết quả:** âm lượng mong muốn xuất đúng trong artifact và có headroom.
**Nghiệm thu:**
- Per-unit gain + global target áp dụng có thứ tự; preview/export cùng quyết
  định gain, playback-only mixer không tự ghi vào render settings.
- Đo peak/loudness trước/sau; clipping prevention ghi gain thực và thay đổi do
  limiter, không nén mất sắc thái thì thào/la chỉ để mọi câu bằng mức nhau.
- Silence/whisper/short clips/multi-speaker được xử lý ổn định; boundary và
  export PCM nghe được, metadata/cue timing nhất quán.
**Phụ thuộc:** VM-SCRIPT-01, VM-DELIVERY-01. **Seams:** audio renderer,
level meter, ControlRack/Script overrides, output store. **Xác minh:** WAV thật,
peak/loudness và nghe trong mix. **Requirements:** MAN-07, WF-01, WF-05.

### VM-PATCH-REF-01 — Clone từ vùng xung quanh của đúng speaker

**Kết quả:** phương án Patch 2, reference được chọn/cắt từ source trước/sau span.
**Nghiệm thu:**
- Diarization + QC loại wrong-speaker/overlap/noise/đoạn hỏng; người dùng thấy
  reference spans/transcript trước khi generate, thiếu context có lý do.
- TTS đọc text mới bằng contextual reference; duration/delivery/gain nhận từ
  vùng patch và override; không gộp lời reference vào lời replacement.
- Preview/Apply/cancel/history giữ source/hash/reference lineage và sửa vùng
  source audio thật, không chỉ patch một output TTS.
**Phụ thuộc:** VM-FLOW-01, VM-DURATION-01. **Seams:** reference harvesting,
source/script selector, clone adapter. **Xác minh:** real same-speaker/noisy/
overlap fixtures và A/B. **Requirements:** MAN-08, WF-01, WF-03.

### VM-PATCH-HYBRID-01 — Model train với context cùng speaker

**Kết quả:** phương án Patch 3 dùng model làm nền và reference làm điều kiện.
**Nghiệm thu:**
- Kiểm tra identity, engine/base/revision và modality compatibility; ghi
  cả checkpoint lẫn context hash, không silent fallback sang phương án khác.
- Cùng text/source, nghe model-only/clone-only/hybrid; report identity,
  delivery/context match, duration và quality, hybrid không mặc định tốt nhất.
- UI có ba phương án rõ; failed/unsupported input giữ artifact trước và cho
  chọn lại strategy/reference, Stop/retry không apply nhầm revision.
**Phụ thuộc:** VM-PATCH-01, VM-PATCH-REF-01, VM-DELIVERY-01.
**Seams:** existing adapter/reference payload, strategy resolver/Patch UI.
**Xác minh:** model/ref thật + A/B/C + unsupported/cancel/revision tests.
**Requirements:** MAN-08, MAN-03, WF-01, WF-03.

### VM-ISOLATE-03 — Tách giọng target hoặc nhiều speaker overlap

**Kết quả:** capability riêng cho voice stems khi người nói chồng nhau.
**Nghiệm thu:**
- Benchmark target extraction với reference đúng speaker, đối chứng speaker
  sai/reference thiếu và source overlap; báo giới hạn khi không tách được.
- Giữ track identity/offset, nghe leakage/artifact/words, so source và từng stem;
  không gọi diarization span cuts là speech separation.
- Khi đạt gate mới xuất stem project-owned để Patch/Dubber dùng; tổng stems/
  residual có ý nghĩa được ghi theo contract engine.
**Phụ thuộc:** VM-ISOLATE-01/02 và labeled overlap fixtures.
**Seams:** separator/target-speaker adapter, stem tracking.
**Xác minh:** original/isolated real pairs, diarization identity và A/B.
**Requirements:** MAN-09, MAN-03, WF-01, WF-05.

### VM-DUB-ANALYZE-01 — Tự hiểu clip và giữ cast nhân vật

**Kết quả:** source job tạo Script/context, cast, source references và delivery cues.
**Nghiệm thu:**
- STT/diarization/turns giữ source clock; recurring speaker cùng identity,
  ambiguity được lưu. Dùng source emotion proposals và notes/locks theo priority.
- Tổng hợp ngữ cảnh/cách xưng hô/thuật ngữ, tạo reference sạch đúng character;
  optional vision chỉ có khi module thực hỗ trợ; không tráo stock voice.
- Auto đi tiếp input đủ điều kiện; uncertainty có review state và bằng chứng,
  reopen lưu đúng artifact stage; extraction overlap yêu cầu capability riêng.
**Phụ thuộc:** VM-FLOW-01, speech/timing, VM-ISOLATE-02 khi source cần separation;
VM-ISOLATE-03 khi cần overlap extraction; VM-EMOTION-01/02 cho auto emotion.
**Seams:** existing STT/diarization, context-analysis port, cast/reference store.
**Xác minh:** clip multi-character + recurring turns + conflicting manual notes.
**Requirements:** MAN-06, MAN-09, MAN-10, WF-01–WF-03.

### VM-DUB-TRANSLATE-01 — Dịch tự động theo ngữ cảnh và cue budgets

**Kết quả:** dịch có ngữ cảnh toàn clip/cảnh và mapping source-target cue.
**Nghiệm thu:**
- Translation adapter tạo bản dịch, term/name/pronoun consistency theo cast;
  cho sửa/lock bản dịch, tự dịch là default của auto mode.
- Fit-aware rewrite có giới hạn vòng và kiểm tra không đổi nghĩa; lưu original
  translation và revisions, cue split/join mapping không mất source timings.
- Engine không sẵn sàng/language thiếu báo lỗi rõ; không nhầm ASR ngôn ngữ đích
  với dịch, không yêu cầu người dùng tự dịch để demo giả auto.
**Phụ thuộc:** VM-DUB-ANALYZE-01, VM-DURATION-01.
**Seams:** translation/context port, cue revision/budget store.
**Xác minh:** real multi-turn clip Việt–Anh đầu tiên, human meaning review,
name/pronoun consistency and impossible budgets. **Requirements:** MAN-05, MAN-10, WF-01–WF-03.

### VM-DUB-AUTO-01 — Job cha chạy cả clip và resume theo stage

**Kết quả:** chọn clip/ngôn ngữ → Start → dubbed audio/subtitles có cast/delivery.
**Nghiệm thu:**
- Auto chạy analyze/translate/voice/delivery/fit/mix/export cho clip đủ input;
  review mode dừng được ở checkpoints nhưng không bắt gán tay từng cue.
- Stop/restart/resume giữ completed stages; sửa một cue/reference/note chỉ
  invalidates dependency tương ứng, retries có giới hạn và lỗi có stage.
- Nghe/đo toàn clip với ít nhất hai character, emotion note override và cue
  khó fit; verify voice identity, nghĩa, emotion/delivery, sync, peak và source.
**Phụ thuộc:** VM-DUB-01/02, VM-DUB-ANALYZE-01/TRANSLATE-01,
VM-EMOTION-01/02 và per-language identity/delivery acceptance.
**Seams:** workflow parent/stage journal, Dubber controls, output/review/export.
**Xác minh:** real clip end-to-end và injected interruption; label tentative vs
approved rõ, move/reopen cùng artifacts. **Requirements:** MAN-10, WF-01–WF-05.

## Các vòng bổ sung cho timing và Fix Voice Generated

Bổ sung 2026-10-15. Đây là dependency của Voice Over/Patch/Dub. Giữ stable round
IDs; thứ tự đề xuất nằm trong `.scratch/voice-manipulator-next/tasks.md`.

### VM-TIMING-REF-01 — Timing template từ reference hoặc footage nguồn

**Kết quả:** chọn source timing và lập target plan có lineage cho một câu/đoạn.
**Nghiệm thu:**
- Ba nguồn (clip mẫu, verified training footage, current Dub/Patch source) đều
  có asset/hash/span/transcript/alignment revision; missing source không fallback
  âm thầm, đổi reference không đổi voice identity ngoài ý muốn.
- Extract duration/pauses/rhythm/usable anchors; cùng text dùng reviewed word
  mapping, text khác dùng cue/phrase envelope có trạng thái unknown khi chưa map.
- Explicit locks ưu tiên template; đo/hiện requested vs actual speech anchors,
  duration và offset errors, báo infeasible chứ không chỉ chỉnh speed.
**Phụ thuộc:** VM-SCRIPT-01, VM-REF-LIB-01, VM-REF-ASSIGN-01,
VM-REF-RESOLVE-01 và source/timing data thực. **Seams:** reference
resolver, timing-plan port/store, alignment metadata, generator capabilities.
**Xác minh:** same/different text, pauses, different language cue, missing source;
compare WAV/anchor errors. **Requirements:** MAN-05, MAN-11, WF-01, WF-03.

### VM-SELECTION-01 — Selection chung và overlay ba mốc thời gian

**Kết quả:** quét waveform/subtitle/Script highlight cùng vùng trên cả ba module.
**Nghiệm thu:**
- Selection gắn asset/output revision và stable IDs; chọn time-only silence
  không mất vùng chọn; multi-ranges không chọn thêm khoảng hở không yêu cầu.
- Mỗi vùng trong waveform có START — DURATION — END dưới timeline time readout;
  text/snap/zoom không làm sai seconds, overlay không che handles hoặc chọn vùng.
- Single và multi-selection hoạt động ở output dài/zoom xa/virtual Script;
  highlights giống nhau và không tự auto-scroll khi có nhiều vùng.
**Phụ thuộc:** VM-SCRIPT-01. **Seams:** shared word/time selection,
Timeline/VoiceScript/WorkspaceSession, overlay styles. **Xác minh:** 3-way browser
selection + zoom/asset switch/late response tests. **Requirements:** MAN-12, MAN-13.

### VM-NAV-01 — Marker highlight trên scrollbar và Timeline navigator

**Kết quả:** mọi vùng chọn có thể tìm lại bằng marker mà không bị tự kéo viewport.
**Nghiệm thu:**
- Markers đúng vị trí nội dung/thời gian, gồm virtual/offscreen selections;
  chọn nhiều vùng không auto-scroll kể cả playback/async selection effects.
- Bấm/keyboard marker reveal đúng vùng trong module, giữ selection và playback
  intent; overlapping markers vẫn cho truy cập từng vùng.
- Marker cập nhật qua resize/zoom/reorder/filter/ripple, không mắc stale index
  hoặc gây render toàn bộ Script dài.
**Phụ thuộc:** VM-SELECTION-01. **Seams:** Script scrollbar decoration,
timeline-navigator, playback-follow guard. **Xác minh:** native browser scroll
positions và markers trước/sau zoom/edit. **Requirements:** MAN-12, MAN-13.

### VM-RIPPLE-01 — Contract kéo handle và edit time mapping

**Kết quả:** edit transaction từ Ctrl-drag tạo mapping/reflow rõ cho một block.
**Nghiệm thu:**
- Chốt và kiểm thử cả left/right pivot, Ctrl + left-drag, anchor/lock/zero bounds
  và downstream +Δ/−Δ; scale whole block, giữ nguồn và không trim mất speech.
- Parent clip/segment và sentence selection dùng cùng rule; disjoint selection
  chỉ xử lý active block, cue/word preview theo map và downstream không dirty TTS.
- Cancel/pointer-up/Undo/Redo/reopen có một transaction; total-duration/video/
  background link conflicts có hành vi tường minh. Chưa bật public stretch chỉ
  dựa trên hình waveform khi VM-STRETCH-01 chưa đạt.
**Phụ thuộc:** VM-SELECTION-01, VM-DURATION-01. **Seams:** timeline-editing
commands, group/lock policy, source-to-edited map/store, interaction contract.
**Xác minh:** coordinate-to-time checks + undo/mapping/lock tests; không dùng
visual-only prototype làm audio acceptance. **Requirements:** MAN-14, MAN-16.

### VM-STRETCH-01 — Waveform và audio time-stretch preview trong lúc drag

**Kết quả:** thao tác Ctrl-handle có preview audio thực cùng edited mapping.
**Nghiệm thu:**
- Pitch-preserving stretch ở duration mới; khi Play audio/waveform/subtitle/
  overlay và downstream nghe/nhìn đồng bộ trong suốt drag, không chỉ đổi playback
  clock. Đo phản hồi và quality theo ngân sách chốt trước khi đo.
- Rapid drag/seek/Stop/late render dùng revision phù hợp, không phát buffer cũ,
  clipping hoặc click bất thường; giới hạn không-fit có thông báo/hành vi rõ.
- Commit/undo/reopen dựng lại đúng preview từ nguồn bất biến; output ghi rõ
  preview stretched chưa phải regenerated speech hoặc reviewed word alignment.
**Phụ thuộc:** VM-RIPPLE-01. **Seams:** preview-mixer/audio-scrubbing,
audio time-stretch adapter, waveform renderer/cache, subtitle mapper.
**Xác minh:** nghe và đo audio buffer/output duration thật; short/long/multi-
speaker regions và interaction under playback. **Requirements:** MAN-14, MAN-16, WF-05.

### VM-FIX-01 — Batch generate chỉ đơn vị còn thay đổi

**Kết quả:** nút Fix Voice Generated tạo queue theo desired/completed revision.
**Nghiệm thu:**
- Sửa duration/text/intonation/mood/emotion làm dirty đúng unit; unit đã fixed
  matching, downstream chỉ offset hoặc pause/gain chỉ-render không bị generate
  lại. Chạy lần hai không edit thêm là no-op.
- Batch snapshot và per-unit checkpoints giữ success matching khi Stop/fail;
  lượt sau chỉ làm phần chưa xong. Hiện n/total thực và lỗi từng unit.
- Sửa tiếp/Undo khi inference chạy không bị stale reply ghi đè/mark clean;
  model/ref/template hash/settings đổi invalidation đúng, không force all.
**Phụ thuộc:** VM-STRETCH-01, VM-DURATION-01, VM-DELIVERY-01;
VM-REF-RANDOM-01 trước acceptance Fix với randomized reference schedules.
**Seams:** voice_script_speaker cache/job journal, desired/completed unit store,
Fix controls/Activity. **Xác minh:** engine invocation counts + artifact hashes,
partial failure/Stop/edit-during-job cases. **Requirements:** MAN-15, MAN-16, WF-01, WF-03.

### VM-FIX-02 — Apply kết quả Fix vào đúng edited timeline

**Kết quả:** replacement đã kiểm chứng thay preview trong một output revision.
**Nghiệm thu:**
- WAV đạt target duration/usable speech anchors; no-fit vẫn pending/review,
  không thay target người dùng để khớp audio thực hoặc cắt mất lời.
- Thành công thay đúng unit, giữ audio hash của matching fixed units; rebuild
  composition offsets, waveform/cues/export theo cùng time map và revision.
- Nghe A/B preview/regenerated, undo/redo/reopen/move giữ artifacts và trạng thái;
  cả ba Patch strategies và Dub source dùng cùng Fix/revision contract.
**Phụ thuộc:** VM-FIX-01, VM-LOUDNESS-01. **Seams:** composition/output store,
artifact validator, timing reconciliation/exports, preview replacement.
**Xác minh:** batch thật nhiều unit, repeat no-op, boundary/PCM/cues/source
hashes và export saved artifact. **Requirements:** MAN-11, MAN-15, MAN-16, WF-01–WF-05.

## Các vòng bổ sung cho thư viện nhiều reference

### VM-REF-LIB-01 — Import và đánh dấu Reference footage

**Kết quả:** vùng Reference trong Library của Voice Manipulator dùng assets project.
**Nghiệm thu:**
- Import nhiều footage hoặc lấy asset/track đã có; right-click mark/unmark một
  hoặc nhiều item, badge/filter cập nhật ngay, không decode media đồng bộ khi chọn.
- Role reference không đổi training/STT/voice identity; bỏ role không xóa file
  hoặc binding đã gán; mixed container yêu cầu track/span rõ.
- Reopen/move giữ role/provenance, missing/deleted source có trạng thái cụ thể;
  feature extraction có job/cache và không nhân bản source cho mỗi role.
**Phụ thuộc:** VM-GEN-01, project media import hiện có. **Seams:** Library/MediaPool
menus, asset role metadata/routes, Reference view. **Xác minh:** real multi-file
import/mark/unmark/move và selection performance. **Requirements:** MAN-17, WF-01, WF-04.

### VM-REF-ASSIGN-01 — Gán nhiều footage và đặc tính qua context menu

**Kết quả:** một editor nhận selection từ waveform/subtitle/Script.
**Nghiệm thu:**
- Ba menu giữ selection snapshot và mở Gán reference footage; tick nhiều sources,
  per-source spans và timing/intonation/volume/emotion/shout/whisper properties.
- Apply/Cancel và multi-range assignment giữ stable range IDs; user thấy source,
  priority/strength, preview và effective inherited overrides trước khi áp dụng.
- Chọn ngoài/trong vùng, async asset change, keyboard menu và reopen giữ scope
  đúng; không lẫn reference role với training selection hoặc clone target.
**Phụ thuộc:** VM-REF-LIB-01, VM-SELECTION-01. **Seams:** shared context menu,
selection binding editor/store, asset picker/preview. **Xác minh:** 3-origin browser
flows, Cancel/late-response/multi-selection tests. **Requirements:** MAN-12, MAN-17, MAN-18.

### VM-REF-DETAIL-01 — Slot Reference Detail trong cột phải

**Kết quả:** gán reference xong có slot hai dòng và chi tiết per-source đọc được.
**Nghiệm thu:**
- Module đúng tên ở cột phải; mỗi target span một slot, dòng 1 target text,
  dòng 2 reference footage names. Multi-source không sinh slot trùng; text dài
  vẫn đúng hai dòng khi thu gọn, time-only selection có nhãn trung thực.
- Xổ từng slot thấy source track/span, các property đã tick, strength/priority,
  target timing, random states và pending/missing/unsupported theo dữ liệu thực;
  keyboard toggle và danh sách dài không tràn module.
- Apply/Cancel, sửa text/binding, ripple, split/join, xóa binding và reopen cập
  nhật đúng revision; expand/collapse không clear selection, tự scroll hoặc seek.
- Bấm nội dung slot điều hướng cả Timeline và Script tới target, highlight đồng
  bộ; nút xổ và thao tác bên trong chi tiết không kích hoạt điều hướng.
**Phụ thuộc:** VM-REF-ASSIGN-01. **Seams:** ReferenceDetail module/manifest/registry,
assignment selectors và slot styles. **Xác minh:** component/browser two-line
geometry, expanded mapping, multi-range/cancel/stale-update/reopen tests.
**Requirements:** MAN-21, MAN-18, MAN-12, MAN-13.

### VM-REF-RESOLVE-01 — Resolve đặc tính và nguồn reference tương thích

**Kết quả:** assignment trở thành cấu hình đặc tính có lineage và capability thực.
**Nghiệm thu:**
- Extract/cache feature theo source hash/span/revision; chọn A cho timing, B cho
  emotion, C cho loudness vẫn giữ identity model target và explicit user locks.
- Nhiều source cùng property có primary/priority hoặc blend đã qua gate; shout/
  whisper hay constraints mâu thuẫn cần resolve, không lấy file đầu hoặc trộn bừa.
- Nonrandom áp dụng cấu hình cố định toàn selection, text khác reference dùng
  mapping phù hợp; unsupported features báo lý do, chỉ invalidate units bị ảnh hưởng.
**Phụ thuộc:** VM-REF-ASSIGN-01. **Seams:** property resolver, feature extraction
jobs/capability descriptors, reference provenance. **Xác minh:** deterministic
property-resolution tests + real same-target-voice A/B. **Requirements:** MAN-18, MAN-20, MAN-03, WF-01.

### VM-REF-RANDOM-01 — Lịch random giá trị và thời điểm có thể lưu/replay

**Kết quả:** hai tick độc lập sinh event schedule có preview và lệnh Random lại.
**Nghiệm thu:**
- Test đủ bốn tổ hợp tick: off/off cố định, value-only, time-only và cả hai;
  dùng pool/ranges cho phép, boundaries/min-span/locks/conflicts được tôn trọng.
- Preview/edit/lock lịch trên Timeline trước Apply; seed và resolved events được
  lưu theo stable IDs. Reopen/retry/Fix không đổi lịch; reroll tạo revision phạm vi
  đã chọn, thêm một câu không làm lịch của câu fixed khác đổi theo thứ tự draw.
- Render/generate theo capability đã kiểm chứng; Fix reuse matching WAVs, chỉ
  rerender cho gain-only. Source thiếu, event invalid sau ripple hoặc lịch vô
  nghiệm báo trạng thái cụ thể, không tự random lại hay phá timing/danh tính.
**Phụ thuộc:** VM-REF-RESOLVE-01, VM-DURATION-01, VM-DELIVERY-01.
**Seams:** schedule planner/store, Timeline events UI, generation fingerprint/Fix.
**Xác minh:** stable schedule snapshots, partial edit/retry/reroll and real output
quality/identity/timing checks. **Requirements:** MAN-19, MAN-20, MAN-15, WF-01, WF-03.

## Các hướng mở rộng sau các checkpoint

| Hướng | Vòng feasibility cần có trước khi lập kế hoạch triển khai |
| --- | --- |
| Mobile/offline TTS | Chốt Android/iOS và thiết bị mục tiêu; kiểm tra engine/model export, operator/quantization, RAM/storage/RTF, pin/nhiệt; LoRA chỉ chạy trên base đúng family/revision. Một model nhẹ đạt gate trước khi hỗ trợ thư viện nhiều model. |
| Custom voice cho Convai/dịch vụ ngoài | Xác minh API/plan/BYOTTS chính thức ở thời điểm làm, contract streaming/audio, latency/auth; local adapter phục vụ voice đã kiểm chứng. Chưa coi dịch vụ có thể nhận arbitrary model/LoRA upload. |
| Digital Human / LipSync | Tiếp nối Phase06: audio đã review, adapter animation/lipsync, ánh xạ blendshape và QC. Cảm xúc audio là một tín hiệu cần kiểm chứng; thêm runtime/rig/video artifacts và gate frame/audio sync riêng. |

Đây là định hướng nghiên cứu từ cuộc trao đổi, chưa tự động đăng ký thành các
vòng product phải triển khai ngay. Khi chọn một hướng, kiểm tra tài liệu/license
hiện hành và lập spec theo thiết bị/dịch vụ thực tế.

## Vòng chính xác đề xuất tiếp theo

**VM-GEN-01**: dùng source HUB-COLLECTION-01 đã tích hợp và một project thử với
voice Collection thực để khép generate/reuse/Stop/reopen.
Thiếu trained model thì ghi dependency artifact Phase03, không báo pass bằng
mock. Tiếp theo VM-SCRIPT-01/VM-REF-LIB-01 → VM-SELECTION-01 →
VM-REF-ASSIGN-01 → VM-REF-DETAIL-01/VM-REF-RESOLVE-01 → VM-TIMING-REF-01 →
VM-NAV-01/VM-DURATION-01 → VM-RIPPLE-01 → VM-STRETCH-01, cùng các dependency
VM-DELIVERY-01/VM-LOUDNESS-01 → VM-REF-RANDOM-01 → VM-FIX-01 → VM-FIX-02;
VOICE-EXPORT-13B4 kiểm tra artifact render thực. Các nhánh không cần GPU có thể
được triển khai độc lập nhưng shared code/runtime phải phối hợp. Voice Patch triển
khai lần lượt model-only/context-only/hybrid rồi khép timing/boundary.
Dubber auto là mục tiêu chính thức MAN-10 và có ba vòng analyze/translate/job
cha bổ sung; emotion analysis phải đạt trước khi khép auto emotion acceptance.

Các gate D-drive/OBS, SOURCE-EXTERNAL-ASSETS-01 và STT-TIMING-ACCURACY-01 trong
queue chung vẫn giữ dependency của chúng; kế hoạch page này không tự đổi ưu tiên
của các công việc đang chạy và không nhận bằng chứng test cũ thành test mới.
