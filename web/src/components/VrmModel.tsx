import { useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, MToonMaterialLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import "../three-extend";

interface VrmModelProps {
  url: string;
}

export function VrmModel({ url }: VrmModelProps) {
  const vrmRef = useRef<VRM | null>(null);

  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => {
      const mtoon = new MToonMaterialLoaderPlugin(parser, { materialType: MToonNodeMaterial });
      return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin: mtoon });
    });
  });

  const vrm = gltf.userData.vrm as VRM | undefined;

  if (vrm && vrmRef.current !== vrm) {
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    vrmRef.current = vrm;
  }

  useFrame((_, delta) => {
    vrmRef.current?.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
