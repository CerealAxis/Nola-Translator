"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useState } from "react";
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
  ComposerBar,
  ComposerCommandItem,
  ComposerInput,
  ComposerMenu,
  ComposerSend,
  ComposerToolbar,
  useSlashMatches,
  type ComposerCommand,
} from "../../assistant-ui/elements/composer";

const COMMANDS: ComposerCommand[] = [
  { name: "review", description: "审阅当前差异", icon: SearchIcon },
  { name: "explain", description: "解释选中的内容", icon: BookOpenIcon },
  { name: "branch", description: "新建分支", icon: GitBranchIcon },
  { name: "improve", description: "建议改进", icon: SparklesIcon },
];

export function ComposerSlashDemo() {
  const [value, setValue] = useState("/");
  const matches = useSlashMatches(value, COMMANDS);

  return (
    <div className="flex w-full max-w-lg flex-col">
      <div aria-hidden className="h-44" />
      <Composer>
        <ComposerMenu open={matches.length > 0}>
          {matches.map((command, i) => (
            <ComposerCommandItem
              key={command.name}
              command={command}
              active={i === 0}
              onClick={() => setValue(`/${command.name} `)}
            />
          ))}
        </ComposerMenu>
        <ComposerBar>
          <ComposerInput
            value={value}
            placeholder="输入消息"
            onChange={(event) => setValue(event.target.value)}
            onSubmit={() => {
              const command = matches[0];
              setValue(command ? `/${command.name} ` : "");
            }}
          />
          <ComposerToolbar>
            <ComposerActions>
              <ComposerAttachButton onClick={() => undefined} />
            </ComposerActions>
            <ComposerActions>
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
        <ComposerSlashDemo />
      </div>
    </AssistantPreview>
  );
}
