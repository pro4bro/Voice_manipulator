# TRAIN-PORTABLE-RVC-01 — Kiểm tra training đứng ở 15–16%

Ngày bắt đầu: 2026-10-25; kiểm chứng kết thúc26/10. Implementation: `1032b7c`.
Phạm vi: một round sửa khởi động/progress RVC portable, kiểm tra artifact OmniVoice
và làm rõ lỗi trên giao diện. Không chạy lại job200 epoch của chủ dự án.

## Kết luận từ job thật và ảnh chủ dự án

| Engine / run | Trạng thái và bằng chứng |
| --- | --- |
| RVC `run-f49951fb60ec` | Bắt đầu18:20:05, lỗi18:24:28 ngày25/10; globalStep0, chưa có model. Lỗi cuối: `RuntimeError: makeDeviceForHostname(): unsupported gloo device`. |
| OmniVoice `run-1d7ce338ff68` | Log ngày24/10 hoàn tất sau6m50s, đạt400 step. Có voice `voice-c8558df8c3ac`, weights/config/reference audio. |
| OmniVoice `run-87fb205967fa` | Log ngày24/10 hoàn tất sau6m03s, đạt400 step. Có voice `voice-b93e365f746d`, weights/config/reference audio. |

Ảnh chủ dự án ghi rõ Lỗi và tổng4 phút22 giây; thanh15% là phần tiến độ giữ lại
khi job đã dừng. Các dòng GET200 trong log là giao tiếp API, không phải bằng chứng
trainer đang học. API18119/18120 cùng trả RVC failed và hai OmniVoice complete.
Lúc bắt đầu điều tra không còn tiến trình trainer Python; RTX3090 dùng2856MiB và
10% GPU cho các ứng dụng khác. Không kết luận tiến trình hiện còn train từ % GPU.

Hai adapter OmniVoice đều107,596,368 byte,394 tensor; header safetensors và offsets
hợp lệ. Config và reference WAV tồn tại. Chưa chạy thêm nghe thử/đánh giá danh tính
trong round này. Dữ liệu trong `.scratch/training-hang-01/omnivoice-artifacts.json`.

## Nguyên nhân đã tái hiện

1. RVC chuyển sang CPython portable với `isolated=1`, `ignore_environment=1`.
   PYTHONPATH không đưa `rvc_site/sitecustomize.py` vào startup. Bản vá single-GPU
   có sẵn vì vậy không được nạp. Probe init_process_group thực tế trả bootstrapFalse,
   exit1, cùng lỗi Gloo trong job. Sau sửa startup path: bootstrapTrue/backendfake.
2. Chạy GPU tiếp bắt được `ModuleNotFoundError: No module named 'data_utils'` vì
   Python portable cũng không thêm thư mục script của Applio. Đăng ký đúng thư mục
   train xử lý lỗi thứ hai mà không sửa upstream.
3. Epoch stdout vẫn bị giữ buffer: PYTHONUNBUFFERED cũng bị bỏ qua, trong khi
   Applio dùng os._exit. Lần thử trung gian đã lưu model nhưng mất dòng epoch.
   Test subprocess-I/print/os._exit tái hiện stdout rỗng; line-buffer/write-through
   ở startup làm dòng epoch tới parser trước khi worker thoát.
4. Regex chọn lỗi chứa ký tự backspace thật thay cho word-boundary; nó chọn dòng
   Traceback thay vì RuntimeError. Test lỗi cuối trước sửa thất bại đúng như log.

## Sửa và kiểm chứng

- RVC runner bảo đảm `_pth` chứa các đường dẫn tương đối tới startup hook và thư
  mục train, bật importsite, ghi atomic và không ghi lại nếu đã đúng. Builder
  portable cũng mang cấu hình này. Virtualenv giữ đường PYTHONPATH cũ.
- Startup hook bật line-buffer/write-through cho worker RVC; chính sách process
  group single-GPU Windows có sẵn được giữ. Multi-GPU không nằm trong nghiệm thu.
- Sửa regex lỗi cuối. UI lấy exception cụ thể đã có trong journal cho run cũ bị
  rút gọn thành Traceback, không sửa lịch sử. Thanh tổng báo `Đã dừng ở 15%` và
  aria-valuetext của từng target có trạng thái kết thúc; không giả100% hoặc0%.
- Focused backend47 passed/7.21s: RVC, process, runner. Focused frontend25 passed/
  3.68s: TrainingJob, History, trainingBatch. Có red trước sửa cho startup path,
  lỗi cuối, mất epoch khi hard-exit và thông báo partial progress.
- Full frontend **174 files/1381 tests passed,209.23s**.
  `.scratch/training-hang-01/frontend-full.log`.
- Typecheck/build239 modules pass; JS `index-WSXAL2T5.js`, CSS `index-CJncqiqd.css`.
- Full backend: **1630 passed,1 failed,3 warnings,859.05s**, exit1.
  `.scratch/training-hang-01/api-full.log`. Case lỗi là
  `test_embedded_runtime_imports_streaming_package_from_the_correct_checkout`:
  VibeVoice Streaming import vượt60s. Đây là chữ ký timeout chập chờn đã được ghi
  ở gate vm-script-two-round-closure-20261025.md; chưa xác định nguyên nhân gốc.
- Chạy riêng chính case VibeVoice:1 passed/1 warning/16.07s, giữ timeout60s.
  `.scratch/training-hang-01/vibevoice-import-recheck.log`. Không sửa code VibeVoice,
  không coi lần chạy riêng là full-suite pass; full API gate vẫn mở.
- Compileall và git diff check pass. Không sửa test cũ, skip hay nới timeout.

## Nghiệm thu GPU/artifact thật

Probe cuối dùng bản sao của features trong job lỗi, experiment scratch độc lập,
1 epoch/8 bước. Qua chính TrainingProcess và command builder RVC của sản phẩm:

- Epoch1/1, globalStep8, done8/total8 đã tới parser/journal callback.
- Training thành công, lossgen69.485; inference model55,182,289 byte, lưu sau73.72s.
- CPU reload có457 tensor, tất cả finite; metadata epoch1/step8/sr40000/f0true/v2.
- Chạy bước extract_index thật: index16,388,819 byte.
- Hash toàn bộ features nguồn không đổi. Không publish model kiểm chứng vào
  Sound Library; không thay job lỗi hay checkpoint/voice của chủ dự án.
- Junction tạm đều được gỡ và không còn trainer của probe. Xóa4 file optimizer
  state chỉ trong scratch của probe để thu hồi2,589,922,268 byte; giữ final model,
  index và log. Runtime `_pth` cũ được backup trước khi áp dụng sửa tại máy.

Artifact và script nằm trong `.scratch/training-hang-01/`:
`probe_rvc_train.py`, `probe_rvc_index.py`, `bootstrap-green.log`,
`rvc-probe-final.log`, `rvc-artifact-result.json` và
`pro4bro-diagnostic-993b1242ae/`.

## Giới hạn và bước dùng tiếp

Runtime RVC tại máy đã có startup path sửa. API đang chạy chưa được restart;
đóng/mở app để nạp đầy đủ mã runner/báo lỗi mới, sau đó bắt đầu lại RVC khi muốn
train đủ200 epoch. Round này không tự bắt đầu lại job dài, không đánh giá chất
lượng giọng từ model1 epoch và không coi smoke là model thành phẩm.

Browser vẫn trả `Local browser use is disabled in Work settings` trước khi mở tab.
Ảnh chủ dự án là bằng chứng UI trước sửa; nghiệm thu native bản UI mới còn mở.
ADR0151 giữ quyết định. Phase03 vẫn60%, Phase06 mở; dừng sau round này.
