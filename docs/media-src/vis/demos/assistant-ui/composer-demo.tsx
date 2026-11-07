"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenIcon,
  GitBranchIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import {
  Composer,
  ComposerActions,
  ComposerAttachButton,
  ComposerAttachmentChip,
  ComposerAttachments,
  ComposerBar,
  ComposerCommandItem,
  ComposerContext,
  ComposerInput,
  ComposerMenu,
  ComposerModelItem,
  ComposerModelTrigger,
  ComposerPersonItem,
  ComposerSend,
  ComposerToolbar,
  ComposerVoice,
  ComposerVoiceButton,
  applyMention,
  useMentionMatches,
  useSlashMatches,
  type ComposerAttachment,
  type ComposerCommand,
  type ComposerModel,
  type ComposerPerson,
} from "../../assistant-ui/elements/composer";
import { useElapsed } from "../../assistant-ui/use-demo";

const COMMANDS: ComposerCommand[] = [
  { name: "review", description: "审阅当前差异", icon: SearchIcon },
  { name: "explain", description: "解释选中的内容", icon: BookOpenIcon },
  { name: "branch", description: "新建分支", icon: GitBranchIcon },
  { name: "improve", description: "建议改进", icon: SparklesIcon },
];

const PEOPLE: ComposerPerson[] = [
  { name: "小玛", role: "human" },
  { name: "小麦", role: "agent" },
  { name: "阿岱", role: "agent" },
  { name: "安娜", role: "human" },
];

const MODELS: ComposerModel[] = [
  { name: "Fable 5.1", meta: "1M ctx" },
  { name: "Opus 5.5", meta: "1M ctx" },
  { name: "Haiku 4.5", meta: "200k ctx" },
];

const TRANSCRIPT = "总结本周的审阅讨论";

export function ComposerDemo() {
  const [value, setValue] = useState("");
  const [model, setModel] = useState("Fable 5.1");
  const [modelOpen, setModelOpen] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [voice, setVoice] = useState<"idle" | "recording" | "transcribing">(
    "idle",
  );
  const elapsedTenths = useElapsed(voice === "recording");
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(settle.current), []);

  const slashMatches = useSlashMatches(value, COMMANDS);
  const mentionMatches = useMentionMatches(value, PEOPLE);
  const active = voice !== "idle";

  const attachments: ComposerAttachment[] = [
    {
      name: "screenshot.png",
      meta: "128 KB",
      state: "done" as const,
      kind: "image" as const,
    },
  ].filter((a) => !removed.includes(a.name));

  return (
    <div className="flex w-full max-w-lg flex-col">
      <div aria-hidden className="h-40" />
      <Composer>
        <ComposerMenu open={slashMatches.length > 0}>
          {slashMatches.map((command, i) => (
            <ComposerCommandItem
              key={command.name}
              command={command}
              active={i === 0}
              onClick={() => setValue(`/${command.name} `)}
            />
          ))}
        </ComposerMenu>
        <ComposerMenu open={mentionMatches.length > 0}>
          {mentionMatches.map((person, i) => (
            <ComposerPersonItem
              key={person.name}
              person={person}
              active={i === 0}
              onClick={() => setValue(applyMention(value, person.name))}
            />
          ))}
        </ComposerMenu>
        <ComposerBar>
          {attachments.length > 0 && (
            <ComposerAttachments>
              {attachments.map((attachment) => (
                <ComposerAttachmentChip
                  key={attachment.name}
                  attachment={attachment}
                  onRemove={(name) => setRemoved((r) => [...r, name])}
                />
              ))}
            </ComposerAttachments>
          )}
          {active ? (
            <ComposerVoice
              recording={voice === "recording"}
              seconds={Math.floor(elapsedTenths / 10)}
            />
          ) : (
            <ComposerInput
              value={value}
              placeholder="输入消息"
              onChange={(event) => setValue(event.target.value)}
              onSubmit={() => {
                const command = slashMatches[0];
                if (command) {
                  setValue(`/${command.name} `);
                  return;
                }
                const person = mentionMatches[0];
                if (person) {
                  setValue(applyMention(value, person.name));
                  return;
                }
                setValue("");
              }}
            />
          )}
          <ComposerToolbar>
            <ComposerActions>
              <ComposerAttachButton onClick={() => setRemoved([])} />
              <div className="relative">
                <ComposerMenu open={modelOpen}>
                  {MODELS.map((entry) => (
                    <ComposerModelItem
                      key={entry.name}
                      entry={entry}
                      selected={entry.name === model}
                      onClick={() => {
                        setModel(entry.name);
                        setModelOpen(false);
                      }}
                    />
                  ))}
                </ComposerMenu>
                <ComposerModelTrigger
                  model={model}
                  open={modelOpen}
                  onClick={() => setModelOpen((open) => !open)}
                />
              </div>
            </ComposerActions>
            <ComposerActions>
              <ComposerContext
                usage={{ system: 12, tools: 8, messages: 54, total: 200 }}
              />
              <ComposerVoiceButton
                active={active}
                onClick={() => {
                  if (voice === "idle") {
                    setVoice("recording");
                    return;
                  }
                  // already settling: a third click must not stack a second timer
                  if (voice === "transcribing") return;
                  setVoice("transcribing");
                  settle.current = setTimeout(() => {
                    setVoice("idle");
                    setValue((v) => (v ? `${v} ${TRANSCRIPT}` : TRANSCRIPT));
                  }, 1400);
                }}
              />
              <ComposerSend
                streaming={false}
                idle={value.length === 0}
                onClick={() => setValue("")}
              />
            </ComposerActions>
          </ComposerToolbar>
        </ComposerBar>
      </Composer>
    </div>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <ComposerDemo />
      </div>
    </AssistantPreview>
  );
}
