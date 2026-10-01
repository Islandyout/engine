# 07 — Audio and video

Manual: <https://docs.unity3d.com/Manual/Audio.html> · Video: <https://docs.unity3d.com/Manual/VideoPlayer.html>

Unity audio is built on **FMOD Core** (the low-level engine, not FMOD Studio). An audio graph rewrite ("DSPGraph" module) exists alongside it.

## 1. AudioClip import

- **Load Type** (`AudioClipLoadType`): DecompressOnLoad, CompressedInMemory, Streaming.
- **Compression format** (`AudioCompressionFormat`): PCM, Vorbis, ADPCM, MP3, AAC, plus platform codecs VAG, HEVAG, XMA, GCADPCM and ATRAC9. Quality ranges 1–100.
- **Other settings**: Force To Mono (normalize), Load In Background, Ambisonic, Preload Audio Data, sample rate setting (Preserve, Optimize, Override), and per-platform overrides.
- **Runtime API**: `AudioClip.Create` (procedural, with PCM reader/setposition callbacks), `GetData`/`SetData`, `LoadAudioData`, `loadState`, `length`, `samples`, `channels`, `frequency`.

## 2. AudioSource

- **Playback settings**: `clip`, `outputAudioMixerGroup`, `mute`, `bypassEffects`, `bypassListenerEffects`, `bypassReverbZones`, `playOnAwake`, `loop`, `priority` (0–256), `volume`, `pitch`, `panStereo`, `spatialBlend` (0 = 2D, 1 = 3D), `reverbZoneMix`.
- **3D Sound Settings**: `dopplerLevel`, `spread` (0–360°), `rolloffMode` (`AudioRolloffMode` Logarithmic, Linear, Custom), `minDistance`, `maxDistance`, and custom curves (`AudioSourceCurveType` CustomRolloff, SpatialBlend, ReverbZoneMix, Spread).
- **Spatializer**: `spatialize`, `spatializePostEffects`, `SetSpatializerFloat`.
- **Methods**:
  - Playback: `Play`, `PlayDelayed`, `PlayScheduled(dspTime)` (sample-accurate), `SetScheduledStartTime`/`EndTime`, `Stop`, `Pause`/`UnPause`.
  - One-shots and static helpers: `PlayOneShot(clip, volumeScale)`, `AudioSource.PlayClipAtPoint`.
  - Position and analysis: `time`/`timeSamples`, `GetOutputData`, `GetSpectrumData(samples, channel, FFTWindow)`. The `FFTWindow` values are Rectangular, Triangle, Hamming, Hanning, Blackman, BlackmanHarris.
  - `isVirtual`, which becomes true when a voice is culled by the voice limit.
- **Timing**: `AudioSettings.dspTime` is the audio clock used for rhythm-game sync.

```csharp
// Sample-accurate beat scheduling (illustrative)
public AudioSource[] voices; public AudioClip kick; public double bpm = 120;
double next; int i;
void Start() => next = AudioSettings.dspTime + 0.1;
void Update() {
    while (AudioSettings.dspTime + 0.2 > next) {                 // schedule 200 ms ahead
        var v = voices[i++ % voices.Length]; v.clip = kick; v.PlayScheduled(next);
        next += 60.0 / bpm;
    }
}
```

## 3. AudioListener and settings

- **AudioListener**: one per scene. `AudioListener.volume`, `pause`, `GetOutputData`, `GetSpectrumData`, and `velocityUpdateMode` (Auto, Fixed, Dynamic).
- **AudioSettings**: `speakerMode` (`AudioSpeakerMode` Mono, Stereo, Quad, Surround, Mode5point1, Mode7point1, Prologic, Mode7point1point4), `outputSampleRate`, `GetDSPBufferSize`, `GetConfiguration`/`Reset`, `OnAudioConfigurationChanged`, and the spatializer/ambisonic plugin selection.

## 4. Audio filters (components) and reverb zones

- **Filter components**: `AudioLowPassFilter` (cutoff and resonance Q, with a custom curve over distance), `AudioHighPassFilter`, `AudioEchoFilter` (delay, decay, dry/wet), `AudioDistortionFilter`, `AudioReverbFilter`, `AudioChorusFilter`. They are applied in component order on the source or the listener.
- **AudioReverbZone**: min/max distance and a reverb preset. `AudioReverbPreset` values: Off, Generic, PaddedCell, Room, Bathroom, Livingroom, Stoneroom, Auditorium, Concerthall, Cave, Arena, Hangar, CarpetedHallway, Hallway, StoneCorridor, Alley, Forest, City, Mountains, Quarry, Plain, ParkingLot, SewerPipe, Underwater, Drugged, Dizzy, Psychotic, User. It has full I3DL2 parameters.
- **Custom DSP in C#**: `OnAudioFilterRead(float[] data, int channels)`.

## 5. Audio Mixer

- **AudioMixer asset**:
  - A tree of **Groups** (Master → children), each with volume, pitch, mute/solo/bypass.
  - An effects chain per group: **Send**, **Receive**, **Duck Volume** (side-chain compression), Lowpass/Highpass (simple and resonant), Echo, Flange, Distortion, Normalize, ParamEQ, Pitch Shifter, Chorus, Compressor, SFX Reverb, Attenuation, and native audio plugins (the Native Audio Plugin SDK).
- **Snapshots**: stored mixer states. `TransitionTo(time)` moves to one, and `AudioMixer.TransitionToSnapshots(snapshots, weights, time)` blends several.
- **Views**: group visibility presets.
- **Exposed parameters**: `SetFloat("MusicVol", dB)`, `GetFloat`, `ClearFloat`.
- **Audio Mixer window**: VU meters, Edit in Play Mode, and groups routed to other mixers.

```csharp
// Volume slider → mixer (convert linear 0..1 to dB)
public AudioMixer mixer;
public void SetMusic(float linear) => mixer.SetFloat("MusicVol", Mathf.Log10(Mathf.Max(linear, 0.0001f)) * 20f);
```

## 6. Audio Random Container (6.0+)

- **Asset type**: `AudioRandomContainer`, played through an AudioSource. Editor: Window/Audio/Audio Random Container.
- **Clip list**: a list of clips with volume/pitch randomization per clip and globally, plus avoid-repeat.
- **Playback**: modes Sequential, Shuffle and Random. Triggers Manual or Automatic (pulse or offset timing), with loop modes Infinite, Clip count or Cycle count.

## 7. Spatial and immersive audio

- **Spatializer SDK**: HRTF plugins such as Meta, Steam Audio and Resonance.
- **Ambisonic decoders**: `.wav` B-format clips.
- **Audio in Timeline**: Audio tracks.
- **Microphone**: `Microphone.Start(device, loop, lengthSec, freq)`, `devices`, `GetPosition`, `IsRecording`.

## 8. Video

- **`VideoPlayer`**:
  - Source: `source` (VideoClip or Url, including StreamingAssets and HTTP).
  - Playback settings: `playOnAwake`, `waitForFirstFrame`, `isLooping`, `skipOnDrop`, `playbackSpeed`.
  - `renderMode` (`VideoRenderMode`): CameraFarPlane, CameraNearPlane, RenderTexture, MaterialOverride, APIOnly.
  - `aspectRatio` (`VideoAspectRatio`): NoScaling, FitVertically, FitHorizontally, FitInside, FitOutside, Stretch.
  - `audioOutputMode` (`VideoAudioOutputMode`): None, AudioSource, Direct, APIOnly.
  - Camera-mode settings: `targetCameraAlpha`, `targetCamera3DLayout` (stereo).
  - `timeUpdateMode`, `timeReference` (6.x).
  - Methods: `Prepare`, `Play`, `Pause`, `Stop`, `StepForward`, `frame`/`time` seeking, `frameCount`, `length`, `canSetTime`/`canStep`.
  - Events: `prepareCompleted`, `loopPointReached`, `frameReady` (with `sendFrameReadyEvents`), `errorReceived`, `seekCompleted`, `started`.
- **VideoClip import**:
  - Transcode on or off. Codecs H.264, H.265 (6.x) and VP8.
  - Other settings: dimensions, aspect, bitrate mode, spatial quality, keep alpha, deinterlace, flip, import audio, sRGB.
  - 360° and 180° video is shown with the Panoramic skybox via a RenderTexture.
- **Video in Timeline**: VideoPlayer on Control tracks. The **Recorder** package exports video.
