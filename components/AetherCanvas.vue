
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Particle } from '../types';

const canvasRef = ref<HTMLCanvasElement | null>(null);

// Variables that don't need to be reactive in the template
const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
const particles: Particle[] = [];
let animationFrameId: number | undefined;
let time = 0;

const init = (width: number, height: number) => {
  particles.length = 0; // Clear array
  const count = 400; // Structured set of particles
  for (let i = 0; i < count; i++) {
    // Initialize in a 3D box volume
    const x = (Math.random() - 0.5) * width * 1.5;
    const y = (Math.random() - 0.5) * height * 1.5;
    const z = (Math.random() - 0.5) * 1000;
    
    particles.push({
      x, y, z,
      originX: x, originY: y, originZ: z,
      vx: 0, vy: 0, vz: 0,
      size: Math.random() * 2 + 0.5,
      color: `rgba(255, 255, 255, ${Math.random() * 0.4 + 0.1})`,
      density: Math.random() * 10 + 5
    });
  }
};

const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.clearRect(0, 0, width, height);
  
  // Smooth camera rotation based on mouse
  mouse.x += (mouse.targetX - mouse.x) * 0.05;
  mouse.y += (mouse.targetY - mouse.y) * 0.05;

  const rotY = (mouse.x / width - 0.5) * 0.5;
  const rotX = (mouse.y / height - 0.5) * -0.5;

  ctx.save();
  ctx.translate(width / 2, height / 2);

  // Draw Coordinate Axes (Technical Lab feel)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-width / 4, 0); ctx.lineTo(width / 4, 0); // X
  ctx.moveTo(0, -height / 4); ctx.lineTo(0, height / 4); // Y
  ctx.stroke();

  // Project and Draw Particles
  const fov = 800;
  particles.forEach(p => {
    // 3D Rotations
    // Rotate Y (yaw)
    let x = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
    let z = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
    
    // Rotate X (pitch)
    let y = p.y * Math.cos(rotX) - z * Math.sin(rotX);
    z = p.y * Math.sin(rotX) + z * Math.cos(rotX);

    // Add gentle drift
    p.x += Math.sin(time * 0.2 + p.density) * 0.1;
    p.y += Math.cos(time * 0.2 + p.density) * 0.1;

    // Perspective Projection
    const perspective = fov / (fov + z);
    const px = x * perspective;
    const py = y * perspective;

    if (z > -fov) {
      ctx.fillStyle = p.color;
      const size = p.size * perspective;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();

      // Occasional connecting lines for wireframe feel
      if (p.density > 14) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * perspective})`;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + 20 * perspective, py);
        ctx.stroke();
      }
    }
  });

  ctx.restore();
};

const animate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  time += 0.01;
  draw(ctx, width, height);
  animationFrameId = requestAnimationFrame(() => animate(ctx, width, height));
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const handleResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init(canvas.width, canvas.height);
  };

  const handleMouseMove = (e: MouseEvent) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('mousemove', handleMouseMove);
  handleResize();
  animate(ctx, canvas.width, canvas.height);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('mousemove', handleMouseMove);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });
});
</script>

<template>
  <canvas 
    ref="canvasRef" 
    class="fixed top-0 left-0 w-full h-full z-0 bg-[#050505]"
  ></canvas>
</template>
