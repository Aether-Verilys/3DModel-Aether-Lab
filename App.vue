
<script setup lang="ts">
import { ref } from 'vue';
import AetherCanvas from './components/AetherCanvas.vue';
import { getSpatialInsight } from './services/geminiService';
import type { LabContent } from './types';

const content = ref<LabContent | null>(null);
const loading = ref(false);
const step = ref(0); // 0: Intro, 1: Learning, 2: Exploration

const nextStep = async () => {
  if (step.value === 0) {
    step.value = 1;
  } else {
    loading.value = true;
    const insight = await getSpatialInsight("the future of 3D modeling and digital twin possibilities");
    content.value = insight;
    step.value = 2;
    loading.value = false;
  }
};
</script>

<template>
  <div class="relative min-h-screen w-full overflow-hidden text-white selection:bg-white selection:text-black font-['Inter']">
    <AetherCanvas />

    <!-- Grid Overlay for Lab Feel -->
    <div class="fixed inset-0 pointer-events-none opacity-[0.03]" 
         style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 40px 40px;"></div>

    <div class="relative z-10 flex flex-col justify-between min-h-screen p-8 md:p-16">
      
      <!-- Header - Laboratory Identity -->
      <header class="flex justify-between items-start">
        <div class="space-y-1">
          <h1 class="text-2xl font-light tracking-[0.3em] uppercase opacity-90">
            Dimension<span class="font-bold">Lab</span>
          </h1>
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <p class="text-[10px] uppercase tracking-widest font-semibold opacity-40">System Active // Sector 03</p>
          </div>
        </div>
        <div class="text-right hidden md:block">
          <p class="text-[9px] uppercase tracking-widest opacity-30">Experiment No. 719</p>
          <p class="text-[9px] uppercase tracking-widest opacity-30">Status: Observational</p>
        </div>
      </header>

      <!-- Central Educational Content -->
      <main class="max-w-3xl mx-auto text-center pointer-events-none">
        <div v-if="step === 0" class="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <h2 class="text-4xl md:text-6xl font-['Playfair_Display'] italic mb-6">The Void is Volumetric.</h2>
          <p class="text-sm md:text-base opacity-60 leading-relaxed max-w-lg mx-auto font-light">
            Step into the laboratory where we dissect the fabric of digital space. 
            Understand how three dimensions redefine our perception of reality.
          </p>
        </div>

        <div v-if="step === 1" class="animate-in fade-in zoom-in-95 duration-1000 space-y-6">
          <h2 class="text-3xl font-['Playfair_Display'] italic">What is 3D?</h2>
          <div class="grid grid-cols-3 gap-8 text-center">
            <div class="space-y-2">
              <span class="text-4xl font-bold opacity-20">X</span>
              <p class="text-[10px] uppercase tracking-widest opacity-60">Width</p>
            </div>
            <div class="space-y-2">
              <span class="text-4xl font-bold opacity-20">Y</span>
              <p class="text-[10px] uppercase tracking-widest opacity-60">Height</p>
            </div>
            <div class="space-y-2">
              <span class="text-4xl font-bold opacity-100">Z</span>
              <p class="text-[10px] uppercase tracking-widest opacity-60">Depth</p>
            </div>
          </div>
          <p class="text-sm opacity-60 leading-relaxed max-w-md mx-auto font-light italic">
            The Z-axis introduces the concept of distance from the observer, creating the volume necessary for immersive interaction.
          </p>
        </div>

        <div v-if="step === 2 && content" class="transition-all duration-1000 transform" :class="loading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'">
          <span class="text-[10px] uppercase tracking-[0.5em] opacity-40 mb-4 block">Spatial Insight Generated</span>
          <h2 class="text-3xl md:text-4xl font-['Playfair_Display'] italic mb-4">{{ content.title }}</h2>
          <p class="text-lg md:text-xl font-light leading-relaxed opacity-80 mb-6 italic">
            "{{ content.explanation }}"
          </p>
          <div class="h-[1px] w-24 bg-white/20 mx-auto mb-6"></div>
          <p class="text-[10px] uppercase tracking-[0.3em] opacity-40">{{ content.subtext }}</p>
        </div>
      </main>

      <!-- Footer & Primary Action -->
      <footer class="flex flex-col md:flex-row justify-between items-center md:items-end gap-8">
        <div class="flex space-x-12">
          <div>
            <p class="text-[9px] uppercase tracking-widest opacity-30 mb-1">Perspective</p>
            <p class="text-[10px] font-mono opacity-60">800mm F.O.V</p>
          </div>
          <div>
            <p class="text-[9px] uppercase tracking-widest opacity-30 mb-1">Complexity</p>
            <p class="text-[10px] font-mono opacity-60">400 Points</p>
          </div>
        </div>

        <div class="pointer-events-auto">
          <button 
            @click="nextStep"
            :disabled="loading"
            class="relative group overflow-hidden px-12 py-4 border border-white/20 hover:border-white/80 transition-all duration-500"
          >
            <span class="text-[11px] uppercase tracking-[0.4em] font-medium transition-all" :class="loading ? 'opacity-0' : 'opacity-100'">
              {{ step === 0 ? "Enter Laboratory" : step === 1 ? "Discover Possibilities" : "Regenerate Insight" }}
            </span>
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
              <div class="w-4 h-4 border-t border-white rounded-full animate-spin"></div>
            </div>
            <!-- Button Decoration -->
            <div class="absolute top-0 left-0 w-1 h-1 bg-white opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="absolute bottom-0 right-0 w-1 h-1 bg-white opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
        </div>

        <div class="text-right flex flex-col items-end">
          <div class="flex space-x-2 mb-2">
            <div class="w-1 h-3 bg-white/10"></div>
            <div class="w-1 h-3 bg-white/20"></div>
            <div class="w-1 h-3 bg-white/40"></div>
          </div>
          <p class="text-[10px] uppercase tracking-[0.2em] opacity-30">Spatial Discovery Protocol</p>
        </div>
      </footer>
    </div>

    <!-- Coordinate HUD -->
    <div class="fixed top-1/2 left-8 -translate-y-1/2 hidden md:block opacity-20">
      <div class="flex flex-col space-y-8 border-l border-white/20 pl-4 py-8">
        <span class="text-[10px] font-mono">X_AXIS</span>
        <span class="text-[10px] font-mono">Y_AXIS</span>
        <span class="text-[10px] font-mono font-bold">Z_DEPTH</span>
      </div>
    </div>
  </div>
</template>
