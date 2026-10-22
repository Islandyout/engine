import * as THREE from "three";
import { SampleBank } from "../sampleBank";
import { soundCatalog } from "../../scene/soundCatalog";
import { AudioMixer, FootstepTracker, type Bus } from "../audioMixer";
import { EntityField } from "../bridgeFields";
import { Music } from "../music";
import { Sfx } from "../sfx";
import type { Ctx } from "./context";

export function installAudio(C: Ctx): void {
  function audioMixer(): AudioMixer {
    if (!C.mixer) {
      C.mixer = new AudioMixer(getAudioContext());
      C.mixer.setPlayerVolumes(C.playerSettings.master, C.playerSettings.music, C.playerSettings.sfx);
    }
    return C.mixer;
  }

  function sounds(): Sfx {
    if (!C.sfx) {
      C.sfx = new Sfx(getAudioContext(), audioMixer().buses.sfx);
      // The recorded layer loads in the background; until it has, the synthesized voices play alone.
      const bank = new SampleBank(getAudioContext());
      C.sfx.samples = bank;
      void bank.load();
    }
    return C.sfx;
  }

  // A synthesized voice played at a world position.
  function soundsAt(point: THREE.Vector3, volume = 1): Sfx {
    const occluded =
      audioMixer().occlusion && C.runtime._editor_line_blocked(C.listenerPosition.x, C.listenerPosition.y, C.listenerPosition.z, point.x, point.y + 0.3, point.z) === 1;
    return sounds().at(audioMixer().source("sfx", point, { occluded, volume }).input);
  }

  // Footsteps and landings for controller players and soldiers.
  function playMovementSounds(dt: number) {
    if (C.playerIndex >= 0 && C.playerController() && C.runtime._editor_alive(C.playerIndex)) {
      const speed = C.runtime._editor_controller_value(C.playerIndex, 4);
      const grounded = C.runtime._editor_controller_value(C.playerIndex, 2) === 1;
      const crouched = C.runtime._editor_controller_value(C.playerIndex, 1) === 1;
      const feet = C.runtime._editor_controller_value(C.playerIndex, 6);
      const x = C.runtime._editor_value(C.playerIndex, EntityField.x),
        z = C.runtime._editor_value(C.playerIndex, EntityField.z);
      if (C.playerSteps.step(dt, speed, grounded)) {
        const voice = C.firstPerson() ? sounds() : soundsAt(new THREE.Vector3(x, feet, z));
        voice.footstep(C.surfaceAt(x, feet, z), (crouched ? 0.35 : 0.8) * Math.min(1.3, speed / 4.5));
      }
      if (C.fpsLanding > 4) (C.firstPerson() ? sounds() : soundsAt(new THREE.Vector3(x, feet, z))).land(Math.min(1, C.fpsLanding / 12));
    }
    C.objects.forEach((object, i) => {
      if (C.runtime._editor_soldier_value(i, 0) < 0 || !C.runtime._editor_alive(i)) return;
      let entry = C.soldierSteps.get(i);
      if (!entry) C.soldierSteps.set(i, (entry = { tracker: new FootstepTracker(), previous: object.position.clone() }));
      const speed = dt > 0 ? Math.hypot(object.position.x - entry.previous.x, object.position.z - entry.previous.z) / dt : 0;
      entry.previous.copy(object.position);
      if (entry.tracker.step(dt, speed, true)) {
        const half = (C.doc.scene.resolve(C.doc.scene.eachAlive()[i] ?? { index: -1, generation: 0 }, "Scale")?.value.y ?? 1.8) / 2;
        const feet = new THREE.Vector3(object.position.x, object.position.y - half, object.position.z);
        soundsAt(feet, 0.9).footstep(C.surfaceAt(feet.x, feet.y, feet.z), 0.9);
      }
    });
  }

  function updateMusic() {
    if (C.musicMood !== "off" && !C.music && C.audioContext) {
      C.music = new Music(C.audioContext, audioMixer().buses.music);
      C.music.setMood(C.musicMood);
    }
    C.music?.update();
  }

  function getAudioContext(): AudioContext {
    C.audioContext ??= new AudioContext();
    return C.audioContext;
  }

  function soundEntry(clipId: number) {
    return soundCatalog.find((s) => s.id === clipId);
  }

  function loadSoundBuffer(clipId: number): Promise<AudioBuffer> | undefined {
    const entry = soundEntry(clipId);
    if (!entry) return undefined;
    let promise = C.soundBufferPromises.get(clipId);
    if (!promise) {
      const context = getAudioContext();
      promise = fetch(entry.path)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          C.soundBuffers.set(clipId, buffer);
          return buffer;
        });
      promise.catch(() => C.soundBufferPromises.delete(clipId));
      C.soundBufferPromises.set(clipId, promise);
    }
    return promise;
  }

  function startSounds() {
    const session = ++C.playSession;
    const context = getAudioContext();
    C.doc.scene.eachAlive().forEach((entity, index) => {
      const sound = C.doc.scene.resolve(entity, "Sound");
      if (!sound?.autoplay) return;
      const play = (buffer: AudioBuffer) => {
        // An async clip load can resolve after the session that requested
        // it already ended: doc.mode catches "stopped, never replayed";
        // playSession catches "stopped, then replayed before this settled".
        if (session !== C.playSession) return;
        if (C.doc.mode !== "play" && C.doc.mode !== "pause") return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = sound.loop;
        const position = sound.spatial ? C.objects[index]?.position : undefined;
        const { input, panner } = audioMixer().source(sound.bus.toLowerCase() as Bus, position, {
          volume: sound.volume,
          refDistance: sound.minDistance,
          maxDistance: sound.maxDistance,
        });
        source.connect(input);
        source.start();
        C.activeSounds.set(index, source);
        if (panner) C.activePanners.set(index, panner);
      };
      const cached = C.soundBuffers.get(sound.clip);
      if (cached) play(cached);
      else loadSoundBuffer(sound.clip)?.then(play, (error) => C.log(`Sound clip ${sound.clip} failed to load: ${String(error)}`));
    });
  }

  // A one-shot from a script's sound.play(clip): `clip` is a catalog id
  // ("10") or name, matched case-insensitively, exactly or as a prefix
  // ("coin" plays "Coin Pickup").
  function playOneShot(clip: string, position?: THREE.Vector3, volume = 1) {
    const wanted = clip.trim().toLowerCase();
    // Sound captions (a setting): what was heard, for a player who cannot hear it.
    if (C.playerSettings.captions && volume > 0.05 && !wanted.startsWith("sfx:footstep")) {
      const text = `[${wanted.replace(/^sfx:/, "").replace(/:.*$/, "")}]`;
      if (C.captions[C.captions.length - 1]?.text !== text || performance.now() - C.captions[C.captions.length - 1]!.at > 600) C.captions.push({ text, at: performance.now() });
      if (C.captions.length > 3) C.captions.shift();
    }
    // "sfx:<name>" plays a synthesized sound.
    if (wanted.startsWith("sfx:")) {
      const voice = position ? soundsAt(position, volume) : sounds();
      const [name = "", detail = ""] = wanted.slice(4).split(":");
      if (name === "gunshot") voice.gunshot(detail || "rifle", position ? 1 : volume);
      else if (name === "explosion") voice.explosion(position ? 1 : volume);
      else if (name === "impact") voice.impact(detail === "flesh", position ? 1 : volume);
      else if (name === "footstep") voice.footstep(detail === "grass" ? "grass" : "hard", position ? 1 : volume);
      else if (name === "reload") voice.reload(1.5, position ? 1 : volume);
      else if (name === "click") voice.dryFire(position ? 1 : volume);
      else if (name === "hit") voice.hitmarker(detail === "kill", position ? 1 : volume);
      else C.log(`sound.play: no synthesized sound "${name}"`);
      return;
    }
    const entry =
      soundCatalog.find((s) => String(s.id) === wanted) ??
      soundCatalog.find((s) => s.name.toLowerCase() === wanted) ??
      soundCatalog.find((s) => s.name.toLowerCase().startsWith(wanted));
    if (!entry) {
      C.log(`sound.play: no clip called "${clip}"`);
      return;
    }
    const session = C.playSession;
    const context = getAudioContext();
    const play = (buffer: AudioBuffer) => {
      if (session !== C.playSession || C.doc.mode !== "play") return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(audioMixer().source("sfx", position, { volume }).input);
      source.start();
    };
    const cached = C.soundBuffers.get(entry.id);
    if (cached) play(cached);
    else loadSoundBuffer(entry.id)?.then(play, () => undefined);
  }

  function stopSounds() {
    for (const source of C.activeSounds.values()) {
      try {
        source.stop();
      } catch {
        // Already stopped (a non-looping clip that finished on its own).
      }
    }
    C.activeSounds.clear();
    C.activePanners.clear();
    C.stopCarSounds();
    C.spaceView?.stopAudio();
    C.music?.dispose();
    C.music = undefined;
    C.musicMood = "off";
  }
  Object.assign(C, { audioMixer, sounds, soundsAt, playMovementSounds, updateMusic, getAudioContext, startSounds, playOneShot, stopSounds });
}
