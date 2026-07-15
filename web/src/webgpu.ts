import { WebGPURenderer, type WebGPURendererParameters } from "three/webgpu";

export const createWebGpuRenderer = async (props: object) => {
  const renderer = new WebGPURenderer(props as WebGPURendererParameters);
  await renderer.init();
  return renderer;
};
