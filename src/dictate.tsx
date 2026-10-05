import { showHUD, Clipboard, getPreferenceValues } from "@raycast/api";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink, writeFile } from "fs/promises";
import {
  LAST_TRANSCRIPTION_FILE,
  REFORMULATED_FILE,
  checkMistralResponse,
  callReformulate,
  findSox,
  showErrorHUD,
} from "./shared";

const PID_FILE = join(tmpdir(), "voxtral_rec.pid");
const AUDIO_FILE = join(tmpdir(), "voxtral_rec.wav");

async function getRecordingPid(): Promise<number | null> {
  try {
    const pid = parseInt(await readFile(PID_FILE, "utf-8"), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    await unlink(PID_FILE).catch(() => {});
    return null;
  }
}

async function transcribe(audioPath: string, apiKey: string): Promise<string> {
  const fileBuffer = await readFile(audioPath);
  const blob = new Blob([fileBuffer], { type: "audio/wav" });

  const form = new FormData();
  form.append("file", blob, "recording.wav");
  form.append("model", "voxtral-mini-latest");

  const response = await fetch(
    "https://api.mistral.ai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );

  await checkMistralResponse(response);
  const result = (await response.json()) as { text: string };
  return result.text;
}

export default async function Command() {
  const recPath = findSox("rec");
  if (!recPath) {
    await showHUD("SoX not found. Run: brew install sox");
    return;
  }

  const pid = await getRecordingPid();

  if (pid === null) {
    const proc = spawn(
      recPath,
      ["-q", "-c", "1", "-b", "16", AUDIO_FILE, "rate", "16000"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    proc.unref();

    if (proc.pid) {
      await writeFile(PID_FILE, String(proc.pid), "utf-8");
      await showHUD("Recording... Press shortcut again to stop");
    } else {
      await showHUD("Failed to start recording");
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
    await unlink(PID_FILE).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 500));
    await showHUD("Transcribing...");

    try {
      const { apiKey, autoReformulate, reformulatePrompt } =
        getPreferenceValues<Preferences.Dictate>();
      const text = await transcribe(AUDIO_FILE, apiKey);

      if (!text || text.trim().length === 0) {
        await showHUD("No speech detected");
        return;
      }

      let textToPaste = text;

      if (autoReformulate) {
        await showHUD("Reformulating...");
        const systemPrompt = reformulatePrompt;
        const reformulated = await callReformulate(text, apiKey, systemPrompt);
        textToPaste = reformulated;
        await Promise.all([
          writeFile(LAST_TRANSCRIPTION_FILE, text, "utf-8"),
          writeFile(REFORMULATED_FILE, reformulated, "utf-8"),
        ]);
      } else {
        await Promise.all([
          writeFile(LAST_TRANSCRIPTION_FILE, text, "utf-8"),
          unlink(REFORMULATED_FILE).catch(() => {}),
        ]);
      }

      await Clipboard.paste(textToPaste);
      await showHUD("Pasted!");
    } catch (e) {
      await showErrorHUD(e);
    } finally {
      await unlink(AUDIO_FILE).catch(() => {});
    }
  }
}
