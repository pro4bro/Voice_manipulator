# Pro4Bro portable — without VibeVoice

## Bản tách riêng app và core/model

Nếu có `COPY-CORE-MODELS.md`, phần app đã đóng gói nhưng **chưa kèm core/model**.
Đọc file đó để copy từng thư mục từ máy phát triển vào đúng đường dẫn bên trong
portable. Giữ phần app mới; không chép đè `scripts`, `services/api`, giao diện
hoặc plugin từ bản portable cũ. Không copy hai thư mục VibeVoice; VibeVoice vẫn
hiện trong danh sách chọn với trạng thái chưa cài.

Copy xong, bấm `VERIFY-PORTABLE.bat` ở gốc portable. Kiểm tra đầy đủ phải có
**0 failed**; khi đó dấu chưa hoàn tất được gỡ tự động. Sau đó bấm
`open-pro4bro-console.bat`. Muốn dùng OBS, đóng OBS rồi bấm
`INSTALL-OBS-PLUGIN.bat` ở cùng thư mục và mở lại OBS.

Lần đầu chuyển máy, copy **toàn bộ portable đã bổ sung core/model**. Những lần
cập nhật code sau chỉ cần thư mục update có số phiên bản trong `updates`, rồi
bấm `UPDATE-PORTABLE.bat` ở gốc portable trên máy nhận. Hướng dẫn cập nhật chi
tiết ở bên dưới. `bytes` là lượng đã đóng gói, còn `logicalBytes` là lượng dự
kiến khi bổ sung core/model, chưa tính project và media anh tạo sau này.

This bundle includes the Pro4Bro UI and API, FFmpeg, OBS bridge, STT models,
OmniVoice code and checkpoint, and the existing RVC/Applio runtime. The
VibeVoice runtime, source and weights are omitted to keep the folder smaller.
VibeVoice remains in the model lists with an unavailable/not-installed status;
select an installed model for actual processing. No model should be reported as
successful until its output artifact exists.

## Phản hồi khi thêm footage hoặc Voice Output

Import, thu micro/hệ thống, Start OBS và Generate Voice hiện slot ngay khi bắt
đầu thao tác. Slot có animation và trạng thái đang mở nguồn, đang thu, đang lưu
hoặc đang tạo voice. Khi hệ thống bật Reduce motion, trạng thái vẫn hiện nhưng
animation tắt. Slot chờ xác nhận import đứng yên; lỗi cũng dừng animation.

Slot chờ chỉ trở thành footage/voice sử dụng được khi có file kết quả đã lưu.
Nếu lưu bản thu bị lỗi, bấm **Thử lại** trên slot đó để dùng lại audio còn giữ
trong phiên hiện tại. Không đóng app trước khi lưu lại. Lỗi quyền microphone
cần cấp quyền/chọn nguồn rồi thu lại. Voice Output lỗi/đã hủy có thể ẩn trạng
thái; file thành công vẫn được quản lý bằng các thao tác Voice Output hiện có.

## Move and verify

1. Copy the **whole** folder to a 64-bit Windows 10/11 machine with enough free
   space. The exact size is recorded as `bytes` in `.portable-bundle.json`.
   A `HardLink` staging build occupies less extra space on this drive; copying
   it to a different drive materializes the full size.
2. Run `VERIFY-PORTABLE.bat`. It reads the bundle profile and checks the local
   runtimes, model files, OBS plugin hashes and the absence of VibeVoice files.
3. Run `open-pro4bro-console.bat`. NVIDIA GPU features require a compatible driver.
   OBS Studio 32.2.2 is needed for the included bridge plugin build.
4. Open or create a project under this folder's `data` directory, or use Open
   Existing for a project carried beside it. Keep `project.json` and its assets
   together. Do not edit absolute paths into the project file.

## Update the app without copying models again

If this portable folder is still under the source checkout on the development
machine, double-click **`UPDATE-PORTABLE.bat` in this folder** after each code
change. It finds the source, builds the web UI, applies the latest app code and
leaves a small, automatically numbered transfer folder inside `updates`. Wait for the window to
show `updated: true` and `gateFailed: 0`. The result also shows the app release
version and `transferPack` path. Read that folder's `VERSION.txt` before copying
it; the installed version is in `.portable-bundle.json`. Creating a new pack
automatically increases its patch number. Applying a copied pack keeps that
number; no manual version editing or folder renaming is needed.

For the first move to another machine, copy this **whole portable folder**
(about 36 GiB), run `VERIFY-PORTABLE.bat` there, then start the app with
`open-pro4bro-console.bat`. For later code-only updates, copy only the development
portable's numbered folder (about 4 MiB), such as
`updates/App-alpha-0.5.1-NoVibeVoice`, into the other portable's `updates`.
Keep older folders if desired. On the other machine, alpha 0.5.7 and earlier
must use `APPLY-UPDATE.bat` inside the received pack once to install the updater
that stops the controller before replacing API files. Alpha 0.5.5 and earlier
also require it to accept the four-BAT inventory. Alpha 0.5.8 and newer can use
`UPDATE-PORTABLE.bat` beside `open-pro4bro-console.bat`. Then run
`VERIFY-PORTABLE.bat` and start. The BAT under `payload` also finds the
enclosing portable, but launch the actual app from the portable root.

If this portable is not under the source checkout, first double-click
`MAKE-PORTABLE-UPDATE.bat` in the source repository. Copy its resulting whole
numbered update folder into this portable's `updates`, keeping its name, then
for alpha 0.5.7 and earlier click `APPLY-UPDATE.bat` in the pack once. For
alpha 0.5.8 and newer, click `UPDATE-PORTABLE.bat` here or `APPLY-UPDATE.bat`.

The updater checks each app file, replaces only app-owned paths, runs
`VERIFY-PORTABLE` checks and rolls back app files if verification fails. If this
portable instance was running, it stops the controller, API and Studio, waits
for their ports to be free, then reopens the console after update or rollback.
`-NoRestart` keeps the stack stopped. Another
instance using the same ports is left alone. Python runtimes, upstream engine
code, model caches and checkpoints stay in the separate base layer. Changes to
those require a new base/runtime package; an app update cannot install a new
model or Python dependency. The two inventories are
`.portable-app-layer.json` and `.portable-model-layer.json`. Existing runtime
paths remain in place so model loaders and copied projects stay portable.

The bundled OmniVoice base checkpoint is from
[`k2-fsa/OmniVoice`](https://huggingface.co/k2-fsa/OmniVoice), revision recorded
in `.cache/huggingface/hub/models--k2-fsa--OmniVoice/refs/main`. The upstream
code is Apache-2.0; the pretrained checkpoint is **CC-BY-NC**. Use and sharing
of that checkpoint must follow its non-commercial terms. Other bundled model
files have their own upstream terms. No user recordings, projects or tokens are
included.

## Install or repair the OBS bridge

After applying alpha 0.5.9 or newer, close OBS completely and double-click
`INSTALL-OBS-PLUGIN.bat` beside `open-pro4bro-console.bat`. Its default `auto`
action installs a new bridge, updates an older one, or repairs missing/changed
installed files. It validates the bundled package and installed hashes, preserves
existing pairing, and refuses repair while OBS is running. Reopen OBS afterward.
An OBS version mismatch still requires OBS Studio 32.2.2 for this plugin build.

Explicit commands remain available in a terminal opened in the portable folder:
`INSTALL-OBS-PLUGIN.bat -Action repair` and
`INSTALL-OBS-PLUGIN.bat -Action remove`. Explicit `-Action install` still asks for
Repair when installed files are damaged. Failures display the Python exit code
and original reason; they do not mean the plugin was successfully installed.

## Speech to text after updating

Alpha 0.5.5 fixes the STT catalog looking for the development-only service
folder. The catalog now resolves the sidecar in this portable, and verification
also checks that the production API exposes faster-whisper as available.
After updating, start the app from the full portable folder, import footage,
tick **STT** beside that footage, choose **Medium** or **Large v3**, then click
**Speech to text**. Importing a native file alone does not select it for STT.
CPU inference is supported when CUDA is unavailable and can take longer.

For a direct offline comparison, start with the bundled faster-whisper Tiny,
Base, Medium and Large-v3 selections on the same audio and keep language/device
settings fixed. Small remains listed but its weights are not in this bundle;
choosing it on an offline machine will require a separate model install. The
optional EasyVoice-core candidates and a measurement protocol are in
`docs/research/EASYVOICE-INTEGRATION-CANDIDATES.md` in the development repo;
they are recommendations, not extra runnable engines in this bundle.
