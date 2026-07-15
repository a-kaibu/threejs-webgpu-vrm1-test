import { useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { Box3, MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
  MToonMaterialLoaderPlugin,
  type VRM,
} from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import type { PoseFrame } from "../hooks/useWebRTC";
import "../three-extend";

interface VrmModelProps {
  url: string;
  poseFrame?: PoseFrame | null;
}

type Point = [number, number];
type ModelBounds = { height: number; centerX: number; minY: number };

const SCORE_THRESHOLD = 0.43;

function angleBetween(a: Point, b: Point): number {
  return Math.atan2(a[1] - b[1], b[0] - a[0]);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function coverPoint(point: Point, imageSize: [number, number], aspect: number): Point {
  const sourceAspect = imageSize[0] / imageSize[1];
  if (sourceAspect > aspect) {
    const width = sourceAspect / aspect;
    return [(point[0] - 0.5) * width + 0.5, point[1]];
  }
  const height = aspect / sourceAspect;
  return [point[0], (point[1] - 0.5) * height + 0.5];
}

function applyPlacement(
  vrm: VRM,
  frame: PoseFrame,
  bounds: ModelBounds,
  delta: number,
  viewport: { width: number; height: number },
  aspect: number,
): void {
  const person = frame.persons[0];
  if (!person) return;
  const { keypoints, scores } = person;
  const visible = (...indices: number[]) =>
    indices.every((index) => scores[index] >= SCORE_THRESHOLD);
  if (!visible(5, 6, 11, 12)) return;

  const shoulders = midpoint(keypoints[5], keypoints[6]);
  const hips = midpoint(keypoints[11], keypoints[12]);
  const torsoHeight = Math.max(hips[1] - shoulders[1], 0.08);
  const top = visible(0) ? keypoints[0][1] - torsoHeight * 0.35 : shoulders[1] - torsoHeight * 0.55;
  const bottom = visible(15, 16)
    ? (keypoints[15][1] + keypoints[16][1]) / 2
    : hips[1] + torsoHeight * 1.85;
  const bodyHeight = MathUtils.clamp(bottom - top, 0.3, 1.1);
  const anchor = coverPoint([hips[0], bottom], frame.image_size, aspect);
  const targetScale = MathUtils.clamp((bodyHeight * viewport.height) / bounds.height, 0.35, 2.5);
  const scale = MathUtils.damp(vrm.scene.scale.x, targetScale, 8, delta);
  const targetX = (anchor[0] - 0.5) * viewport.width - bounds.centerX * scale;
  const targetY = (0.5 - anchor[1]) * viewport.height - bounds.minY * scale;

  vrm.scene.scale.setScalar(scale);
  vrm.scene.position.x = MathUtils.damp(vrm.scene.position.x, targetX, 8, delta);
  vrm.scene.position.y = MathUtils.damp(vrm.scene.position.y, targetY, 8, delta);
}

function applyPose(vrm: VRM, frame: PoseFrame, delta: number): void {
  const damp = (boneName: (typeof VRMHumanBoneName)[keyof typeof VRMHumanBoneName], z: number) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (bone) bone.rotation.z = MathUtils.damp(bone.rotation.z, normalizeAngle(z), 14, delta);
  };

  const limbs = [
    {
      upper: VRMHumanBoneName.LeftUpperArm,
      lower: VRMHumanBoneName.LeftLowerArm,
      joints: [5, 7, 9],
      rest: 0,
    },
    {
      upper: VRMHumanBoneName.RightUpperArm,
      lower: VRMHumanBoneName.RightLowerArm,
      joints: [6, 8, 10],
      rest: Math.PI,
    },
    {
      upper: VRMHumanBoneName.LeftUpperLeg,
      lower: VRMHumanBoneName.LeftLowerLeg,
      joints: [11, 13, 15],
      rest: -Math.PI / 2,
    },
    {
      upper: VRMHumanBoneName.RightUpperLeg,
      lower: VRMHumanBoneName.RightLowerLeg,
      joints: [12, 14, 16],
      rest: -Math.PI / 2,
    },
  ] as const;

  const person = frame.persons[0];
  if (!person) {
    for (const { upper, lower } of limbs) {
      damp(upper, 0);
      damp(lower, 0);
      const upperBone = vrm.humanoid.getNormalizedBoneNode(upper);
      const lowerBone = vrm.humanoid.getNormalizedBoneNode(lower);
      if (upperBone) {
        upperBone.rotation.x = MathUtils.damp(upperBone.rotation.x, 0, 14, delta);
        upperBone.rotation.y = MathUtils.damp(upperBone.rotation.y, 0, 14, delta);
      }
      if (lowerBone) {
        lowerBone.rotation.x = MathUtils.damp(lowerBone.rotation.x, 0, 14, delta);
        lowerBone.rotation.y = MathUtils.damp(lowerBone.rotation.y, 0, 14, delta);
      }
    }
    damp(VRMHumanBoneName.Spine, 0);
    damp(VRMHumanBoneName.Chest, 0);
    damp(VRMHumanBoneName.Head, 0);
    return;
  }

  const { keypoints, scores } = person;
  const keypoints3d = person.keypoints3d;
  const visible = (...indices: number[]) =>
    indices.every((index) => scores[index] >= SCORE_THRESHOLD);
  const validSegment = (a: number, b: number) => {
    if (!visible(a, b)) return false;
    const dx = keypoints[b][0] - keypoints[a][0];
    const dy = keypoints[b][1] - keypoints[a][1];
    return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) >= 0.025;
  };

  for (const { upper, lower, joints, rest } of limbs) {
    const [root, middle, end] = joints;
    const hasUpper = validSegment(root, middle);
    const hasLower = validSegment(middle, end);
    const upperAngle = hasUpper ? angleBetween(keypoints[root], keypoints[middle]) : rest;
    const upperDepth =
      hasUpper && keypoints3d
        ? Math.atan2(
            keypoints3d[middle][2] - keypoints3d[root][2],
            Math.hypot(
              keypoints3d[middle][0] - keypoints3d[root][0],
              keypoints3d[middle][1] - keypoints3d[root][1],
            ),
          )
        : 0;
    const lowerDepth =
      hasLower && keypoints3d
        ? Math.atan2(
            keypoints3d[end][2] - keypoints3d[middle][2],
            Math.hypot(
              keypoints3d[end][0] - keypoints3d[middle][0],
              keypoints3d[end][1] - keypoints3d[middle][1],
            ),
          )
        : upperDepth;

    damp(upper, upperAngle - rest);
    damp(
      lower,
      hasUpper && hasLower ? angleBetween(keypoints[middle], keypoints[end]) - upperAngle : 0,
    );

    const upperBone = vrm.humanoid.getNormalizedBoneNode(upper);
    const lowerBone = vrm.humanoid.getNormalizedBoneNode(lower);
    const isArm = rest !== -Math.PI / 2;
    if (isArm) {
      const side = rest === 0 ? -1 : 1;
      if (upperBone)
        upperBone.rotation.y = MathUtils.damp(upperBone.rotation.y, side * upperDepth, 14, delta);
      if (lowerBone) {
        lowerBone.rotation.y = MathUtils.damp(
          lowerBone.rotation.y,
          side * (lowerDepth - upperDepth),
          14,
          delta,
        );
      }
    } else {
      if (upperBone)
        upperBone.rotation.x = MathUtils.damp(upperBone.rotation.x, -upperDepth, 14, delta);
      if (lowerBone) {
        lowerBone.rotation.x = MathUtils.damp(
          lowerBone.rotation.x,
          -(lowerDepth - upperDepth),
          14,
          delta,
        );
      }
    }
  }

  if (visible(5, 6, 11, 12)) {
    const shoulders = midpoint(keypoints[5], keypoints[6]);
    const hips = midpoint(keypoints[11], keypoints[12]);
    const torsoLean = normalizeAngle(angleBetween(hips, shoulders) - Math.PI / 2);
    damp(VRMHumanBoneName.Spine, torsoLean * 0.55);
    damp(VRMHumanBoneName.Chest, torsoLean * 0.45);
  } else {
    damp(VRMHumanBoneName.Spine, 0);
    damp(VRMHumanBoneName.Chest, 0);
  }

  if (visible(1, 2)) {
    damp(VRMHumanBoneName.Head, angleBetween(keypoints[2], keypoints[1]) * 0.65);
  } else {
    damp(VRMHumanBoneName.Head, 0);
  }
}

export function VrmModel({ url, poseFrame }: VrmModelProps) {
  const vrmRef = useRef<VRM | null>(null);
  const boundsRef = useRef<ModelBounds | null>(null);

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
    const box = new Box3().setFromObject(vrm.scene);
    boundsRef.current = {
      height: Math.max(box.max.y - box.min.y, 0.1),
      centerX: (box.min.x + box.max.x) / 2,
      minY: box.min.y,
    };
    vrmRef.current = vrm;
  }

  useFrame((state, delta) => {
    if (poseFrame && vrmRef.current) {
      applyPose(vrmRef.current, poseFrame, delta);
      if (boundsRef.current) {
        applyPlacement(
          vrmRef.current,
          poseFrame,
          boundsRef.current,
          delta,
          state.viewport,
          state.size.width / state.size.height,
        );
      }
    }
    vrmRef.current?.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
