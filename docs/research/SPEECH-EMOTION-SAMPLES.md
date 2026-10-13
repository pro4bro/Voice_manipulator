# Short emotional speech samples for sensory benchmark

Research scope: find first-party sources with short audio and explicit emotion labels for Vietnamese, Mandarin Chinese, Japanese, and Korean. English has already been tested with the SpeechBrain/IEMOCAP example clips. No audio was downloaded for this research note.

## At-a-glance

| Language | Ready to audition? | Candidate and label coverage | Access and usage |
| --- | --- | --- | --- |
| Vietnamese | Yes for demo playback; no cleared raw corpus found | FastSpeechStyle demo has seven text prompts with publisher-labeled synthesized sad, happy, neutral, and angry variants. ViSEC has 5,280 human-labeled clips, but its HF path returns 401 and official Drive returns 404. | Direct demo WAVs are accessible, but the repo does not state a separate license for audio; use for private audition only, do not redistribute. ViSEC card declares CC BY 4.0, but artifact access was not verified. |
| Mandarin Chinese | Yes | CDESD; angry, happy, neutral; 1-second WAVs | Public OSF ZIP, 34.7 MB. The article is CC BY-NC 4.0; the archive itself does not show a separate dataset license. |
| Japanese | Yes, sample clips | HCUDB has direct samples for surprise, anger, contempt, and sleepy/tired | Individual sample WAVs open on the NII page. Full corpus is free for research after application and signed undertaking. |
| Korean | Yes | K-FinancialSpeech; anger, anxiety, sadness, happiness, neutral; each clip 1.01–8.67 seconds | Dataset publisher's Hugging Face page; CC BY-NC 4.0. |

## Vietnamese — ViSEC

The HuSTeP lab's [Hugging Face dataset card](https://huggingface.co/datasets/hustep-lab/ViSEC) reports 5,280 audio examples with explicit `happy`, `neutral`, `sad`, and `angry` labels, plus speaker, gender, accent, and duration metadata. Its card declares CC BY 4.0 and lists the audio and emotion columns. The card is maintained under the HuSTeP lab account and cites the same ViSEC paper as the original author repository. However, Hugging Face returned HTTP 401 in this research session, and the official Drive link returned HTTP 404 on the local user's machine, so this dataset is not currently a usable source here.

The dataset author's [official ViSEC repository](https://github.com/thanhpv2102/ViSEC) links a separate [Google Drive archive](https://drive.google.com/file/d/1wAK6XcQBZgusyB8sDxlmuC3GhWbNUqCM/view?usp=sharing) containing `visec.zip` (WAV folder) and `data.csv` (labels). That README does not state a license for the Drive archive. The HuSTeP card's CC BY 4.0 declaration is clear for the Hugging Face-hosted dataset, but treating a separately hosted Drive copy as covered requires assuming it is the identical licensed artifact. Both delivery paths are currently blocked here; the public card is useful evidence of labels and terms but not a verified working download.

Retrieve through the dataset API:

```python
from datasets import load_dataset

ds = load_dataset("hustep-lab/ViSEC", split="train")
rows = [row for row in ds if row["emotion"] in {"happy", "sad", "angry"}]
# row["audio"] contains the decoded clip; row["emotion"] is its label.
```

The GitHub repository confirms the Drive archive structure, but does not state a separate license for that archive.

### Public demo audio — FastSpeechStyle

The authors' [FastSpeechStyle demo](https://v-nhandt21.github.io/FastspeechStyle/) is currently the practical Vietnamese listening option. It shows seven Vietnamese text prompts and side-by-side baseline/proposed synthesized WAVs for four target emotion labels: `sad`, `happy`, `neutral`, and `angry`. The page links public WAVs directly. For the first prompt (`008653`), the proposed-model clips are:

| Target label | Direct WAV |
| --- | --- |
| Sad | [008653.wav](https://v-nhandt21.github.io/FastspeechStyle/html/audio/fastspeech2style_conformer_sad/008653.wav) |
| Happy | [008653.wav](https://v-nhandt21.github.io/FastspeechStyle/html/audio/fastspeech2style_conformer_happy/008653.wav) |
| Neutral | [008653.wav](https://v-nhandt21.github.io/FastspeechStyle/html/audio/fastspeech2style_conformer_neutral/008653.wav) |
| Angry | [008653.wav](https://v-nhandt21.github.io/FastspeechStyle/html/audio/fastspeech2style_conformer_angry/008653.wav) |

All four direct WAV endpoints returned HTTP 200 to metadata `HEAD` requests (no audio was downloaded). These are synthesized examples labeled by their target condition, not naturally spoken emotion samples or neutral originals with verified human emotion labels. The demo's GitHub repo and page do not state a license for the audio assets; use the web player for private sensory audition and do not rehost or redistribute the files. The README/page also provides no transcript-aligned emotion judgments beyond the target labels.

### Leads that do not currently provide usable public clips

The [VNEMOS paper record](https://scholar.vnu.edu.vn/entities/publication/c738af7e-7263-442e-9bd2-ae06bf1bbf22) describes 250 human-reviewed Vietnamese clips across anger, happiness, sadness, neutral, and anxiety. Its `bit.ly/VNEMOS` pointer currently redirects to a public [Google Sheet](https://docs.google.com/spreadsheets/d/1MhAdICuP7eQ1RVSXu_PJSnpI-Mp5bnlNuqqfp38eSHw/edit?usp=sharing) containing aggregate counts and durations, not the audio files or per-clip links. The paper describes most source speech as actor performances from films/series and some from live shows; it does not establish reuse rights for those source recordings. This is a promising lead for a later author request, but not a ready download.

The [SentiV benchmark card](https://huggingface.co/ducdatit2002/sentiv) documents six explicit speech labels (`Anger` including scarce disgust, `Enjoyment`, `Fear`, `Neutral`, `Sadness`, `Surprise`) over VietSpeech audio. It requires manually granted research access and instructs users to retrieve the raw audio from VietSpeech under that source's license, so it is not open immediate access. SentiV releases the labels/manifests, not the raw audio.

## Mandarin Chinese — CDESD

The [2026 CDESD paper and data record](https://journals.sagepub.com/doi/10.26599/BSA.2026.905026) describe a public archive of 765 Mandarin WAV clips, each 1 second, balanced across angry, happy, and neutral (255 each). The authors report 89–91% emotion-recognition accuracy in listener validation. The [OSF project](https://osf.io/ug4kb/) exposes a direct [ZIP download](https://osf.io/download/5fj24/) (`Chinese Disyllabic Emotional Speech Database.zip`, 34.7 MB, as listed by the OSF API). Inside, the filenames include the emotion category (for example `baba-cxy-angry`); the accompanying Excel file contains ratings and playback hyperlinks. The article states CC BY-NC 4.0, which permits attributed non-commercial use of the work. The article does not separately name a license for the audio archive, so keep use to this non-commercial listening benchmark and check the OSF record/author terms before redistribution or commercial use.

Download the OSF ZIP, extract it, and choose matching `-angry`, `-happy`, and `-neutral` WAVs. The words are phonologically controlled disyllables rather than conversational sentences, making the clips short and suitable for hearing prosody but less naturalistic.

For an alternative with spontaneous dialogue and seven categories, BAAI's [EmotionTalk repo](https://github.com/flageval-baai/EmotionTalk) and [Hugging Face card](https://huggingface.co/datasets/BAAI/Emotiontalk) describe 19,250 Mandarin utterances and CC BY-NC-SA 4.0. Its Hugging Face files are gated behind agreement to share contact information, and the audio tar is 14.8 GB, so it is not an immediate lightweight audition source. Another alternative, [EMOVIE](https://viem-ccy.github.io/EMOVIE/dataset_release.html), has a public archive under CC BY-NC-SA 2.0 but only polarity values (`-1`, `-0.5`, `0`, `0.5`, `1`), not categorical emotion labels.

## Japanese — HCUDB sample WAVs

The National Institute of Informatics [HCUDB page](https://www.nii.ac.jp/dsc/idr/speech/submit/HCUDB.html) offers these direct WAV samples of the repeated line “そうなんですか” (“Is that so?”):

| Label | Direct sample WAV |
| --- | --- |
| Surprise | [MA-01-G-02-3.wav](https://www.nii.ac.jp/dsc/idr/speech/submit/sample/HCUDB/MA-01-G-02-3.wav) |
| Anger | [MA-01-G-03-1.wav](https://www.nii.ac.jp/dsc/idr/speech/submit/sample/HCUDB/MA-01-G-03-1.wav) |
| Contempt | [MA-01-G-08-2.wav](https://www.nii.ac.jp/dsc/idr/speech/submit/sample/HCUDB/MA-01-G-08-2.wav) |
| Sleepy/tired | [MA-01-G-10-2.wav](https://www.nii.ac.jp/dsc/idr/speech/submit/sample/HCUDB/MA-01-G-10-2.wav) |

The corpus page says the full HCUDB contains 11 acted emotion categories and WAV audio; its permitted use is research only. Full access requires a research-purpose application, a signed undertaking, and NII approval. The sample files are linked directly for listening; the page does not state separate reuse/redistribution terms for sample-only files, so keep them for private audition and do not redistribute them.

## Korean — K-FinancialSpeech

The publisher's [Hugging Face dataset page](https://huggingface.co/datasets/dynohyuck/K-FinancialSpeech) exposes a viewer and declares CC BY-NC 4.0. It contains 1,250 short mono WAV clips at 16 kHz, with 250 clips per label: anger, anxiety, sadness, happiness, and neutral. The page states 1.01–8.67 second durations and provides label, text, scenario, and audio fields. The neutral class was also confirmed in the dataset viewer at row offset 100. These are voiced financial-service scenarios, so they are good for hearing emotion contrasts but not a broad sample of everyday Korean conversation.

The dataset card provides this download/API path:

```python
from datasets import load_dataset

ds = load_dataset("dynohyuck/K-FinancialSpeech", split="train")
rows = [row for row in ds if row["label"] in {"anger", "sadness", "happiness", "neutral"}]
# row["audio"] contains the decoded clip and row["label"] its explicit class.
```

The same record exposes audio preview in the Hugging Face dataset viewer, which is the fastest path to audition without building a separate downloader. The dataset card says labels are self-labeled with cross-check rather than multi-annotator soft labels; use the samples for perceptual familiarization, not as strong ground truth.

## Recommendation for the first listening pass

Use two contrasting clips per language, plus a neutral/reference clip where available. Match the SpeechBrain demo's WAV input convention by exporting/copying the selected clips as WAV without changing their source files. Keep the provided emotion labels in a sidecar note so the listener can first guess the emotion and then compare with the dataset label. Mandarin, Japanese, and Korean have short samples or direct dataset download paths now. For Vietnamese, the FastSpeechStyle page offers immediate synthesized emotion examples for listening; a human emotional-speech corpus with verified working access and clear audio reuse terms remains unresolved. The SpeechBrain IEMOCAP checkpoint was trained on English and its scores on these other languages should be treated as exploratory only.
