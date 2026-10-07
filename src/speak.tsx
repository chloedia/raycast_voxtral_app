import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Detail,
  getPreferenceValues,
  Icon,
  LocalStorage,
  PopToRootType,
} from "@raycast/api";
import { ChildProcess, execFileSync, spawn } from "child_process";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { useEffect, useRef, useState } from "react";
import { checkMistralResponse, findSox } from "./shared";

const AUDIO_FILE = join(tmpdir(), "voxtral_speak.mp3");
const FIRST_CHUNK_CHARS = 150;
const CHUNK_CHARS = 1000;
const SPEEDS = [
  { rate: 1, key: "1" },
  { rate: 1.5, key: "2" },
  { rate: 2, key: "3" },
  { rate: 3, key: "4" },
] as const;

function isFrench(text: string): boolean {
  try {
    const language = execFileSync("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      'function run(a){ObjC.import("NaturalLanguage");const r=$.NLLanguageRecognizer.alloc.init;r.setLanguageConstraints($(["fr","en"]));r.processString(a[0]);return ObjC.unwrap(r.dominantLanguage)||""}',
      "--",
      text.slice(0, 1000),
    ]);
    return language.toString().trim() === "fr";
  } catch {
    return false;
  }
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" });
  for (const { segment } of sentences.segment(text)) {
    const limit = Math.min(CHUNK_CHARS, FIRST_CHUNK_CHARS * 3 ** chunks.length);
    if (current.trim() && current.length + segment.length > limit) {
      chunks.push(current.trim());
      current = "";
    }
    current += segment;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export default function Command() {
  const [status, setStatus] = useState("Generating speech...");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const restartRef = useRef<(() => void) | undefined>(undefined);

  const changeSpeed = (rate: number) => {
    speedRef.current = rate;
    setSpeed(rate);
    LocalStorage.setItem("speed", rate);
    restartRef.current?.();
  };

  useEffect(() => {
    const controller = new AbortController();
    let player: ChildProcess | undefined;

    (async () => {
      try {
        const playPath = findSox("play");
        if (!playPath) return setStatus("SoX not found. Run: brew install sox");
        const savedSpeed = await LocalStorage.getItem<number>("speed");
        if (savedSpeed) {
          speedRef.current = savedSpeed;
          setSpeed(savedSpeed);
        }

        const clipboardText = (await Clipboard.readText())?.trim();
        if (!clipboardText) return setStatus("Clipboard is empty");
        setText(clipboardText);

        const { apiKey, frenchVoice, englishVoice } =
          getPreferenceValues<Preferences.Speak>();
        const voice = isFrench(clipboardText) ? frenchVoice : englishVoice;

        const synthesize = async (input: string) => {
          const response = await fetch(
            "https://api.mistral.ai/v1/audio/speech",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "voxtral-mini-tts-latest",
                input,
                voice_id: voice,
                response_format: "mp3",
              }),
              signal: controller.signal,
            },
          );
          await checkMistralResponse(response);
          const { audio_data } = (await response.json()) as {
            audio_data: string;
          };
          return Buffer.from(audio_data, "base64");
        };

        const play = async (audio: Buffer) => {
          await writeFile(AUDIO_FILE, audio);
          controller.signal.throwIfAborted();
          await new Promise<void>((resolve, reject) => {
            let offset = 0;
            const start = () => {
              const rate = speedRef.current;
              const startedAt = Date.now();
              const tempo = rate === 1 ? [] : ["tempo", "-s", String(rate)];
              const current = spawn(
                playPath,
                ["-q", AUDIO_FILE, "trim", String(offset), ...tempo],
                { stdio: "ignore" },
              );
              player = current;
              restartRef.current = () => {
                offset += ((Date.now() - startedAt) / 1000) * rate;
                current.removeAllListeners("exit");
                current.kill();
                start();
              };
              current.on("exit", (code) => {
                restartRef.current = undefined;
                if (code === 0) resolve();
                else reject(new Error("Playback stopped"));
              });
            };
            start();
          });
        };

        const chunks = splitIntoChunks(clipboardText);
        let next = synthesize(chunks[0]);
        for (let i = 0; i < chunks.length; i++) {
          const audio = await next;
          if (i + 1 < chunks.length) {
            next = synthesize(chunks[i + 1]);
            next.catch(() => {});
          }
          setStatus(`Speaking ${i + 1}/${chunks.length}`);
          await play(audio);
        }
        controller.signal.throwIfAborted();
        await closeMainWindow({ popToRootType: PopToRootType.Immediate });
      } catch (e) {
        if (!controller.signal.aborted) {
          setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();

    return () => {
      controller.abort();
      player?.kill();
    };
  }, []);

  const speedIndex = SPEEDS.findIndex(({ rate }) => rate === speed);
  const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length].rate;

  return (
    <Detail
      navigationTitle={`Speed x${speed}`}
      isLoading={status === "Generating speech..."}
      markdown={`**${status}** · x${speed} · Esc to stop\n\n${text}`}
      actions={
        <ActionPanel>
          <Action
            title={`Read at X${nextSpeed}`}
            icon={Icon.Gauge}
            onAction={() => changeSpeed(nextSpeed)}
          />
          {SPEEDS.map(({ rate, key }) => (
            <Action
              key={rate}
              title={`Speed X${rate}`}
              icon={rate === speed ? Icon.CheckCircle : Icon.Circle}
              shortcut={{ modifiers: ["cmd"], key }}
              onAction={() => changeSpeed(rate)}
            />
          ))}
        </ActionPanel>
      }
    />
  );
}
