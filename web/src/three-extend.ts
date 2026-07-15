import * as THREE from "three/webgpu";
import { extend, type Catalogue } from "@react-three/fiber";

// Register all THREE/WebGPU constructors with R3F at module load time.
// ThreeElements JSX types from @react-three/fiber already cover the standard
// THREE namespace; this call ensures runtime access to WebGPU-native classes.
// Import this module once before any <Canvas> renders.
extend(THREE as unknown as Catalogue);
