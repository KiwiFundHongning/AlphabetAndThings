# Third-party notices

## Prerecorded neural voice assets

The bundled pronunciation clips were generated during development with
`en-US-AnaNeural` for English and `zh-CN-XiaoyiNeural` for Mandarin Chinese.
The game contains only the resulting MP3 files and does not contact a speech
service while it is played. The development helper uses the MIT-licensed
`edge-tts` package; that package is not shipped in the playable folder.

- Voice support reference: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
- edge-tts: https://github.com/rany2/edge-tts

## Kokoro-82M-v1.1-zh fallback generator

The project also keeps an optional local fallback generator using
`hexgrad/Kokoro-82M-v1.1-zh`, an 82-million-parameter text-to-speech model released under
the Apache License 2.0. The model weights are not included in or downloaded by the game.

- Model: https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh
- License: https://www.apache.org/licenses/LICENSE-2.0

The background music, **Gentle Ocean Play**, is an original programmatically composed loop
for AlphabetAndThings. It does not use or imitate the melody of “Baby Shark”.
