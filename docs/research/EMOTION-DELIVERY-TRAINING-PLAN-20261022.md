# Train giọng theo cảm xúc và cách phát âm — nghiên cứu và kế hoạch

## Cập nhật thực thi theo yêu cầu owner — 2026-10-22

### Đợt tiếp theo: rounds92–96

Owner yêu cầu làm tiếp năm round sau91 trong cùng invocation. Phạm vi này thay
giới hạn một round/lần cho đợt tiếp tục; các gate acoustic không bị hạ xuống.

| Round | Lát triển khai | Acceptance |
|---|---|---|
| 92 / ED-RUNTIME-01 | Provisioner private embedded Python và dependencies riêng cho F5/ViVoice, Index, Fish | Pin nguồn/dependencies, paths tương đối, failure không nhận ready, probe import thật, không sửa upstream/global Python |
| 93 / ED-F5-REAL-01 | Tải và xác minh F5/ViVoice/Vocos; chạy worker trên reference kỹ thuật rõ nguồn | WAV thật đọc lại được, hash/config/log/metrics, offline, lease/cleanup; lỗi tương thích được sửa tại adapter sản phẩm |
| 94 / ED-INDEX-REAL-01 | Model chính/phụ Index2.5; inference và emotion modes thật | Đúng language/native controls, WAV thật và provenance; không tự nhận VI hoặc acoustic identity/emotion đã nghiệm thu |
| 95 / ED-FISH-REAL-01 | S2/codec/runtime; inference instruction/tags thật | Không dùng Drama/S1 trainer, WAV thật và metrics; model thiếu/quá tài nguyên báo thất bại rõ |
| 96 / ED-VARIANT-PREP-01 | Chuẩn bị training nhiều trạng thái dựa trên dữ liệu/lineage thật | Tách emotion, vocal effort và gain; kế hoạch các variant độc lập từ cùng base/anchor; thiếu coverage phải chặn, không xuất bản adapter giả |

Thử kỹ thuật dùng nguồn reference công khai của engine hoặc fixture được ghi rõ;
không tự lấy footage owner làm training corpus. Smoke inference chứng minh đường
model→artifact, không thay benchmark72 câu hay blind listening của owner. Không
tự mở trainer chưa tương thích chỉ để đủ danh sách engine có thể train.

### Kết quả kỹ thuật rounds92–96 — cập nhật 2026-10-23

- Ba runtime private đã cài và import thật: F5/ViVoice dùng chung một profile,
  Index và Fish có profile riêng. Receipts xác minh pin nguồn, requirements,
  inventory thực tế và probe; Python user-site bị loại khỏi các profile mới.
- F5 EN sinh3,605s; ViVoice VI sinh2,475s; Index vector buồn sinh4,191s và text
  `Speak happily.` sinh3,193s; Fish EN `[whispering]` sinh3,065s. Đây là WAV thật
  qua worker sản phẩm, không phải kết quả training hoặc nghiệm thu acoustic.
- Index xác nhận cả hai đường điều khiển cảm xúc trong log nhưng cả hai mẫu
  có chạm đỉnh. Giữ nguyên WAV/metrics; cần nghe chấm và điều tra chất lượng.
- Preview nhiều variant đã có API read-only: emotion và vocal effort được gán
  riêng, cùng neutral anchor/config, kiểm tra train/dev leakage. Luôn
  `executable=false`; base fingerprint do caller khai chưa được xác minh.
- Review WAV thật phát hiện direct Voice Output cần chuyển bản editable sang
  mono PCM16/24kHz, giữ bản native/provenance. Đã sửa theo ADR0138; cả năm mẫu
  thật đi qua editor/render HTTP200, giữ nguyên hash nguồn. Có regression cho
  WAV thiếu dữ liệu/sai header và dọn toàn bộ kết quả khi lỗi hoặc hủy.
- Đã kết thúc phạm vi triển khai92–96. Frontend1230 test, typecheck/build và
  API liên quan175 test pass. Full API vẫn có lỗi timeout import VibeVoice đã
  ghi nhận. Catalog làm mới xác nhận F5/ViVoice/Index available; Fish vẫn có
  timeout import45s trên HDD dù đã sinh được WAV thật. Chưa nghiệm thu độ ổn
  định cold start; không tăng timeout để đổi trạng thái thành ready.

Gate chi tiết: [rounds92–96](../gates/expressive-engines92-96-20261022.md).
Phần kết nối rounds87–91 bên dưới giữ nguyên bối cảnh lịch sử tại thời điểm91.
Các việc tiếp theo sau96: xử lý cold-readiness, benchmark72 câu và nghe chấm identity/emotion/effort,
thử Fish tiếng Việt; lưu reviewed effort labels và xác minh base lineage;
sau đó scheduler OmniVoice nhiều LoRA và trainer/exporter riêng có nghiệm thu
thực tế. Preview hiện chưa tạo Training Run, chưa có UI và chưa publish Model Set.

Owner đã chọn OmniVoice, EasyVoice/F5-TTS/ViVoice, IndexTTS-2.5 và Fish S2 Pro,
yêu cầu clone/kết nối và chạy **5 round đầu trong cùng invocation**. Yêu cầu này
thay giới hạn một round/lần riêng cho đợt này. Thứ tự tích hợp dưới đây thay
thứ tự ED-01…05 ở mục 9; bộ benchmark acoustic ở mục 9 vẫn cần thực hiện sau.

| Round | Lát tích hợp | Acceptance |
|---|---|---|
| 87 / ED-CONNECT-01 | Clone bốn repo EasyVoice, F5-TTS, IndexTTS, FishSpeech vào runtime ignored, ghim SHA và receipt | Origin/SHA đúng, không sửa checkout sẵn có sai pin, không tải LFS/model ngầm |
| 88 / ED-CATALOG-01 | Catalog đầy đủ train/reference/generate và UI thông số theo descriptor | Xem được cả lựa chọn chưa cài; giữ giá trị riêng khi đổi engine; không cho chạy option unavailable |
| 89 / ED-F5-01 | Product-owned F5/ViVoice worker/adapter và readiness | Config model/vocab/vocoder riêng, reference transcript bắt buộc, runtime/model thiếu báo đúng, request không lẫn thông số engine khác |
| 90 / ED-INDEX-01 | IndexTTS2.5 worker/adapter, language/emotion vector/settings | Speaker/emotion độc lập, đúng 5 ngôn ngữ, không hứa absolute duration hay VI; reject control không hỗ trợ |
| 91 / ED-FISH-01 | Fish S2 Pro worker/adapter, tags/sampling/codec và kiểm tra tích hợp | Pin S2 model, không dùng trainer S1-mini cho S2, shutdown/lease/offline/artifact guards đi qua seam hiện có |

Đây là 5 vòng nền tảng kết nối. Model inference chỉ available khi runtime và model
đúng đã provision/kiểm tra; deep trainer mới chưa được bật chỉ vì repo đã clone.
Giữ OmniVoice LoRA/full trainer hiện có. Scheduler nhiều LoRA theo trạng thái,
F5 deep trainer, Index/Fish training recipe được xác minh, acoustic benchmark và
publication nhiều variant là các vòng tiếp theo, có acceptance riêng. Không tự
tải nhiều GB weights hoặc bắt đầu Training Run trên dữ liệu owner trong vòng
clone/catalog. Tính năng clone/reference không được trình bày như fine-tune.

### Trạng thái sau năm round kết nối

Các repo đã clone và ghim revision ở `.runtime/engines/research`: EasyVoice,
F5-TTS, IndexTTS, FishSpeech. EasyVoice là nguồn tham khảo workflow; app gọi F5
qua adapter riêng, không chạy thêm một app EasyVoice. Danh sách mới gồm hai
engine ID F5-TTS và ViVoice riêng, IndexTTS2.5 và Fish S2 Pro, bên cạnh OmniVoice.
Mỗi engine có lựa chọn reference, generator và deep-training riêng. Lựa chọn
deep-training mới chỉ cho xem và giải thích vì sao chưa chạy được.

| Engine | Kết nối đã có | Phần còn thiếu để chạy model thật |
|---|---|---|
| OmniVoice | LoRA/full trainer và generator hiện có | Scheduler nhiều trạng thái, dataset/acceptance theo emotion và vocal effort |
| F5-TTS / ViVoice | Reference publication, worker, config/vocab và control riêng | Private Python `f5-tts`, checkpoint tương ứng và Vocos; trainer/exporter và benchmark |
| IndexTTS2.5 | Reference, worker, 8 emotion weights/text, relative duration | Private Python `index-tts`, weights cùng ba model phụ; benchmark và trainer xác thực |
| Fish S2 Pro | Reference, worker, inline instruction, sampling, codec S2 | Private Python `fish-speech`, weights S2/codec; benchmark và trainer tương thích S2 |

Model weights chưa được tải trong năm round này. Provisioner hỗ trợ tải có chọn
lọc bằng `.venv/Scripts/python.exe scripts/provision-open-engines.py --model ID`.
ID cần cho từng engine:

- F5: `f5-tts` và `vocos`; ViVoice: `vivoice` và `vocos`.
- Index: `indextts25`, `indextts25-w2v-bert`, `indextts25-campplus`, `indextts25-bigvgan`.
- Fish: `fish-s2-pro`.

Private Python nằm dưới `.runtime/python/<tên-runtime>/`; bước cài môi trường
và đo inference thật là round tiếp theo, chưa có installer private-runtime mới
đã nghiệm thu. App kiểm tra source pin, receipt/files, import; worker hash lại
weights trước khi load. Thiếu thành phần nào thì hiển thị lý do và chặn Generate.
Không dùng việc clone repo hoặc test với fake model làm bằng chứng giọng thật.

Ưu tiên tiếp theo: provision một engine (Fish cho thử VI, F5/ViVoice làm baseline),
chạy bộ câu/reference cố định và nghe chấm identity/emotion/effort; sau đó mới
bật trainer mới hoặc scheduler OmniVoice nhiều LoRA. Giữ các gate dữ liệu,
artifact và acoustic ở mục 9 cho từng lát triển khai.

Ngày kiểm tra nghiên cứu: **2026-10-22**. Phạm vi phần nghiên cứu gốc: nguồn chính thức và code hiện
tại; chưa cài engine, tải weights, thu âm, train hay chạy inference. Đây là đề
xuất triển khai tiếp nối Phase03, không phải thông báo hoàn tất tính năng hay
tăng tiến độ Round86/Phase03. Mốc code sản phẩm: `ca0a8255d7ea4192352d369642dbef77d9bc3359`.

## 1. Kết luận để chọn hướng

1. **OmniVoice hiện tại và upstream mới nhất chưa cung cấp bộ điều khiển cảm
   xúc + cách phát giọng to/nhỏ độc lập, đã chứng minh cho cùng một giọng clone.**
   Có fine-tune, conditioning `instruct` và voice-design `whisper`, nhưng không
   thể suy ra `angry`, `sad`, `shouting` đã dùng được. Xem
   [kiểm tra OmniVoice](OMNIVOICE-EMOTION-AUDIT-20261022.md).
2. **Có phương án sẵn đáng thử.** Trong nhóm đã nghiên cứu: CosyVoice3 hỗ trợ
   emotion/volume instructions cùng reference audio, OpenVoice có demo style
   whisper/shout, EasyVoice/F5 có reference variants. Tuy nhiên coverage tiếng
   Việt và mức giữ identity khác nhau. Trong nhóm mở rộng, **Fish S2 Pro** là
   ứng viên thử đầu tiên cho tiếng Việt vì model card ghi rõ `vi`, emotion và
   whisper/shout/volume tags. Khả năng công bố chưa thay thế nghe thử thực tế.
3. **Chưa cần mặc định train mọi tổ hợp.** Thứ tự đề xuất: thử reference variants
   OmniVoice làm baseline → thử Fish S2 Pro; thử CosyVoice3 cho ngôn ngữ nó hỗ
   trợ → nếu chưa đạt thì dùng nhiều LoRA cùng Speaker Profile và identity anchor.
4. Với fallback, kế thừa quyết định per-emotion LoRA đã có trong
   [03-04](../../.planning/phases/03-voice-training/03-04-PLAN.md), mở rộng thêm
   delivery khi có dữ liệu. Một LoRA nhận mọi instruction là nhánh nghiên cứu
   sau, có thêm rào cản validator; không thay quyết định cũ bằng giả định mới.

Các kết luận về repo dựa trên nguồn [S1]–[S10] bên dưới. Không có kết quả âm
thanh/GPU mới trong vòng này.

## 2. Ba thông số phải tách ra

| Trục | Ví dụ | Cách tạo/đánh giá |
|---|---|---|
| Cảm xúc và cường độ | bình thường, vui, buồn, giận; nhẹ/mạnh | Model conditioning, reference hoặc LoRA; người nghe xác nhận |
| Cách phát giọng / vocal effort | thì thầm, nói nhẹ, nói thường, nói lớn, hét | Đặc tính hơi thở, hữu thanh, độ căng, ngữ điệu; cần performance thật hoặc model học được |
| Mức audio khi phát/mix | gain dB, peak/RMS, loudness LUFS | DSP sau generation và đo tín hiệu; không cần một model cho mỗi mức dB |

Ví dụ: giận nhưng nói rất khẽ, vui nhưng nói thường, buồn nhưng gọi lớn đều có
thể tồn tại. Whisper khác soft speech; low-energy khác low volume. F0 không đủ
để phân loại các cách nói này; với tiếng Việt còn phải giữ thanh điệu.

Micro gain, khoảng cách mic, AGC/compressor và mixer cũng thay biên độ thu. Do đó
không gán nhãn `shout` chỉ từ peak/RMS. Không tạo tập “hét” bằng cách tăng gain
bản neutral. Gain augmentation chỉ là biến đổi tín hiệu, không thêm performance.

OmniVoice raw JSONL reader mặc định peak-normalize mỗi mẫu về 0.9 trước token
extraction. Clone reference dùng quy tắc **khác**: đo RMS, nâng mẫu thấp hơn 0.1
trước encode và có bước scale trả theo reference RMS ở output; nhánh không có
reference peak-normalize output về 0.5. Vì vậy biên độ có thể ảnh hưởng mức file
đầu ra nhưng không tạo điều khiển vocal effort đã hiệu chuẩn. Không nên train
nhiều adapter chỉ vì cùng một performance có gain khác nhau. [S1]

## 3. OmniVoice: phiên bản đang dùng và phiên bản mới

| Mốc kiểm tra | Kết quả |
|---|---|
| Local submodule | `38e992bc60f85548faeb77e8fa70158ba71deb30`, 2026-08-05 |
| Upstream default `master` | `08be0b4ccbac3e13e374e86fbfead4b4cac343e2` |
| Khác local | Đúng một commit sửa kiểu waveform trong denoiser, không thêm emotion/loudness |
| Official release mới nhất | `0.2.1`, 2026-07-16; release cũ hơn local pin |
| Tiếng Việt | Có `vi` trong bảng ngôn ngữ upstream; voice-design training chỉ EN/ZH theo docs |
| Điều khiển cảm xúc | Không có vocabulary happy/sad/angry đã hỗ trợ; `whisper` chỉ là thuộc tính voice design |
| Train có label | Processor đọc `instruct` theo từng mẫu khi ratio bật; đây là nền tảng để thử, chưa chứng minh controllability |
| Rào cản inference | `_resolve_instruct` trong `models/omnivoice.py` ném `ValueError` với instruction ngoài danh sách, kể cả `angry` |

PRO4BRO compiler đã suy ra `DatasetSegment.instruct` từ Emotion Label; exporter
đã ghi vào JSONL. Tuy nhiên recipe `instruct_ratio=0`, worker generation không
truyền instruct. Chỉ sửa ratio hoặc thêm label vào JSONL chưa đủ. Nếu nghiên cứu
single conditioned LoRA, cần đường conditioning thực nghiệm do sản phẩm sở hữu,
kiểm tra train/infer cùng encoding và giữ upstream read-only. Không coi việc
nới validator là bằng chứng model hiểu label. [S1]

## 4. Các repo đã nghiên cứu và nhóm mở rộng

`Có` trong bảng là tài liệu/code có chức năng; không phải chứng nhận acoustic
quality ở PRO4BRO. Model/adapter giữa các engine không dùng lẫn; có thể tái sử
dụng bản thu nguồn và transcript, rồi export/train theo từng engine.

| Repo / model | Điều khiển cảm xúc và cách nói | Train voice / clone | Tiếng Việt | Đề xuất |
|---|---|---|---|---|
| **CosyVoice3 0.5B-2512**, đã khảo sát | Chính thức liệt kê emotion, speed, volume instructions; `inference_instruct2(text, instruction, prompt_audio)` | Clone + instruction có sẵn; có training scripts, PRO4BRO hiện chỉ cung cấp clone cho nhánh này | Chưa nằm trong 9 ngôn ngữ công bố | Thử EN/ZH/JA/KO trước; chưa coi là phương án tiếng Việt sẵn. [S2] |
| **EasyVoice/F5-TTS + ViVoice**, đã khảo sát | Variants là các reference clip đúng cảm xúc/cách đọc, chọn từng đoạn; không phải bộ cảm xúc được học chỉ từ tên label | F5 có fine-tune; EasyVoice variants không phải một LoRA cho mỗi cảm xúc | ViVoice có model tiếng Việt | Baseline reference hữu ích; không giải quyết độc lập mọi emotion × effort. [S3] |
| **OpenVoice V1/V2**, đã khảo sát | V1 demo style friendly/cheerful/sad/angry/terrified/shouting/whispering; tone conversion giữ target timbre | Zero-shot tone cloning; style tới từ base speaker TTS. Không suy ra mọi ngôn ngữ V2 đều có cùng style API V1 | V2 native 6 ngôn ngữ, không liệt kê VI | Thử EN style + conversion nếu cần; pipeline tiếng Việt cần base speech và gate riêng. [S4] |
| **VibeVoice**, đã khảo sát | Không thấy bộ điều khiển emotion/effort tường minh đáp ứng yêu cầu trong đường official đã khảo sát | Prompt/reference; long-form và realtime là các model khác nhau | Không có bằng chứng VI TTS đủ dùng ở khảo sát trước | Không ưu tiên cho tính năng này; bản long-form official đang disabled theo khảo sát trước, không dùng ASR để suy ra TTS. [S5] |
| **Applio/RVC, w-okada**, đã khảo sát | Chuyển timbre audio đã được diễn với emotion/effort mong muốn | Train VC; nội dung/cách diễn do source cung cấp, có thể bị suy giảm qua conversion | Phụ thuộc audio và trained VC model | Phương án bổ trợ: thu diễn hoặc TTS diễn trước → VC; không phải text emotion controller. [S5] |
| **IndexTTS-2.5**, đã khảo sát timing | Tách speaker prompt và emotion prompt, `emo_alpha`, vector 8 cảm xúc, text-to-emotion | Zero-shot có sẵn; chưa chứng minh official fine-tune workflow cho custom emotion × effort | 5 ngôn ngữ công bố, không có VI/KO | Rất phù hợp thử khả năng tách identity/emotion ở EN/ZH/JA; whisper/shout không tự suy ra từ vector cảm xúc. [S6] |
| **Fish S2 Pro**, mở rộng | Inline natural-language emotion, `[whisper]`, `[shouting]`, `[low volume]`, `[volume up/down]`; dùng reference clone | Có inference sẵn; không coi training path hiện hành là turnkey, xem mục tiếp | `vi` được liệt kê, nằm ngoài Tier1/2 | **Ứng viên thử tiếng Việt đầu tiên**, so cùng speaker/text với OmniVoice. [S7] |
| **Fish Drama 3**, mới hơn trong cùng repo | Natural-language control, clone, emotion revision/editing; upstream công bố mạnh hơn về diễn cảm | Repo hiện hành ưu tiên inference; chưa kiểm tra trainer phù hợp | Card gắn 83 languages nhưng chưa xác minh chi tiết chất lượng VI | Theo dõi/benchmark sau: 35B tổng, 3B active không đồng nghĩa chỉ chứa 3B weights. [S8] |
| **Qwen3-TTS 1.7B**, mở rộng (EasyVoice cùng tên khác từng nhắc tới Qwen) | CustomVoice/VoiceDesign có instructions; Base clone là API khác | Official có single-speaker SFT; recipe không chứng minh emotion-conditioned custom speaker | 10 ngôn ngữ official không có VI | Không nhập nhằng instruction cho preset với clone bất kỳ. Community VI fine-tunes cần audit riêng. [S9] |
| **Chatterbox**, mở rộng | Original có `exaggeration` tăng tính diễn cảm, không phải vector emotion độc lập; Turbo có paralinguistic tags | Clone có sẵn; chưa xác minh fine-tune emotion/effort chính thức | Không thấy VI trong danh sách multilingual đã kiểm tra | Ứng viên phụ cho ngôn ngữ hỗ trợ, không ưu tiên hơn Fish cho VI. [S10] |

### Fish: vì sao có thể thử sẵn nhưng chưa chốt làm training backend

Model card S2 Pro có cả reference cloning lẫn instruction tags và ghi `vi`.
Đây là bằng chứng trực tiếp đáp ứng hướng inference, không cần train trước khi
thử. Các tags là chỉ dẫn hành vi, không phải target dB/LUFS cam kết. [S7]

Nhưng default branch Fish đã chuyển sang Drama 3. Tại pin `5415669`, tree không
còn trainer/LoRA recipe trước đây và `docs/en/finetune.md` trả 404. Bản lịch sử
`3578e4` vẫn có guide nhưng trỏ **OpenAudio-S1-mini**, cảnh báo fine-tune model
RL có thể làm giảm chất lượng. Không lấy guide đó làm bằng chứng S2/Drama3
fine-tune hoạt động chỉ bằng đổi đường dẫn weights. Phải pin một trainer thực
sự tương thích và tạo artifact chạy được trước khi thêm vào catalog. [S7b]

Về điều kiện phân phối, S2 Pro weights vẫn ghi Fish Audio Research License;
README/code hiện hành ghi Community License, không phải cùng một nhãn. ViVoice
ghi NC-SA; CosyVoice3 card ghi Apache-2.0; IndexTTS dùng Bilibili model license.
Chưa có lựa chọn thương mại/redistribution mới được duyệt trong nghiên cứu này.
Đây là thông tin lựa chọn dependency, không cản benchmark local trong phạm vi
điều kiện tương ứng. [S2, S3, S6, S7, S8]

### Các revision đã truy vấn để tái lập

| Repo / artifact | Revision | Ngày commit / cập nhật do upstream trả |
|---|---|---|
| CosyVoice source | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` | 2026-05-25 |
| CosyVoice3-2512 model | `29e01c4e8d000f4bcd70751be16fa94bf3d85a18` | 2026-02-03 |
| IndexTTS source | `d9e41aac89fd00b3d71497fddb287b7f24613712` | 2026-09-29 |
| IndexTTS-2.5 model | `c39ce5ba981572cb187443877ff559dfb246ce63` | 2026-08-12 |
| Fish source | `541566932abbaebcb0a40e562a1f846738383f38` | 2026-10-14 |
| Fish S2 Pro model | `1de9996b6be38b745688de084d87a5633f714e4e` | 2026-03-11 |
| Fish Drama3 model | `b2b5ee998034b2975720906c815e7fb0e9f007bd` | 2026-10-17 |
| Qwen3-TTS source | `022e286b98fbec7e1e916cb940cdf532cd9f488e` | 2026-03-17 |
| Chatterbox source | `5de7a54aa4e5e2baadb0182dde554908b48b85c2` | 2026-07-21 |
| OpenVoice source | `74a1d147b17a8c3092dd5430504bd83ef6c7eb23` | 2025-04-19 |
| F5-TTS source | `2f866649b779881af8bd644e76b9a6d95053da29` | 2026-10-14 |

Revision là metadata source/model-card, chưa phải SHA-256 weights đã tải.

## 5. Hiện trạng PRO4BRO và phần thực sự phải làm

Đã có `SpeakerProfile`, `DatasetSegment.emotion/instruct`, Reading Pack/Session,
exporter, LoRA runner, GPU lease/Stop/resume, `ProjectVoice`, `VoiceModelSet`,
`FileVoiceModelSets`, `SpeakerSimilarityGate` và PCM loudness renderer. Cụ thể:

- `training_runner.py` hiện batch theo **speaker**, lọc segment của speaker;
  không được coi đó là batch tự động theo emotion × delivery.
- `file_voice_model_sets.py:create_pending` khởi tạo set từ **một voice/run**;
  schema và gate tồn tại nhưng chưa chứng minh một set đầy đủ nhiều variant.
- `SpeakerSimilarityGate` yêu cầu một output/member, threshold đã calibrated;
  cần mở rộng protocol/evidence để kiểm tra nhiều câu và extreme delivery.
- `cosyvoice_worker.py` hiện **đã** truyền `inference_instruct2` khi chọn instruct.
  Nhận định cũ trong kế hoạch về việc worker chưa truyền instruct không áp dụng
  cho worker CosyVoice này. Source có đường gọi không đồng nghĩa đã nghe đạt.
- `voice_loudness_audio.py` có peak/RMS, gain, headroom -1 dBFS và ramp 5 ms cho
  PCM16 mono24k. Đây chưa phải bằng chứng LUFS hoặc true-peak meter. Tái sử dụng
  renderer, thêm phép đo chuyên biệt khi cần; không viết lại chức năng gain.

Các điểm trên lấy từ code local, không chỉ dựa vào kế hoạch cũ. Kế hoạch này nối
TRN-02/05/08/09, MAN-06/07/18 và ADR0011; không đổi nghĩa các domain type hiện có.

## 6. Thiết kế chức năng đề xuất

### Người dùng làm gì

Chọn Speaker Profile → chọn engine và cách xây giọng → thấy bảng coverage theo
emotion/delivery → thu hoặc gán clip thật → xem QC và nghe lại → chạy thử/train
→ nghe so sánh cùng câu → publish một Voice Model Set → dùng set trong Script.

Trong Script giữ riêng: Emotion Label, intensity, delivery và mức âm lượng render.
Control chỉ bật cho capability đã được kiểm chứng ở đúng engine/model/language.
Cell chưa có dữ liệu hoặc chưa qua gate phải báo thiếu; dùng neutral thay thế
chỉ khi người dùng đã chọn fallback đó, và lưu rõ kết quả thực áp dụng.

### Dữ liệu và publication

- Giữ Emotion Label hiện tại; không đổi `good` thành `happy` hoặc `low-energy`
  thành `quiet` tự động. Mapping engine phải tường minh. `mix` cần segment review,
  không phải một target emotion để train.
- Đề xuất bổ sung delivery enum, intensity có ngữ nghĩa/range rõ, review state,
  capture-chain ID, source hash, preprocessing recipe và số đo peak/RMS/loudness.
  Đây là thiết kế cần chốt schema/version trước code, chưa là field đã tồn tại.
- Dataset split theo cả recording/session và nhóm text; các take đọc cùng câu
  qua nhiều style ở cùng split để tránh rò rỉ. Có train/dev và test khóa riêng;
  test không dùng để chọn checkpoint hoặc hiệu chuẩn threshold.
- Set lưu common base revision/hash, cùng speaker, identity reference, anchor
  segment IDs/hashes, từng member `(emotion, delivery, intensity-range)`, dataset
  hash/config/checkpoint, capability và các gate outputs. Không gộp nhiều engine
  vào một generation family hoặc trộn adapter của hai set.
- Một model conditioned có thể phục vụ nhiều cell; set không bắt buộc mỗi cell
  phải có weights riêng. Với fallback per-cell LoRA, mỗi cell có artifact riêng.
- Voice Collection/move/Open Existing phải mang theo mọi adapter/reference/gate
  evidence cần thiết; base weights vẫn ở thư viện máy. Retrain tạo candidate/set
  revision mới để bản published cũ tiếp tục tái lập; không âm thầm sửa member cũ.

### Nhánh A: dùng khả năng sẵn của engine

1. Với OmniVoice, thu reference riêng cho các performance; giữ cùng identity và
   transcript reference. Đổi clip là một thao tác điều khiển có provenance,
   không gọi là “train emotion”.
2. Với Fish, giữ reference clone target cố định, thay tags emotion/effort trên
   cùng câu; thử thêm matched-style reference nếu neutral reference lấn át tag.
3. CosyVoice dùng instruct+reference qua seam hiện có cho ngôn ngữ công bố.
4. Adapter trả capability, requested/applied settings và output thật. Khi engine
   bỏ qua yêu cầu hoặc quality không đạt thì không publish capability đó.

### Nhánh B: nhiều lần train khi nhánh A không đạt

1. Chuẩn bị neutral anchor và tập đúng emotion/delivery đã review của cùng
   speaker. Không chỉ nhân bản dataset rồi đổi label.
2. Train neutral LoRA và mỗi variant bằng **cùng base hash**, cùng kiến trúc/rank,
   cùng config nền và cùng slice neutral anchor. Một thử nghiệm có thể so mức
   neutral replay 10/20/30%, chọn bằng dev; đó là tham số cần đo, chưa là mặc định.
3. Mỗi variant xuất phát độc lập từ cùng base; không train nối neutral→sad→angry
   rồi ghi đè checkpoint. Nếu thử identity-adapted base chung, phải có một parent
   cố định cho mọi variant và giữ đủ lineage/dependencies; không stack LoRA tùy ý.
4. Ban đầu chỉ train normal/ordinary, sad/ordinary, angry/ordinary và normal với
   soft/whisper/shout. “Giận + thì thầm” chỉ được bật sau khi có dữ liệu và test
   đúng tổ hợp; không suy ra bằng trộn hai LoRA hoặc nội suy trọng số chưa thử.
5. Giới hạn số pass bằng dataloader thật (`training_passes.py`), chọn checkpoint
   bằng dev loss **và** dev listening/control; không sao chép 5.000 steps cho mọi
   tập nhỏ. Tokenized shards dùng lại chỉ khi source/preprocess/tokenizer hashes
   giống; config/resume không trôi theo settings mới.
6. Chạy tuần tự trên GPU lease; job có parent batch và child runs, Stop chặn cả
   queued variants, resume chỉ khôi phục run hợp lệ. Không publish set thiếu
   artifact/gate vì các child khác đã thành công.
7. Generate theo nhóm adapter để giảm load/swap, giữ bản đồ span rồi ráp về đúng
   Timeline. Chuyển tại phrase boundary; ramp/crossfade trên phần im lặng hoặc
   vùng được review, không cắt phụ âm/đè word time để giấu seam.
8. Cân mức theo yêu cầu render sau generation; giữ chủ ý tương phản soft/shout,
   không normalize mọi câu về một loudness làm mất diễn xuất. Output gain không
   thay thế những đặc điểm vocal effort mà LoRA chưa học được.

### Nhánh C: một LoRA có condition cho nhiều style, thực nghiệm sau

Ưu điểm là ít artifacts và ít đổi adapter. Đổi lại cần tập có label đủ độc lập,
balanced sampling, train/infer cùng style encoding, identity replay và nhiều
thử nghiệm hơn. Với OmniVoice phải giải quyết validator từ đầu; chỉ thêm
`instruct="angry"` vào request hiện nay sẽ lỗi. Không sửa upstream; prototype
qua product-owned wrapper rõ revision, không bỏ validation toàn cục. Nếu chưa
qua gate thì giữ nhánh B. Chưa có bằng chứng định lượng để chốt C tốt hơn B.

## 7. Kế hoạch dữ liệu

Giữ mục tiêu owner đã nêu trong 03-04: **neutral 10–15 phút; 4–5 phút mỗi cảm
xúc** audio usable, không phải độ dài một file. Pack hiện tại có hướng diễn
và emotion cards nhưng chưa đủ để tuyên bố mọi tổ hợp hoàn tất.

- Pilot bắt đầu 1 speaker VI, ba emotion normal/sad/angry; năm delivery ordinary,
  soft, whisper, loud, shout được thu như các lớp riêng. Thử sáu cell ở vòng đầu
  (mục 9), bổ sung loud và tổ hợp sau khi biết nhánh nào hoạt động.
- Dùng các câu giống nhau cho đối chiếu controllability và câu đa dạng để tránh
  học thuộc emotion theo từ ngữ. Có câu trung tính diễn giận/buồn và câu cảm xúc
  đọc neutral; giữ coverage sáu thanh, số, tên, âm cuối tiếng Việt.
- Mục tiêu delivery 4–5 phút/lớp là **đề xuất để thử**, chưa phải yêu cầu owner
  cũ hoặc ngưỡng bảo đảm chất lượng. Không yêu cầu đầy emotion × delivery × mọi
  cường độ ngay từ đầu. Chỉ quảng bá những cell thật sự đủ dữ liệu và qua gate.
- Thu lossless, mic/gain/khoảng cách có ghi nhận; tắt auto-level nếu có thể và
  ghi rõ thay đổi chain. Chừa headroom cho shout, đổi gain khi cần để tránh clip,
  nhưng không coi số dBFS giữa hai gain khác nhau là sức phát giọng tương đương.
- Giữ raw source bất biến. WAV analysis/training là derivative có recipe/hash;
  dùng 24k mono cho OmniVoice, các engine khác theo requirement riêng. Lưu sample
  rate/channels/bit depth, speech duration, clipping/noise và chính sách normalize.
- Không peak-normalize hoặc denoise mạnh một cách vô hình: gain normalization
  có thể xóa mức amplitude, denoise có thể xóa hơi whisper. Dữ liệu và phép đo
  trước/sau đều phải truy lại được. Tập chỉ học vocal effort vẫn có thể dùng
  level normalization có ghi nhận, vì timbre/prosody khác với gain thuần.
- Reading Session phải resumable; coverage tính **accepted speech**, không tính
  retake bị loại hoặc silence. Tiếp nối capture/QC/emotion-block gaps của 03-04.

## 8. Cách biết phương án có dùng được

Đánh giá hai lượt nghe: bản giữ gain gốc để đo render/loudness, và bản level-matched
chỉ phục vụ listening để không nhầm audio lớn hơn với cảm xúc tốt hơn. Lưu cả hai
như derivatives; không dùng bản level-matched làm truth về output loudness.

| Gate | Evidence bắt buộc |
|---|---|
| Phát âm/đúng lời | Câu test chưa dùng train/dev, người Việt nghe thanh điệu/âm cuối, CER/WER từ một recognizer cố định chỉ làm chỉ báo |
| Điều khiển | Cùng text/reference/seed policy, đổi từng trục; nghe mù emotion và effort riêng, confusion theo từng cell; kiểm tra tags có bị đọc thành lời |
| Danh tính | Nhiều câu/cell, so anchor và impostor speakers; hiệu chuẩn trên dữ liệu riêng, freeze threshold trước test; nghe thật bổ sung |
| To/nhỏ audio | Đo peak/RMS và LUFS ở window phù hợp; ngắn/không đủ dữ liệu trả unavailable. Đo true peak riêng nếu dùng dBTP; không gọi sample peak là true peak |
| Timing/seam | Không nuốt đầu/cuối từ, giữ duration/pauses; nghe phrase joins, kiểm tra sample count và timestamps output |
| Vận hành | Checkpoint reload, Stop/resume, source hashes, move/reopen, set revision và stale-generation guards; VRAM/RAM/RTF/load time từ máy thật |

Identity evaluation cần thêm reference thật từ buổi thu độc lập, ngoài neutral
slice dùng train/replay; không chỉ đo lại một câu anchor mà model có thể học thuộc.

Không lấy SpeechBrain wav2vec2-IEMOCAP làm trọng tài tiếng Việt: thử nghiệm trước
có clip VI tổng hợp và thiếu native labels độc lập. Nó chỉ là một phép đo phụ;
nhãn người nghe và output nghe lại mới giải quyết chất lượng emotion. Không dùng
speaker cosine threshold tùy chọn để tuyên bố identity đã đạt. Whisper/shout có
thể gây bias cho embedder; phải hiệu chuẩn các condition này với positive và
negative thật. Một pilot chỉ có một speaker không đủ để hiệu chuẩn publication.

Ngưỡng số cho control/naturalness/CER delta cần được freeze trong protocol trước
vòng inference có chấm điểm; chưa hạ hoặc thay gate hiện có trong nghiên cứu này.
Vòng feasibility có thể báo chưa đạt/chưa hiệu chuẩn mà vẫn kết thúc đúng scope.

## 9. Thứ tự các vòng triển khai, không chạy trong lần nghiên cứu này

Một invocation làm một vòng bounded theo AGENTS.md. Các tên dưới là đề xuất để
gắn vào workflow hiện có khi thi công, không tự đổi số round/đóng phase.

| Vòng đề xuất | Phạm vi và acceptance | Kiểm chứng / phụ thuộc |
|---|---|---|
| **ED-01: khóa pilot** | Chọn 6 câu VI chưa train và 6 cell: normal/sad/angry ordinary + normal soft/whisper/shout; 2 seeds/cell, reference có transcript; manifest/protocol/threshold quyết định freeze trước inference | Source/permission/hash/QC/split inventory; nêu rõ thiếu bản thu nào; không giả audio hoặc tự nhận corpus đã có |
| **ED-02: baseline reference** | OmniVoice generate 72 WAV thật bằng matched references; có logs/config/hashes và blind-listening report; không chỉ một demo đẹp | ED-01; đo level+identity/control, không train; failed cells vẫn báo đầy đủ |
| **ED-03: ứng viên sẵn** | Pin runtime/weights Fish S2 Pro, tạo cùng 72 WAV, same speaker/text/conditions; capability từng cell có evidence | ED-02; adapter thử nghiệm ngoài engines, dependency/codec và memory smoke; source speech local, không dùng hosted API |
| **ED-03b: ngôn ngữ khác nếu cần** | CosyVoice3 qua adapter hiện có; IndexTTS-2.5 khi cần emotion reference/vector cho EN/ZH/JA | Nhánh tùy kết quả/ngôn ngữ; không đặt VI support giả vào catalog |
| **Checkpoint chọn hướng** | Nhánh A chỉ được chọn nếu pronunciation, identity, emotion/effort và resource budget đều đủ; ghi từng gap thay vì kết luận không có repo | Listening của owner và evidence ED-02/03; nếu chưa đạt thì B, không tự nâng model khác lên production |
| **ED-04: coverage/capture** | Bổ sung delivery/intensity/review và Reading Pack v2 theo một lát thu→QC→coverage; source bất biến, resume/move không mất labels | Schema/design được chốt; 3–5 files mỗi lát, tách thêm nếu rộng; TRN-08/09, MAN-06/07 |
| **ED-05: pilot LoRA** | Train neutral + sad/ordinary + angry/ordinary từ cùng base, cùng anchor; artifacts reload được và có dev report | ED-04 và nhánh B; so baseline ED-02; epoch cap, GPU lease/Stop/resume hiện có |
| **ED-06: thêm effort** | Chỉ thêm các cell soft/whisper/loud/shout cần thiết; test đối chứng gain-only và held-out text | ED-05; không mở toàn matrix trước khi các cell đơn đạt |
| **ED-07: xuất bản set** | Nhiều members đúng tuple, lineage/anchor thống nhất; gate protocol nhiều câu, calibrated, thiếu output thì từ chối publish | ED-05/06, ADR0011; adapter/schema/gate chia lát tối đa ~5 files/lần |
| **ED-08: Script→audio** | Chọn set/emotion/delivery, render thật, batch theo adapter rồi ráp; unknown cell hiện rõ; edits invalidate đúng cache | ED-07 và MAN-06/07/18; unit tests + browser + real WAV nghe/đo seam |
| **ED-09: chuyển project** | Move/Open Existing/Collection giữ đủ adapters, refs, lineage/gates; base thiếu báo đúng; set cũ tái lập được | ED-08; kiểm hash/media/artifacts sau move, Stop/resume và regression suite |

Nếu một lát ED-04/07/08 đụng nhiều subsystem, tách schema/API/UI thành các vòng
con có acceptance đầu cuối; không cố nhồi vào một invocation. Nhánh A đạt thì
bỏ qua training B nhưng vẫn cần capability, publication/evidence và Script flow.

Khi code: frontend chạy `npm test`, `npm run typecheck`, `npm run build` tại
`apps/web`; backend chạy project Python `-m pytest services/api/tests -q` từ
root. **Full API hiện có gap process containment ở Round84**: phải giải quyết
hoặc contain test portable-updater trước full run, không chạy vô tình làm dừng
runtime người dùng. Các gate acoustic/artifact vẫn cần ngoài unit tests.

Máy hiện tại đọc bằng `nvidia-smi` là **RTX3090 24,576 MiB**, đang dùng 4,692 MiB
tại lúc kiểm tra. Không dựa vào mô tả GPU cũ của kế hoạch. S2 Pro backbone 4B
cộng fast-AR/codec và runtime overhead cần memory smoke thực tế; chưa cam kết
fit/training time. Drama3 35B không mặc định chạy vừa 24GB dù chỉ active 3B/token.

**Vòng nên làm kế tiếp:** ED-01, khóa bản thu/protocol và xác định những cell
thực sự sẵn dữ liệu. Sau đó mới benchmark reference baseline và Fish; không
train hàng loạt trước khi biết cần bổ sung phần nào.

## 10. Nguồn chính thức và bằng chứng

- **[S1] OmniVoice:** [audit local/upstream](OMNIVOICE-EMOTION-AUDIT-20261022.md),
  [current commit](https://github.com/k2-fsa/OmniVoice/commit/08be0b4ccbac3e13e374e86fbfead4b4cac343e2),
  [release 0.2.1](https://github.com/k2-fsa/OmniVoice/releases/tag/0.2.1),
  [voice-design](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/docs/voice-design.md),
  [inference/validator/RMS](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/models/omnivoice.py),
  [dataset peak normalization](https://github.com/k2-fsa/OmniVoice/blob/08be0b4ccbac3e13e374e86fbfead4b4cac343e2/omnivoice/data/dataset.py).
- **[S2] CosyVoice:** [README](https://github.com/QwenAudio/CosyVoice/blob/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/README.md),
  [example instruct2+prompt](https://github.com/QwenAudio/CosyVoice/blob/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/example.py),
  [model card](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512/blob/29e01c4e8d000f4bcd70751be16fa94bf3d85a18/README.md).
- **[S3] F5/EasyVoice:** [F5 multi-style UI](https://github.com/SWivid/F5-TTS/blob/2f866649b779881af8bd644e76b9a6d95053da29/src/f5_tts/infer/infer_gradio.py),
  [inference normalization](https://github.com/SWivid/F5-TTS/blob/2f866649b779881af8bd644e76b9a6d95053da29/src/f5_tts/infer/utils_infer.py),
  [EasyVoice variants](https://github.com/XavierChuu/EasyVoice/blob/af299a5cce44c6f877047bff54496fc1a823c090/engine/easyvoice_engine/services/voices.py),
  [ViVoice card](https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice),
  [khảo sát đã lưu](EASYVOICE-INTEGRATION-CANDIDATES.md).
- **[S4] OpenVoice:** [README V1/V2](https://github.com/myshell-ai/OpenVoice/blob/74a1d147b17a8c3092dd5430504bd83ef6c7eb23/README.md),
  [V1 styles demo](https://github.com/myshell-ai/OpenVoice/blob/74a1d147b17a8c3092dd5430504bd83ef6c7eb23/demo_part1.ipynb).
- **[S5] Nhóm đã khảo sát:** [comparison 19/10 và nguồn official](VOICE-ENGINE-COMPARISON-20261019.md),
  [VibeVoice](https://github.com/microsoft/VibeVoice), [Applio](https://github.com/IAHispano/Applio),
  [w-okada](https://github.com/w-okada/voice-changer). Các mục này là đối chiếu
  phạm vi; không thực hiện lại benchmark hoặc audit mọi revision trong vòng này.
- **[S6] IndexTTS:** [README/vector/prompt/speed](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/README.md),
  [2.5 model card/languages](https://huggingface.co/IndexTeam/IndexTTS-2.5/blob/c39ce5ba981572cb187443877ff559dfb246ce63/README.md).
- **[S7] Fish S2:** [model card VI/tags/architecture](https://huggingface.co/fishaudio/s2-pro/blob/1de9996b6be38b745688de084d87a5633f714e4e/README.md),
  [weight license](https://huggingface.co/fishaudio/s2-pro/blob/1de9996b6be38b745688de084d87a5633f714e4e/LICENSE.md),
  [S2 technical report](https://arxiv.org/abs/2603.08823).
- **[S7b] Fish trainer limitation:** [current source tree](https://github.com/fishaudio/fish-speech/tree/541566932abbaebcb0a40e562a1f846738383f38),
  [Drama3 migration commit](https://github.com/fishaudio/fish-speech/commit/1ff3c3ed2f80d3106a83909dd25b83129c3d816f),
  [historical guide](https://github.com/fishaudio/fish-speech/blob/3578e4e7099ee85464756dab27a3af86b5a21331/docs/en/finetune.md),
  [historical recipe still targets S1-mini](https://github.com/fishaudio/fish-speech/blob/3578e4e7099ee85464756dab27a3af86b5a21331/fish_speech/configs/text2semantic_finetune.yaml).
- **[S8] Drama3:** [current README/comparison](https://github.com/fishaudio/fish-speech/blob/541566932abbaebcb0a40e562a1f846738383f38/README.md),
  [model card](https://huggingface.co/fishaudio/drama-3/blob/b2b5ee998034b2975720906c815e7fb0e9f007bd/README.md),
  [current source license](https://github.com/fishaudio/fish-speech/blob/541566932abbaebcb0a40e562a1f846738383f38/LICENSE).
- **[S9] Qwen3-TTS:** [model types/languages](https://github.com/QwenLM/Qwen3-TTS/blob/022e286b98fbec7e1e916cb940cdf532cd9f488e/README.md),
  [API clone versus custom voice](https://github.com/QwenLM/Qwen3-TTS/blob/022e286b98fbec7e1e916cb940cdf532cd9f488e/qwen_tts/inference/qwen3_tts_model.py),
  [single-speaker fine-tuning](https://github.com/QwenLM/Qwen3-TTS/blob/022e286b98fbec7e1e916cb940cdf532cd9f488e/finetuning/README.md),
  [SFT implementation](https://github.com/QwenLM/Qwen3-TTS/blob/022e286b98fbec7e1e916cb940cdf532cd9f488e/finetuning/sft_12hz.py).
- **[S10] Chatterbox:** [README/model distinctions/exaggeration](https://github.com/resemble-ai/chatterbox/blob/5de7a54aa4e5e2baadb0182dde554908b48b85c2/README.md).

Kiểm tra thực hiện: Git root/status, đọc ledgers/domain/portability/plans/code,
web chính thức, GitHub API default-branch/commit/tree, Hugging Face model metadata,
`nvidia-smi` read-only. Guide Fish hiện hành 404 được đối chiếu bằng tree và
history, không thay bằng một fork rồi coi là official. Không chạy frontend/backend
test suites vì chỉ thêm tài liệu. Chưa có audio/model artifact mới để nghiệm thu.

Kiểm tra tài liệu lúc kết thúc: cả hai note không có local link bị thiếu;
`git diff --check` và kiểm tra no-index từng file không có whitespace findings
(Git chỉ báo LF→CRLF; no-index trả 1 vì file mới khác NUL). Review độc lập không
tìm thấy lỗi trọng yếu. Git status chỉ có hai note mới; submodule sạch.
