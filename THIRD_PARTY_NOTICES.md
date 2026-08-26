# Third-party notices

## Prerecorded neural voice assets

Most bundled English word clips were generated during development with the
Apache-2.0-licensed Kokoro 82M model (`af_heart`, with focused short-word voice
overrides). Edge neural voices are used for isolated letter names, Mandarin,
and a small number of short English clarity fallbacks. The game contains only
the resulting MP3 files and does not contact a speech service while it is
played. Neither Kokoro nor the MIT-licensed `edge-tts` helper is shipped in the
playable folder.

- Kokoro model: https://huggingface.co/hexgrad/Kokoro-82M
- Kokoro voices: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- Voice support reference: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
- edge-tts: https://github.com/rany2/edge-tts

The background music, **Gentle Ocean Play**, is an original programmatically composed loop
for AlphabetAndThings. It does not use or imitate the melody of “Baby Shark”.
