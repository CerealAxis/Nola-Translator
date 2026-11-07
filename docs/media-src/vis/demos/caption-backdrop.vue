<script setup lang="ts">
import filmFrame from '../../scene-video-frame.jpg'
</script>

<template>
  <div class="caption-comparison" role="group" aria-label="同一字幕的衬底对照">
    <figure v-for="backed in [false, true]" :key="String(backed)">
      <div class="film-frame">
        <img :src="filmFrame" alt="影片画面中，人物和机械臂站在栏杆旁" width="1920" height="800" />
        <div class="caption-track" :class="{ backed }">
          <span lang="en">You're a jerk, Thom.</span>
          <span lang="zh-CN">你真是个混蛋，Thom。</span>
        </div>
      </div>
      <figcaption>{{ backed ? '黑色衬底，72% 不透明度' : '透明衬底' }}</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.caption-comparison {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: 1rem;
  margin-block: 1rem;
}
.caption-comparison figure { min-width: 0; margin: 0; }
.film-frame { position: relative; aspect-ratio: 16 / 9; overflow: hidden; }
.film-frame img { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.caption-track {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 12%;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  padding: .15rem .5rem;
  color: white;
  font: 500 1rem/1.45 system-ui, sans-serif;
  text-align: center;
}
.caption-track span { display: block; }
.caption-track.backed { background: rgb(0 0 0 / 72%); }
figcaption { margin-block-start: .4rem; color: var(--vp-c-text-2); font-size: .875rem; }
</style>
