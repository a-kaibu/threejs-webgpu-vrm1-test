import "./style.css";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin, MToonMaterialLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";

// Renderer
const renderer = new THREE.WebGPURenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Camera
const camera = new THREE.PerspectiveCamera(30.0, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, 1.0, 5.0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;
controls.target.set(0.0, 1.0, 0.0);
controls.update();

// Scene
const scene = new THREE.Scene();

// Light
const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// Grid
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

// GLTFLoader with VRM plugin (WebGPU: use MToonNodeMaterial)
const loader = new GLTFLoader();
loader.register((parser) => {
  const mtoonMaterialPlugin = new MToonMaterialLoaderPlugin(parser, {
    materialType: MToonNodeMaterial,
  });
  return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });
});

let currentVrm: VRM | undefined;

function load(url: string): void {
  loader.load(
    url,
    (gltf) => {
      const vrm = gltf.userData.vrm as VRM;

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.combineMorphs(vrm);

      if (currentVrm) {
        scene.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene);
      }

      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      currentVrm = vrm;
      scene.add(vrm.scene);
      VRMUtils.rotateVRM0(vrm);

      document.getElementById("info")?.classList.add("hidden");
      console.log("VRM loaded:", vrm);
    },
    (progress) => {
      console.log("Loading...", 100.0 * (progress.loaded / progress.total), "%");
    },
    (error) => {
      console.error("Error loading VRM:", error);
    },
  );
}

// Drag and drop
window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const blob = new Blob([file], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  load(url);
});

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();
clock.start();

void renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  currentVrm?.update(delta);
  renderer.render(scene, camera);
});
