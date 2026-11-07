"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  ImageGallery,
  type GalleryImage,
} from "../../assistant-ui/elements/image-gallery";

const IMAGES: readonly GalleryImage[] = [
  {
    id: "inconvo",
    src: new URL("../../assistant-ui/early/assets/inconvo.png", import.meta.url).href,
    alt: "Inconvo 回答数据库中的问题",
    caption: "构建人工智能代理来回答数据库中的问题。",
    source: { label: "Inconvo", url: "https://inconvo.com/" },
  },
  {
    id: "helicone",
    src: new URL("../../assistant-ui/early/assets/helicone.png", import.meta.url).href,
    alt: "Helicone 的可观测性仪表板",
    caption: "开源大模型可观测与网关平台。",
    source: { label: "Helicone", url: "https://www.helicone.ai/" },
  },
  {
    id: "open-canvas",
    src: new URL("../../assistant-ui/early/assets/open-canvas.png", import.meta.url).href,
    alt: "Open Canvas 将文档编辑器和聊天并排显示",
    caption: "支持 AI 的开源协作写作界面。",
    source: { label: "Open Canvas", url: "https://opencanvas.langchain.com/" },
  },
  {
    id: "stockbroker",
    src: new URL("../../assistant-ui/early/assets/stockbroker.png", import.meta.url).href,
    alt: "LangGraph 股票经纪人确认交易",
    caption: "用于研究上市公司财务的人工智能助手。",
    source: {
      label: "LangGraph 股票经纪人",
      url: "https://assistant-ui-stockbroker.vercel.app/",
    },
  },
  {
    id: "coreviz",
    src: new URL("../../assistant-ui/early/assets/coreviz.png", import.meta.url).href,
    alt: "CoreViz 搜索照片库",
    caption: "使用自然语言搜索和分析照片和视频。",
    source: { label: "CoreViz", url: "https://coreviz.io/" },
  },
];

export function ImageGalleryDemo() {
  return <ImageGallery images={IMAGES} maxVisible={3} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><ImageGalleryDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
