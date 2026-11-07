"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import {
  GeoMap,
  type GeoMapPlace,
  type GeoMapRoute,
} from "../../assistant-ui/elements/geo-map";

const PLACES: readonly GeoMapPlace[] = [
  {
    id: "library",
    lat: 1.2966,
    lng: 103.7764,
    label: "中央图书馆",
    description: "一个平静的开始。",
  },
  {
    id: "museum",
    lat: 1.2974,
    lng: 103.776,
    label: "大学博物馆",
    description: "穿过草坪五分钟。",
  },
  {
    id: "garden",
    lat: 1.2955,
    lng: 103.7783,
    label: "植物园大门",
    description: "路线在此结束。",
  },
];

const ROUTES: readonly GeoMapRoute[] = [
  {
    id: "library-to-museum",
    label: "图书馆步行",
    points: [
      [1.2966, 103.7764],
      [1.2974, 103.776],
    ],
  },
];

export function GeoMapDemo() {
  const [selectedId, setSelectedId] = useState("library");

  return (
    <GeoMap
      places={PLACES}
      routes={ROUTES}
      selectedId={selectedId}
      onSelect={setSelectedId}
      height={170}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><GeoMapDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
