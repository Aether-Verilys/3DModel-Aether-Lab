
export interface Particle {
  x: number;
  y: number;
  z: number;
  // Target coordinates for morphing
  tx: number;
  ty: number;
  tz: number;
  // Origin for reset
  ox: number;
  oy: number;
  oz: number;
  
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  density: number;
}

export interface LabContent {
  title: string;
  explanation: string;
  subtext: string;
}

export interface BenchmarkResult {
  score: number;
  grade: string; // S, A, B, C, F
  analysis: string;
  recommendation: string;
}

// Update: Using Float32Array for high-performance geometry data
export type CustomMeshBuffer = Float32Array;
export type CustomMeshUVs = Float32Array;
