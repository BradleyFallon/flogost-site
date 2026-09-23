import {
  builtInPresets,
  decodePreset,
  defaultSettings,
  encodePreset,
  patternToString,
  sanitizePattern,
  sanitizePreset,
  sanitizeSettings,
  type SpringBallsPreset,
  type SpringBallsSettings,
  type StoredPreset,
} from "../lib/spring-balls-presets";

const STORAGE_KEY = "flogost.spring-balls.presets.v1";
const MAX_LOCAL_PRESETS = 30;
const roots = document.querySelectorAll<HTMLElement>("[data-spring-balls]");

roots.forEach((root) => {
  const required = <T extends Element>(selector: string) => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Spring Balls is missing ${selector}`);
    return element;
  };

  const canvas = required<HTMLCanvasElement>(".spring-stage");
  const context = canvas.getContext("2d")!;
  if (!context) return;

  const stageFrame = required<HTMLElement>(".spring-stage-frame");
  const anchors = Array.from(root.querySelectorAll<SVGCircleElement>(".spring-anchors circle"));
  const anchorsLayer = required<SVGSVGElement>(".spring-anchors");
  const beatLabel = required<HTMLElement>("[data-beat-label]");
  const presetSelect = required<HTMLSelectElement>("[data-preset-select]");
  const presetName = required<HTMLInputElement>("[data-preset-name]");
  const presetState = required<HTMLElement>("[data-preset-state]");
  const status = required<HTMLElement>("[data-status]");
  const importFile = required<HTMLInputElement>("[data-import-file]");
  const pauseButton = required<HTMLButtonElement>("[data-action='pause']");
  const deleteButton = required<HTMLButtonElement>("[data-action='delete-preset']");
  const reverseButton = required<HTMLButtonElement>("[data-action='reverse']");

  let currentSettings = sanitizeSettings(defaultSettings);
  let currentPresetName = "Orbit";
  let selectedLocalId: string | null = null;
  let isDirty = false;
  let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pageVisible = !document.hidden;

  const centerX = 100;
  const centerY = 100;
  const orbit = 35;
  const radius = 25;
  const initialOffsets = [0, Math.PI * 2 / 3, Math.PI * 4 / 3];
  const breatheStiffness = 180;
  const breatheDamping = 2 * Math.sqrt(breatheStiffness);

  let angle = 0;
  let angularVelocity = 0;
  let targetAngle = 0;
  let breatheOffset = 0;
  let breatheVelocity = 0;
  let beatAccumulator = 0;
  let beatCount = 0;

  type Ball = { offset: number; x: number; y: number; velocityX: number; velocityY: number };
  let balls: Ball[] = [];

  type PatternState = { list: number[]; index: number; remaining: number };
  const makePattern = (list: number[]): PatternState => ({ list: [...list], index: 0, remaining: list[0] });
  const patterns = {
    scramble: makePattern(currentSettings.scramblePattern),
    kick: makePattern(currentSettings.kickPattern),
    breathe: makePattern(currentSettings.breathePattern),
    inversion: makePattern(currentSettings.inversionPattern),
  };

  function announce(message: string) {
    status.textContent = message;
  }

  function readLocalPresets(): StoredPreset[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item): StoredPreset[] => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Partial<StoredPreset>;
        const preset = sanitizePreset(candidate.preset);
        if (!preset || typeof candidate.id !== "string" || typeof candidate.createdAt !== "string") return [];
        return [{ id: candidate.id, createdAt: candidate.createdAt, preset }];
      }).slice(0, MAX_LOCAL_PRESETS);
    } catch {
      return [];
    }
  }

  function writeLocalPresets(presets: StoredPreset[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_LOCAL_PRESETS)));
  }

  function refreshPresetSelect(preferredValue?: string) {
    const previous = preferredValue ?? presetSelect.value;
    presetSelect.replaceChildren();

    const builtInGroup = document.createElement("optgroup");
    builtInGroup.label = "Built in";
    builtInPresets.forEach(({ id, preset }) => {
      const option = document.createElement("option");
      option.value = `built-in:${id}`;
      option.textContent = preset.name;
      builtInGroup.append(option);
    });
    presetSelect.append(builtInGroup);

    const saved = readLocalPresets();
    if (saved.length) {
      const savedGroup = document.createElement("optgroup");
      savedGroup.label = "Saved in this browser";
      saved.forEach((item) => {
        const option = document.createElement("option");
        option.value = `local:${item.id}`;
        option.textContent = item.preset.name;
        savedGroup.append(option);
      });
      presetSelect.append(savedGroup);
    }

    const values = Array.from(presetSelect.options).map((option) => option.value);
    presetSelect.value = values.includes(previous) ? previous : "built-in:orbit";
  }

  function resetPattern(pattern: PatternState, list: number[]) {
    pattern.list = [...list];
    pattern.index = 0;
    pattern.remaining = pattern.list[0];
  }

  function resetPhysics() {
    angle = 0;
    angularVelocity = 0;
    targetAngle = 0;
    breatheOffset = 0;
    breatheVelocity = 0;
    beatAccumulator = 0;
    beatCount = 0;
    balls = initialOffsets.map((offset) => ({
      offset,
      x: centerX + orbit * Math.cos(offset),
      y: centerY + orbit * Math.sin(offset),
      velocityX: 0,
      velocityY: 0,
    }));
    resetPattern(patterns.scramble, currentSettings.scramblePattern);
    resetPattern(patterns.kick, currentSettings.kickPattern);
    resetPattern(patterns.breathe, currentSettings.breathePattern);
    resetPattern(patterns.inversion, currentSettings.inversionPattern);
    beatLabel.textContent = "Beat 000";
    clearStage();
  }

  function formatOutput(key: keyof SpringBallsSettings, value: number) {
    if (key === "bpm") return `${Math.round(value)} BPM`;
    if (key === "rotationDegrees") return `${Math.round(value)}°`;
    if (key === "rotationVariance") return `±${Math.round(value)}°`;
    if (["triangleDamping", "triangleInertia", "ballDamping", "ballMass"].includes(key)) {
      return value.toFixed(1);
    }
    return String(Math.round(value));
  }

  function syncControls() {
    root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
      const key = input.dataset.setting as keyof SpringBallsSettings;
      const value = currentSettings[key];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    });
    root.querySelectorAll<HTMLInputElement>("[data-pattern]").forEach((input) => {
      const key = input.dataset.pattern as keyof SpringBallsSettings;
      input.value = patternToString(currentSettings[key] as number[]);
      input.removeAttribute("aria-invalid");
    });
    root.querySelectorAll<HTMLOutputElement>("[data-output]").forEach((output) => {
      const key = output.dataset.output as keyof SpringBallsSettings;
      output.value = formatOutput(key, currentSettings[key] as number);
    });
    reverseButton.textContent = `Direction: ${currentSettings.direction === 1 ? "clockwise" : "counterclockwise"}`;
    pauseButton.textContent = userPaused ? "Play" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(userPaused));
  }

  function updatePresetHeading() {
    presetState.textContent = `${currentPresetName}${isDirty ? " · modified" : ""}`;
    deleteButton.disabled = !selectedLocalId;
  }

  function applyPreset(preset: SpringBallsPreset, options: { localId?: string | null; message?: string } = {}) {
    currentSettings = sanitizeSettings(preset.settings);
    currentPresetName = preset.name;
    selectedLocalId = options.localId ?? null;
    isDirty = false;
    presetName.value = preset.name;
    syncControls();
    resetPhysics();
    updatePresetHeading();
    announce(options.message ?? `${preset.name} loaded.`);
  }

  function currentPreset(): SpringBallsPreset {
    return { version: 1, name: presetName.value.trim().slice(0, 48) || currentPresetName, settings: sanitizeSettings(currentSettings) };
  }

  function markDirty() {
    isDirty = true;
    selectedLocalId = null;
    updatePresetHeading();
  }

  function resizeCanvas() {
    const rect = stageFrame.getBoundingClientRect();
    const size = Math.max(1, Math.round(rect.width));
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const resolution = Math.round(size * ratio);
    if (canvas.width === resolution && canvas.height === resolution) return;
    canvas.width = resolution;
    canvas.height = resolution;
    context.setTransform(resolution / 200, 0, 0, resolution / 200, 0, 0);
    clearStage();
  }

  function clearStage() {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#020407";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  function drawFrame() {
    context.fillStyle = `rgba(2, 4, 7, ${currentSettings.trailFade / 100})`;
    context.fillRect(0, 0, 200, 200);
    context.fillStyle = "#f1f4f3";
    balls.forEach((ball) => {
      context.beginPath();
      context.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
      context.fill();
    });
  }

  function doRotate() {
    const jitter = (Math.random() * 2 - 1) * currentSettings.rotationVariance;
    targetAngle += ((currentSettings.rotationDegrees + jitter) * Math.PI / 180) * currentSettings.direction;
  }

  function doScramble() {
    const first = Math.floor(Math.random() * 3);
    let second = Math.floor(Math.random() * 2);
    if (second >= first) second += 1;
    [balls[first].offset, balls[second].offset] = [balls[second].offset, balls[first].offset];
  }

  function doKick() {
    balls.forEach((ball) => {
      const deltaX = ball.x - centerX;
      const deltaY = ball.y - centerY;
      const distance = Math.max(Math.hypot(deltaX, deltaY), 0.001);
      ball.velocityX += deltaX / distance * currentSettings.kickStrength;
      ball.velocityY += deltaY / distance * currentSettings.kickStrength;
    });
  }

  function doBreathe() {
    breatheVelocity += currentSettings.breatheAmount;
  }

  function doInversion() {
    balls.forEach((ball) => { ball.offset = (ball.offset + Math.PI) % (Math.PI * 2); });
  }

  function triggerAndPlay(action: () => void) {
    action();
    if (userPaused) {
      userPaused = false;
      syncControls();
    }
  }

  function stepPattern(pattern: PatternState, action: () => void) {
    pattern.remaining -= 1;
    if (pattern.remaining > 0) return;
    action();
    pattern.index = (pattern.index + 1) % pattern.list.length;
    pattern.remaining = pattern.list[pattern.index];
  }

  function beat() {
    beatCount += 1;
    beatLabel.textContent = `Beat ${String(beatCount).padStart(3, "0")}`;
    doRotate();
    if (currentSettings.scrambleEnabled) stepPattern(patterns.scramble, doScramble);
    if (currentSettings.kickEnabled) stepPattern(patterns.kick, doKick);
    if (currentSettings.breatheEnabled) stepPattern(patterns.breathe, doBreathe);
    if (currentSettings.inversionEnabled) stepPattern(patterns.inversion, doInversion);
  }

  function updatePhysics(delta: number) {
    if (currentSettings.autoBeat) {
      beatAccumulator += delta;
      const interval = 60 / currentSettings.bpm;
      while (beatAccumulator >= interval) {
        beatAccumulator -= interval;
        beat();
      }
    }

    const angularAcceleration = (
      currentSettings.triangleStiffness * (targetAngle - angle)
      - currentSettings.triangleDamping * angularVelocity
    ) / currentSettings.triangleInertia;
    angularVelocity += angularAcceleration * delta;
    angle += angularVelocity * delta;

    const breatheAcceleration = -breatheStiffness * breatheOffset - breatheDamping * breatheVelocity;
    breatheVelocity += breatheAcceleration * delta;
    breatheOffset += breatheVelocity * delta;
    const liveOrbit = orbit + breatheOffset;

    const accelerations = balls.map((ball) => {
      const anchorAngle = angle + ball.offset;
      const anchorX = centerX + liveOrbit * Math.cos(anchorAngle);
      const anchorY = centerY + liveOrbit * Math.sin(anchorAngle);
      return {
        x: (currentSettings.ballStiffness * (anchorX - ball.x) - currentSettings.ballDamping * ball.velocityX) / currentSettings.ballMass,
        y: (currentSettings.ballStiffness * (anchorY - ball.y) - currentSettings.ballDamping * ball.velocityY) / currentSettings.ballMass,
      };
    });

    for (let first = 0; first < balls.length; first += 1) {
      for (let second = first + 1; second < balls.length; second += 1) {
        let deltaX = balls[first].x - balls[second].x;
        let deltaY = balls[first].y - balls[second].y;
        const distance = Math.max(Math.hypot(deltaX, deltaY), 1);
        deltaX /= distance;
        deltaY /= distance;
        let force = currentSettings.repulsion * radius * radius / (distance * distance);
        if (distance <= radius * 2) force *= 10;
        force = Math.min(force, currentSettings.repulsion * 50) * currentSettings.ballMass;
        accelerations[first].x += deltaX * force;
        accelerations[first].y += deltaY * force;
        accelerations[second].x -= deltaX * force;
        accelerations[second].y -= deltaY * force;
      }
    }

    balls.forEach((ball, index) => {
      ball.velocityX += accelerations[index].x * delta;
      ball.velocityY += accelerations[index].y * delta;
      ball.x += ball.velocityX * delta;
      ball.y += ball.velocityY * delta;
      const anchorAngle = angle + ball.offset;
      anchors[index]?.setAttribute("cx", String(centerX + liveOrbit * Math.cos(anchorAngle)));
      anchors[index]?.setAttribute("cy", String(centerY + liveOrbit * Math.sin(anchorAngle)));
    });
  }

  let previousFrame = performance.now();
  function frame(now: number) {
    const delta = Math.min((now - previousFrame) / 1000, 1 / 30);
    previousFrame = now;
    if (!userPaused && pageVisible) {
      updatePhysics(delta);
      drawFrame();
    }
    requestAnimationFrame(frame);
  }

  root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    const update = () => {
      const key = input.dataset.setting as keyof SpringBallsSettings;
      const raw = input.type === "checkbox" ? input.checked : Number(input.value);
      currentSettings = sanitizeSettings({ ...currentSettings, [key]: raw });
      const output = root.querySelector<HTMLOutputElement>(`[data-output='${key}']`);
      if (output && typeof currentSettings[key] === "number") {
        output.value = formatOutput(key, currentSettings[key] as number);
      }
      if (key.endsWith("Enabled") && input.checked) {
        const patternName = key.replace("Enabled", "") as keyof typeof patterns;
        resetPattern(patterns[patternName], currentSettings[`${patternName}Pattern` as keyof SpringBallsSettings] as number[]);
      }
      markDirty();
    };
    input.addEventListener(input.type === "range" ? "input" : "change", update);
  });

  root.querySelectorAll<HTMLInputElement>("[data-pattern]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.pattern as keyof SpringBallsSettings;
      const parsed = input.value.split(",").map((item) => Number(item.trim()));
      const valid = parsed.length > 0 && parsed.length <= 16 && parsed.every((item) => Number.isInteger(item) && item > 0 && item <= 128);
      if (!valid) {
        input.setAttribute("aria-invalid", "true");
        announce("Beat patterns must be comma-separated whole numbers from 1 to 128.");
        return;
      }
      input.removeAttribute("aria-invalid");
      const pattern = sanitizePattern(parsed, [4]);
      currentSettings = sanitizeSettings({ ...currentSettings, [key]: pattern });
      const patternName = key.replace("Pattern", "") as keyof typeof patterns;
      resetPattern(patterns[patternName], pattern);
      input.value = patternToString(pattern);
      markDirty();
      announce("Beat pattern updated.");
    });
  });

  presetSelect.addEventListener("change", () => {
    const [source, id] = presetSelect.value.split(":");
    if (source === "built-in") {
      const match = builtInPresets.find((item) => item.id === id);
      if (match) applyPreset(match.preset);
      return;
    }
    const match = readLocalPresets().find((item) => item.id === id);
    if (match) applyPreset(match.preset, { localId: match.id });
  });

  root.addEventListener("click", async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-action]");
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;

    if (action === "pause") {
      userPaused = !userPaused;
      previousFrame = performance.now();
      syncControls();
      announce(userPaused ? "Motion paused." : "Motion playing.");
    } else if (action === "restart") {
      resetPhysics();
      announce("Motion restarted with the current settings.");
    } else if (action === "rotate") {
      triggerAndPlay(doRotate);
      beatAccumulator = 0;
    } else if (action === "scramble") {
      triggerAndPlay(doScramble);
    } else if (action === "kick") {
      triggerAndPlay(doKick);
    } else if (action === "breathe") {
      triggerAndPlay(doBreathe);
    } else if (action === "inversion") {
      triggerAndPlay(doInversion);
    } else if (action === "reverse") {
      currentSettings.direction = currentSettings.direction === 1 ? -1 : 1;
      reverseButton.textContent = `Direction: ${currentSettings.direction === 1 ? "clockwise" : "counterclockwise"}`;
      markDirty();
    } else if (action === "save-preset") {
      const preset = currentPreset();
      if (!presetName.value.trim()) {
        presetName.focus();
        announce("Give the preset a name before saving.");
        return;
      }
      const saved = readLocalPresets();
      const item: StoredPreset = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        preset,
      };
      writeLocalPresets([item, ...saved]);
      currentPresetName = preset.name;
      selectedLocalId = item.id;
      isDirty = false;
      refreshPresetSelect(`local:${item.id}`);
      updatePresetHeading();
      announce(`${preset.name} saved in this browser.`);
    } else if (action === "delete-preset" && selectedLocalId) {
      const next = readLocalPresets().filter((item) => item.id !== selectedLocalId);
      writeLocalPresets(next);
      refreshPresetSelect("built-in:orbit");
      applyPreset(builtInPresets[0].preset, { message: "Saved preset deleted. Orbit loaded." });
    } else if (action === "share") {
      const preset = currentPreset();
      const url = new URL(window.location.href);
      url.hash = `preset=${encodePreset(preset)}`;
      try {
        await navigator.clipboard.writeText(url.toString());
        announce("Share link copied. Anyone with the link can load these settings.");
      } catch {
        window.location.hash = url.hash;
        announce("Share link placed in the address bar.");
      }
    } else if (action === "export") {
      const preset = currentPreset();
      const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "spring-balls"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      announce("Preset JSON exported.");
    } else if (action === "import") {
      importFile.click();
    }
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file || file.size > 16_000) {
      if (file) announce("Preset files must be smaller than 16 KB.");
      return;
    }
    try {
      const preset = sanitizePreset(JSON.parse(await file.text()));
      if (!preset) throw new Error("Invalid preset");
      applyPreset(preset, { message: `${preset.name} imported. Save it to keep it in this browser.` });
      markDirty();
    } catch {
      announce("That file is not a valid Spring Balls preset.");
    }
  });

  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    previousFrame = performance.now();
  });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(stageFrame);
  anchorsLayer.classList.toggle("is-visible", false);
  required<HTMLInputElement>("[data-show-anchors]").addEventListener("change", (event) => {
    anchorsLayer.classList.toggle("is-visible", (event.currentTarget as HTMLInputElement).checked);
  });

  refreshPresetSelect("built-in:orbit");
  const encodedPreset = new URL(window.location.href).hash.match(/^#preset=(.+)$/)?.[1];
  const sharedPreset = encodedPreset ? decodePreset(encodedPreset) : null;
  if (sharedPreset) {
    applyPreset(sharedPreset, { message: `${sharedPreset.name} loaded from a share link. Save it to keep it.` });
    isDirty = true;
    updatePresetHeading();
  } else {
    applyPreset(builtInPresets[0].preset);
    if (encodedPreset) announce("The shared preset was invalid, so Orbit was loaded instead.");
  }
  if (userPaused) announce("Motion starts paused because reduced motion is enabled.");
  resizeCanvas();
  requestAnimationFrame(frame);
});
