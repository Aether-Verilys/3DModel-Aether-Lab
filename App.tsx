
import { defineComponent, ref, computed, onUnmounted, watch } from 'vue';
import AetherCanvas from './components/AetherCanvas';
import { getSpatialInsight, evaluateModel } from './services/geminiService';
import { LabContent, CustomMeshBuffer, CustomMeshUVs, BenchmarkResult } from './types';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export default defineComponent({
  name: 'App',
  components: { AetherCanvas },
  setup() {
    const content = ref<LabContent | null>(null);
    const step = ref(0); // 0: Intro, 1: The Lab
    const currentModel = ref<string | null>(null);
    const loadingText = ref(false);

    // Custom Model State
    const fileInput = ref<HTMLInputElement | null>(null);
    const customMesh = ref<CustomMeshBuffer | null>(null);
    const customUVs = ref<CustomMeshUVs | null>(null);
    const customTexture = ref<THREE.Texture | null>(null); 
    const customNormalMap = ref<THREE.Texture | null>(null); // New: Store normal map
    const isProcessingGLB = ref(false);
    
    // Toggles
    const isUVMode = ref(false); 
    const isNormalMapEnabled = ref(false); 
    const normalIntensity = ref(1.0); // New: Intensity Slider
    
    // Rendering Mode ('point' | 'line' | 'surface' | 'texture')
    const renderMode = ref<'point' | 'line' | 'surface' | 'texture'>('point');

    // Benchmark State
    const isBenchmarking = ref(false);
    const benchmarkResult = ref<BenchmarkResult | null>(null);
    const animatedScore = ref(0);

    // Watcher for score animation
    let scoreAnimFrame: number | null = null;
    watch(benchmarkResult, (newVal) => {
      if (scoreAnimFrame) {
        cancelAnimationFrame(scoreAnimFrame);
        scoreAnimFrame = null;
      }

      if (newVal) {
        let startTimestamp: number | null = null;
        const duration = 2000; // 2 seconds
        const target = newVal.score;
        
        const step = (timestamp: number) => {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = Math.min((timestamp - startTimestamp) / duration, 1);
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          
          animatedScore.value = Math.floor(target * easeProgress);
          
          if (progress < 1) {
            scoreAnimFrame = requestAnimationFrame(step);
          } else {
             scoreAnimFrame = null;
             animatedScore.value = target; 
          }
        };
        
        scoreAnimFrame = requestAnimationFrame(step);
      } else {
        animatedScore.value = 0;
      }
    });

    // --- High-Performance Hold Logic ---
    const isHolding = ref(false);
    const holdProgress = ref(0);
    let animationFrame: number | null = null;

    const updateHold = () => {
      if (isHolding.value) {
        holdProgress.value += 1.5; 
        if (holdProgress.value >= 100) {
          holdProgress.value = 100;
          enterLab();
          return; 
        }
      } else {
        holdProgress.value -= 3;
        if (holdProgress.value < 0) holdProgress.value = 0;
      }

      if (holdProgress.value > 0 || isHolding.value) {
        animationFrame = requestAnimationFrame(updateHold);
      }
    };

    const startHold = () => {
      if (step.value !== 0) return;
      if (!isHolding.value) {
        isHolding.value = true;
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(updateHold);
      }
    };

    const endHold = () => {
      if (step.value !== 0) return;
      isHolding.value = false;
    };

    const circumference = 276.46;
    const strokeDashoffset = computed(() => {
      return circumference - (holdProgress.value / 100) * circumference;
    });

    // Content Fetching Logic
    const fetchContent = async (topic: string) => {
      loadingText.value = true;
      try {
        const insight = await getSpatialInsight(topic);
        content.value = insight;
      } catch (e) {
        console.error(e);
      } finally {
        loadingText.value = false;
      }
    };

    const enterLab = async () => {
      isHolding.value = false;
      step.value = 1;
      currentModel.value = null;
      fetchContent("Cartesian Coordinate System and Empty Space");
    };

    const goHome = () => {
      step.value = 0;
      currentModel.value = null;
      content.value = null;
      holdProgress.value = 0;
      isUVMode.value = false;
      isNormalMapEnabled.value = false;
      renderMode.value = 'point';
      benchmarkResult.value = null;
    };

    const setModel = (model: string) => {
      isUVMode.value = false; 
      // Keep Normal Map enabled if user prefers, or reset? Let's reset for fresh experience.
      isNormalMapEnabled.value = false;
      benchmarkResult.value = null;
      
      if (model === 'custom') {
        fileInput.value?.click();
        return;
      }

      if (currentModel.value === model) {
        currentModel.value = null;
        fetchContent("Cartesian Coordinate System origin");
      } else {
        currentModel.value = model;
        let topic = "";
        switch(model) {
            case 'cube': topic = "Geometric Cube topology and vertices"; break;
            case 'sphere': topic = "Perfect Sphere geometry and curvature"; break;
            case 'helix': topic = "Double Helix structure and DNA geometry"; break;
        }
        fetchContent(topic);
      }
    };

    const toggleUV = () => {
        if (!currentModel.value) return;
        if (renderMode.value !== 'texture') return;
        isUVMode.value = !isUVMode.value;
    };

    const toggleNormalMap = () => {
        if (!currentModel.value) return;
        // Normal maps work in Surface or Texture mode
        if (renderMode.value === 'point' || renderMode.value === 'line') return;
        isNormalMapEnabled.value = !isNormalMapEnabled.value;
    };

    const setRenderMode = (mode: 'point' | 'line' | 'surface' | 'texture') => {
        renderMode.value = mode;
        if (mode !== 'texture') isUVMode.value = false;
        // Disable normal map if switching to point/line
        if (mode === 'point' || mode === 'line') isNormalMapEnabled.value = false;
    };

    const runBenchmark = async () => {
        if (!currentModel.value || isBenchmarking.value) return;

        isBenchmarking.value = true;
        benchmarkResult.value = null;

        let vertexCount = 0;
        let hasUVs = true;

        if (currentModel.value === 'cube') vertexCount = 24; 
        else if (currentModel.value === 'sphere') vertexCount = 3600; 
        else if (currentModel.value === 'helix') vertexCount = 3000;
        else if (currentModel.value === 'custom' && customMesh.value) {
            vertexCount = customMesh.value.length / 3;
            hasUVs = !!customUVs.value;
        }

        try {
            const result = await evaluateModel(currentModel.value, vertexCount, hasUVs);
            benchmarkResult.value = result;
        } catch (e) {
            console.error("Benchmark error", e);
        } finally {
            isBenchmarking.value = false;
        }
    };

    // --- GLB Processing Logic ---
    const handleFileUpload = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;

      const file = target.files[0];
      isProcessingGLB.value = true;
      loadingText.value = true;
      benchmarkResult.value = null;
      customTexture.value = null; 
      customNormalMap.value = null; // Reset normal map

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loader = new GLTFLoader();
        
        loader.parse(arrayBuffer, '', (gltf) => {
          let biggestGeometry: THREE.BufferGeometry | null = null;
          let maxCount = 0;
          let foundTexture: THREE.Texture | null = null;
          let foundNormalMap: THREE.Texture | null = null;

          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              
              if (mesh.geometry) {
                   if (mesh.geometry.index) {
                       mesh.geometry = mesh.geometry.toNonIndexed();
                   }
                   
                   const count = mesh.geometry.attributes.position.count;
                   if (count > maxCount) {
                      maxCount = count;
                      biggestGeometry = mesh.geometry.clone();
                      
                      // Capture Materials
                      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                      if (mat) {
                          const stdMat = mat as THREE.MeshStandardMaterial;
                          if (stdMat.map) foundTexture = stdMat.map;
                          if (stdMat.normalMap) foundNormalMap = stdMat.normalMap;
                      }

                      mesh.updateMatrixWorld();
                      biggestGeometry.applyMatrix4(mesh.matrixWorld);
                   }
              }
            }
          });

          if (!biggestGeometry) {
            throw new Error("No geometry found in model");
          }

          biggestGeometry.computeBoundingBox();
          const center = new THREE.Vector3();
          if (biggestGeometry.boundingBox) {
              biggestGeometry.boundingBox.getCenter(center);
              biggestGeometry.translate(-center.x, -center.y, -center.z);

              const size = new THREE.Vector3();
              biggestGeometry.boundingBox.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              const scale = 400 / (maxDim || 1);
              biggestGeometry.scale(scale, scale, scale);
          }

          const posAttribute = biggestGeometry.attributes.position;
          customMesh.value = posAttribute.array as Float32Array;

          const uvAttribute = biggestGeometry.attributes.uv;
          customUVs.value = uvAttribute ? (uvAttribute.array as Float32Array) : null;
          
          if (foundTexture) {
              foundTexture.colorSpace = THREE.SRGBColorSpace;
              customTexture.value = foundTexture;
          }
          if (foundNormalMap) {
              customNormalMap.value = foundNormalMap;
          }

          currentModel.value = 'custom';
          fetchContent(`User imported High-Poly Model: ${file.name} (${maxCount.toLocaleString()} vertices)`);
        }, (err) => {
          console.error(err);
        });

      } catch (e) {
        console.error("Failed to load GLB", e);
        fetchContent("Error loading spatial data");
      } finally {
        isProcessingGLB.value = false;
        loadingText.value = false;
        target.value = '';
      }
    };

    const navItems = [
      { id: 'cube', label: 'CUBE', icon: '□' },
      { id: 'sphere', label: 'SPHERE', icon: '○' },
      { id: 'helix', label: 'HELIX', icon: '§' },
    ];

    const renderModes = [
        { id: 'point', label: 'POINTS', icon: '∷' },
        { id: 'line', label: 'WIREFRAME', icon: '☖' },
        { id: 'surface', label: 'SURFACE', icon: '◼' },
        { id: 'texture', label: 'TEXTURE', icon: '▩' },
    ];

    onUnmounted(() => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
    });

    return {
      content,
      step,
      currentModel,
      isHolding,
      holdProgress,
      strokeDashoffset,
      circumference,
      navItems,
      renderModes,
      loadingText,
      fileInput,
      handleFileUpload,
      customMesh,
      customUVs,
      customTexture,
      customNormalMap,
      isProcessingGLB,
      isUVMode,
      isNormalMapEnabled,
      renderMode,
      normalIntensity,
      toggleUV,
      toggleNormalMap,
      setRenderMode,
      startHold,
      endHold,
      enterLab,
      goHome,
      setModel,
      runBenchmark,
      isBenchmarking,
      benchmarkResult,
      animatedScore
    };
  },
  template: `
    <div class="relative min-h-screen w-full overflow-hidden text-white selection:bg-white selection:text-black font-['Inter']">
      
      <!-- Hidden File Input -->
      <input 
        type="file" 
        ref="fileInput" 
        accept=".glb,.gltf" 
        class="hidden" 
        @change="handleFileUpload" 
      />

      <!-- CSS Injection for Glitch Effect (unchanged) -->
      <style>
        @keyframes glitch-skew { 0% { transform: skew(0deg); } 20% { transform: skew(-2deg); } 40% { transform: skew(2deg); } 60% { transform: skew(-1deg); } 80% { transform: skew(1deg); } 100% { transform: skew(0deg); } }
        @keyframes glitch-shake { 0% { transform: translate(0, 0); opacity: 1; } 10% { transform: translate(-3px, -3px); opacity: 0.9; text-shadow: 2px 0 red; } 20% { transform: translate(3px, 3px); opacity: 1; text-shadow: -2px 0 blue; } 30% { transform: translate(-3px, 3px); opacity: 0.9; text-shadow: 2px 0 red; } 40% { transform: translate(3px, -3px); opacity: 1; text-shadow: -2px 0 blue; } 50% { transform: translate(-1px, 0); opacity: 0.9; } 100% { transform: translate(0, 0); opacity: 1; } }
        .glitch-active h2 { animation: glitch-shake 0.15s cubic-bezier(.25, .46, .45, .94) both infinite; position: relative; }
        .glitch-active, .glitch-active * { transition: none !important; }
        @keyframes scan-line { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .scanning-line { animation: scan-line 2s linear infinite; }
        input[type=range] {
            -webkit-appearance: none;
            width: 100%;
            background: transparent;
        }
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 12px;
            width: 12px;
            border-radius: 50%;
            background: #22d3ee;
            cursor: pointer;
            margin-top: -5px; 
            box-shadow: 0 0 5px rgba(34, 211, 238, 0.8);
        }
        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 2px;
            cursor: pointer;
            background: rgba(255,255,255,0.2);
        }
      </style>

      <AetherCanvas 
        :mode="step === 0 ? 'chaos' : 'axis'" 
        :model="currentModel"
        :customMesh="customMesh"
        :customUVs="customUVs"
        :customTexture="customTexture"
        :customNormalMap="customNormalMap"
        :uvMode="isUVMode"
        :useNormalMap="isNormalMapEnabled"
        :normalScale="normalIntensity"
        :renderMode="renderMode"
      />

      <!-- Cinematic Overlay -->
      <div class="fixed inset-0 pointer-events-none z-0">
        <div class="absolute inset-0 opacity-[0.04]" style="background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz4KPC9zdmc+');"></div>
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]"></div>
      </div>

      <div class="relative z-10 flex flex-col min-h-screen p-6 md:p-10 transition-all duration-1000">
        
        <!-- Header -->
        <header class="flex justify-between items-start pointer-events-none select-none relative z-20">
          
          <!-- LEFT SIDE: Title & Controls Stack -->
          <div class="flex flex-col gap-6">
            
            <!-- Title Block -->
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <h1 class="text-2xl md:text-3xl font-light tracking-[0.25em] uppercase text-white/90">
                  3D MODEL <span class="font-bold text-white">SPACE</span>
                </h1>
                <div v-if="step === 1" class="flex gap-2 text-[9px] font-mono tracking-widest opacity-80 ml-2 animate-in fade-in duration-500">
                    <span class="text-red-500/80">X</span>
                    <span class="text-green-500/80">Y</span>
                    <span class="text-blue-500/80">Z</span>
                </div>
              </div>

              <div class="flex items-center space-x-2 opacity-50">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-[9px] uppercase tracking-widest font-mono">
                   {{ step === 0 ? 'STANDBY' : 'CONNECTED' }}
                </span>
              </div>
            </div>

            <!-- Vertical Control Stack -->
            <div v-if="step === 1" class="pointer-events-auto flex flex-col items-start gap-3 animate-in fade-in slide-in-from-top duration-700 ease-out origin-top-left" :class="currentModel ? 'opacity-100' : 'opacity-40 grayscale'">
                  
                  <!-- UV Button -->
                  <button 
                      @click="toggleUV"
                      :disabled="!currentModel || renderMode !== 'texture'"
                      class="flex items-center gap-3 px-3 py-2 border-l-2 transition-all pl-4 group backdrop-blur-sm w-full"
                      :class="[
                          isUVMode ? 'border-purple-400 bg-purple-900/10' : 'border-white/20',
                          (!currentModel || renderMode !== 'texture') ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-white/5 cursor-pointer'
                      ]"
                  >
                      <div class="flex flex-col items-start gap-1">
                          <span class="text-[9px] uppercase tracking-widest transition-colors" :class="[isUVMode ? 'text-purple-300' : 'text-gray-400', (!currentModel || renderMode !== 'texture') ? '' : 'group-hover:text-white']">
                              PROJECTION MAP
                          </span>
                          <div class="flex items-center gap-2">
                              <div class="w-1.5 h-1.5 rounded-full transition-all duration-300" :class="isUVMode ? 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]' : (currentModel ? 'bg-white/50' : 'bg-white/10')"></div>
                              <span class="text-[10px] font-bold tracking-widest transition-colors" :class="isUVMode ? 'text-purple-400' : (currentModel ? 'text-white' : 'text-gray-600')">
                                  {{ isUVMode ? 'PLANAR (2D)' : 'SPATIAL (3D)' }}
                              </span>
                          </div>
                      </div>
                  </button>

                   <!-- Normal Map Button & Slider Container -->
                  <div class="w-full flex flex-col gap-0 backdrop-blur-sm border-l-2 transition-all" :class="isNormalMapEnabled ? 'border-cyan-400 bg-cyan-900/10' : 'border-white/20'">
                      <button 
                          @click="toggleNormalMap"
                          :disabled="!currentModel || (renderMode !== 'surface' && renderMode !== 'texture')"
                          class="flex items-center gap-3 px-3 py-2 pl-4 group w-full text-left"
                          :class="[
                              (!currentModel || (renderMode !== 'surface' && renderMode !== 'texture')) ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:bg-white/5 cursor-pointer'
                          ]"
                      >
                          <div class="flex flex-col items-start gap-1">
                              <span class="text-[9px] uppercase tracking-widest transition-colors" :class="[isNormalMapEnabled ? 'text-cyan-300' : 'text-gray-400', (!currentModel || (renderMode !== 'surface' && renderMode !== 'texture')) ? '' : 'group-hover:text-white']">
                                  SURFACE DETAIL
                              </span>
                              <div class="flex items-center gap-2">
                                  <div class="w-1.5 h-1.5 rounded-full transition-all duration-300" :class="isNormalMapEnabled ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : (currentModel ? 'bg-white/50' : 'bg-white/10')"></div>
                                  <span class="text-[10px] font-bold tracking-widest transition-colors" :class="isNormalMapEnabled ? 'text-cyan-400' : (currentModel ? 'text-white' : 'text-gray-600')">
                                      {{ isNormalMapEnabled ? 'NORMAL BUMPS' : 'FLAT SHADING' }}
                                  </span>
                              </div>
                          </div>
                      </button>
                      
                      <!-- INTENSITY SLIDER -->
                      <div v-if="isNormalMapEnabled" class="px-4 pb-2 animate-in slide-in-from-top-2 duration-300">
                          <div class="flex justify-between items-end mb-1">
                              <span class="text-[8px] uppercase text-cyan-500/80 font-mono">BUMP INTENSITY</span>
                              <span class="text-[8px] font-mono text-cyan-300">{{ normalIntensity.toFixed(1) }}</span>
                          </div>
                          <input 
                              type="range" 
                              min="0" 
                              max="3" 
                              step="0.1" 
                              v-model.number="normalIntensity"
                              class="w-full"
                          />
                      </div>
                  </div>

                  <!-- Benchmark Button & Wrapper -->
                  <div class="relative w-full">
                      <button 
                          @click="runBenchmark"
                          :disabled="!currentModel || isBenchmarking"
                          class="flex items-center gap-3 px-3 py-2 border-l-2 transition-all pl-4 group backdrop-blur-sm w-full"
                          :class="[
                              isBenchmarking ? 'border-amber-400 bg-amber-900/10 cursor-wait' : 'border-white/20',
                              !currentModel ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer hover:border-amber-500/50'
                          ]"
                      >
                          <div class="flex flex-col items-start gap-1">
                              <span class="text-[9px] uppercase tracking-widest transition-colors text-gray-400 group-hover:text-amber-300">
                                  QUALITY CHECK
                              </span>
                              <div class="flex items-center gap-2">
                                  <div class="w-1.5 h-1.5 rounded-full transition-all duration-300" :class="isBenchmarking ? 'bg-amber-400 animate-ping' : (benchmarkResult ? 'bg-amber-500' : 'bg-white/10')"></div>
                                  <span class="text-[10px] font-bold tracking-widest transition-colors" :class="isBenchmarking ? 'text-amber-400' : 'text-gray-600 group-hover:text-white'">
                                      {{ isBenchmarking ? 'SCANNING...' : 'BENCHMARK' }}
                                  </span>
                              </div>
                          </div>
                      </button>

                      <!-- Benchmark Result Panel (unchanged structure, just re-included in flow) -->
                      <div v-if="benchmarkResult && !isBenchmarking" class="absolute left-full top-0 ml-6 z-50 w-72 pointer-events-auto">
                          <div class="bg-[#050505]/90 backdrop-blur-xl border border-white/20 p-5 shadow-[0_0_30px_rgba(255,255,255,0.05)] relative overflow-hidden animate-in slide-in-from-left-4 fade-in duration-500">
                              <div class="absolute top-0 right-0 w-8 h-8 bg-[linear-gradient(45deg,transparent_50%,rgba(255,255,255,0.1)_50%)]"></div>
                              <div class="flex justify-between items-start mb-4">
                                  <span class="text-[9px] uppercase tracking-widest text-emerald-500/80">Diagnostic //</span>
                                  <button @click="benchmarkResult = null" class="text-gray-500 hover:text-white transition-colors">✕</button>
                              </div>
                              <div class="flex items-baseline gap-3 mb-6 border-b border-white/10 pb-4">
                                  <span class="text-5xl font-['Playfair_Display'] italic leading-none" :class="benchmarkResult.score >= 80 ? 'text-emerald-400' : (benchmarkResult.score >= 50 ? 'text-amber-400' : 'text-red-400')">{{ animatedScore }}</span>
                                  <div class="flex flex-col">
                                      <span class="text-[10px] font-bold font-mono px-2 py-0.5 border" :class="benchmarkResult.score >= 80 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-900/20' : (benchmarkResult.score >= 50 ? 'border-amber-500/30 text-amber-400 bg-amber-900/20' : 'border-red-500/30 text-red-400 bg-red-900/20')">Rank {{ benchmarkResult.grade }}</span>
                                  </div>
                              </div>
                              <div class="space-y-4">
                                  <div>
                                      <p class="text-[9px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-2"><span class="w-1 h-1 bg-white/50 rounded-full"></span>Analysis</p>
                                      <p class="text-xs text-gray-300 font-light leading-relaxed">"{{ benchmarkResult.analysis }}"</p>
                                  </div>
                                  <div>
                                      <p class="text-[9px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-2"><span class="w-1 h-1 bg-amber-500/50 rounded-full"></span>Optimization</p>
                                      <p class="text-xs text-amber-200/80 font-mono leading-relaxed bg-amber-900/10 p-2 border border-amber-500/10">> {{ benchmarkResult.recommendation }}</p>
                                  </div>
                              </div>
                              <div class="mt-6 pt-2 border-t border-white/5 flex justify-between items-center opacity-30">
                                  <span class="text-[8px] uppercase tracking-widest">System v3.0</span>
                                  <span class="text-[8px] font-mono">ID: {{ Math.floor(Math.random() * 9000) + 1000 }}</span>
                              </div>
                          </div>
                      </div>
                  </div>
            </div>

          </div>

          <!-- RIGHT SIDE: Mode Info -->
          <div class="text-right hidden md:block opacity-50">
            <p class="text-[9px] font-mono tracking-widest">FPS: UNLOCKED</p>
            <p class="text-[9px] font-mono tracking-widest uppercase">
                {{ step === 0 ? 'MODE: IDLE' : (isUVMode ? 'MODE: 2D UV MAP' : 'MODE: ' + renderMode) }}
            </p>
            <p v-if="step === 1 && isNormalMapEnabled" class="text-[9px] font-mono tracking-widest uppercase text-cyan-400/80">
                >> NORMAL BUMP ACTIVE: {{ normalIntensity.toFixed(1) }}
            </p>
          </div>
        </header>

        <!-- MAIN STAGE: INTRO (unchanged) -->
        <main v-if="step === 0" class="flex-1 flex flex-col items-center justify-center text-center relative">
          <div class="max-w-xl space-y-10 animate-in fade-in zoom-in-95 duration-1000" :class="isHolding ? 'glitch-active' : 'transition-all'">
             <div class="space-y-6">
                <div class="inline-block px-3 py-1 border border-white/10 rounded-full bg-white/5 backdrop-blur-md">
                   <p class="text-[10px] font-mono tracking-[0.3em] text-gray-300">INITIALIZING SEQUENCE</p>
                </div>
                <h2 class="text-5xl md:text-8xl font-['Playfair_Display'] italic leading-none opacity-90">3D Model<br><span class="opacity-50">Space</span></h2>
                <p class="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed font-light">Long press the interface below to synchronize the particle accelerator.</p>
             </div>
             <div class="relative flex items-center justify-center pointer-events-auto select-none pt-8">
                <div class="relative w-32 h-32 cursor-pointer" @mousedown="startHold" @mouseup="endHold" @mouseleave="endHold" @touchstart.prevent="startHold" @touchend.prevent="endHold" @contextmenu.prevent>
                  <div class="absolute inset-0 bg-white/5 rounded-full blur-xl transition-all duration-100" :class="isHolding ? 'scale-125 opacity-40 bg-white/20' : 'scale-100 opacity-0'"></div>
                  <svg class="w-full h-full rotate-[-90deg] drop-shadow-2xl" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" :stroke-dasharray="circumference" :stroke-dashoffset="strokeDashoffset" class="transition-all duration-75 ease-linear" />
                  </svg>
                  <div class="absolute inset-2 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center transition-colors duration-300 hover:bg-white/5">
                    <div class="text-center transition-transform duration-300" :class="isHolding ? 'scale-110' : 'scale-100'">
                       <span class="block text-xl mb-1 transition-opacity duration-300" :class="isHolding ? 'opacity-100 text-white' : 'opacity-70 text-gray-400'">{{ isHolding ? '▲' : '◉' }}</span>
                       <span class="text-[9px] tracking-[0.2em] font-bold block">{{ isHolding ? 'SYNCING' : 'HOLD' }}</span>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </main>

        <!-- MAIN STAGE: LAB (Sidebar unchanged mostly) -->
        <main v-if="step === 1" class="flex-1 relative animate-in fade-in duration-1000">
           <div class="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col gap-6 pointer-events-auto z-50">
               <div class="flex flex-row space-x-2 pl-1">
                   <button v-for="mode in renderModes" :key="mode.id" @click="setRenderMode(mode.id)" :disabled="!currentModel" class="w-10 h-10 flex items-center justify-center transition-all duration-300 relative group backdrop-blur-sm border" :class="[renderMode === mode.id && currentModel ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(96,165,250,0.3)]' : 'bg-black/20 border-white/10 text-gray-500 hover:border-blue-400/50 hover:text-white', !currentModel ? 'opacity-30 cursor-not-allowed' : 'opacity-100']">
                      <span class="text-lg">{{ mode.icon }}</span>
                      <span class="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-widest transition-all duration-300 whitespace-nowrap bg-black/80 px-2 py-1 border border-white/10 pointer-events-none z-50" :class="renderMode === mode.id ? 'text-blue-300 opacity-100 font-bold' : 'text-gray-500 opacity-0 group-hover:opacity-100'">{{ mode.label }}</span>
                   </button>
               </div>
              <div class="w-12 flex justify-center opacity-20"><div class="w-6 h-[1px] bg-white"></div></div>
              <div class="flex flex-col space-y-3">
                 <button v-for="item in navItems" :key="item.id" @click="setModel(item.id)" class="w-12 h-12 border flex items-center justify-center transition-all duration-300 relative group backdrop-blur-sm" :class="currentModel === item.id ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-black/20 border-white/20 text-gray-400 hover:border-white hover:text-white'">
                    <span class="text-xl">{{ item.icon }}</span>
                    <span class="absolute left-full ml-4 text-[9px] uppercase tracking-widest transition-all duration-300 whitespace-nowrap" :class="currentModel === item.id ? 'text-white opacity-100 font-bold' : 'text-gray-500 opacity-0 group-hover:opacity-100'">{{ item.label }}</span>
                 </button>
                 <div class="w-12 flex justify-center opacity-10 py-1"><div class="w-2 h-[1px] bg-white"></div></div>
                 <button @click="setModel('custom')" class="w-12 h-12 border border-yellow-500/80 text-yellow-500 flex items-center justify-center transition-all duration-300 relative group backdrop-blur-sm hover:bg-yellow-500/10 hover:shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                    <svg v-if="!isProcessingGLB" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <div v-else class="w-4 h-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
                    <span class="absolute left-full ml-4 text-[9px] uppercase tracking-widest transition-all duration-300 whitespace-nowrap text-yellow-500 font-bold opacity-0 group-hover:opacity-100">IMPORT_GLB</span>
                 </button>
              </div>
              <div class="w-12 flex justify-center opacity-20"><div class="w-6 h-[1px] bg-white"></div></div>
              <button @click="goHome" class="w-12 h-12 flex items-center justify-center border border-red-500/30 bg-red-500/5 hover:bg-red-500/20 text-red-500 transition-all duration-300 backdrop-blur-sm group relative" title="Disconnect">
                 <span class="text-xl group-hover:scale-110 transition-transform">✕</span>
                 <span class="absolute left-full ml-4 text-[9px] tracking-widest text-red-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">DISCONNECT</span>
              </button>
           </div>

           <!-- Content Info -->
           <div class="absolute bottom-4 left-20 md:bottom-12 md:left-24 max-w-sm pointer-events-none">
              <div class="flex items-start gap-4 transition-opacity duration-500" :class="loadingText ? 'opacity-50' : 'opacity-100'">
                 <div class="w-[1px] h-20 bg-gradient-to-b from-white via-white/50 to-transparent"></div>
                 <div v-if="content">
                    <p class="text-[9px] font-mono tracking-widest text-emerald-400 uppercase mb-2">{{ loadingText ? 'ANALYZING...' : 'DATA_RECEIVED' }}</p>
                    <h3 class="text-2xl font-['Playfair_Display'] italic text-white mb-2 leading-tight">{{ content.title }}</h3>
                    <p class="text-xs text-gray-300 leading-relaxed font-light">{{ content.explanation }}</p>
                 </div>
                 <div v-else class="space-y-2 w-48 animate-pulse">
                    <div class="h-4 bg-white/10 rounded w-3/4"></div>
                    <div class="h-3 bg-white/5 rounded w-full"></div>
                    <div class="h-3 bg-white/5 rounded w-5/6"></div>
                 </div>
              </div>
           </div>

           <!-- Zoom Hint -->
           <div class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-30 animate-in fade-in">
              <div class="flex items-center gap-4">
                 <span class="text-[9px] vertical-text font-mono tracking-widest">SCROLL_ZOOM</span>
                 <div class="w-[1px] h-12 bg-white"></div>
              </div>
           </div>
        </main>

        <!-- Footer Coordinates -->
        <footer class="absolute bottom-6 right-6 md:right-10 pointer-events-none opacity-30 select-none">
           <div class="text-[9px] font-mono text-right space-y-1.5">
              <div class="flex items-center justify-end gap-2"><span class="w-1 h-1 bg-red-500 rounded-full"></span><p>X: {{ step === 0 ? 'RANDOM' : 'LOCKED' }}</p></div>
              <div class="flex items-center justify-end gap-2"><span class="w-1 h-1 bg-green-500 rounded-full"></span><p>Y: {{ step === 0 ? 'RANDOM' : 'LOCKED' }}</p></div>
              <div class="flex items-center justify-end gap-2"><span class="w-1 h-1 bg-blue-500 rounded-full" :class="currentModel ? 'animate-pulse' : ''"></span><p>Z: {{ currentModel ? 'MESH_RENDERING' : 'IDLE' }}</p></div>
           </div>
        </footer>

      </div>
    </div>
  `
});
