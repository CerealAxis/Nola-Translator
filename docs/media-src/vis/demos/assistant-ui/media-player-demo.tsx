"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import {
  AudioPlayer,
  VideoPlayer,
} from "../../assistant-ui/elements/media-player";

export function AudioPlayerDemo() {
  return (
    <AudioPlayer
      src={new URL("../../assistant-ui/early/assets/c-major-arpeggio.mp3", import.meta.url).href}
      title="C大调琶音"
      durationMs={5000}
    />
  );
}

export function VideoPlayerDemo() {
  return (
    <VideoPlayer
      src={new URL("../../assistant-ui/early/assets/c-major-arpeggio.mp4", import.meta.url).href}
      title="C大调琶音、波形"
      durationMs={5000}
      className="max-w-sm"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="audio" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="audio">音频</TabsTrigger>
          <TabsTrigger value="video">视频</TabsTrigger>
        </TabsList>
        <TabsContent value="audio"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><AudioPlayerDemo /></DemoStage></div></TabsContent>
        <TabsContent value="video"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><VideoPlayerDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
