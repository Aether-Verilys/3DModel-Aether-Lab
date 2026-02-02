
import { defineComponent, h, ref, onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';
import { CustomMeshBuffer, CustomMeshUVs } from '../types';

export default defineComponent({
  name: 'AetherCanvas',
  props: ['mode', 'model', 'customMesh', 'customUVs', 'uvMode', 'renderMode', 'customTexture', 'customNormalMap', 'useNormalMap', 'normalScale'],
  setup(props) {
    const canvasContainer = ref<HTMLDivElement | null>(null);
    
    // Three.js instances
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let animationId: number | null = null;
    let time = 0;

    // Objects
    let chaosParticles: THREE.Points | null = null;
    let axisGroup: THREE.Group | null = null;
    let currentObject: THREE.Object3D | null = null; 

    // Lights
    let ambientLight: THREE.AmbientLight | null = null;
    let dirLight: THREE.DirectionalLight | null = null;
    let pointLight: THREE.PointLight | null = null;

    // Shader Uniforms (Points)
    const pointUniforms = {
        uTime: { value: 0 },
        uMix: { value: 0 }, 
        uColor: { value: new THREE.Color(0xeeeeff) },
        uPointSize: { value: 1.5 }
    };

    // Shader Uniforms (Surface)
    const surfaceUniforms = {
        uMix: { value: 0 }
    };

    // Texture Cache
    let uvGridTexture: THREE.Texture | null = null;
    let proceduralNormalMap: THREE.Texture | null = null;

    const getUVGridTexture = () => {
        if (uvGridTexture) return uvGridTexture;
        
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#101010';
            ctx.fillRect(0,0,1024,1024);
            
            const count = 16;
            const step = 1024/count;
            
            for(let y=0; y<count; y++) {
                for(let x=0; x<count; x++) {
                    const isWhite = (x+y)%2 === 0;
                    ctx.fillStyle = isWhite ? '#303030' : '#151515';
                    ctx.fillRect(x*step, y*step, step, step);
                }
            }
            
            // Grid lines
            ctx.strokeStyle = '#404040';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for(let i=0; i<=1024; i+=step) {
                ctx.moveTo(i, 0); ctx.lineTo(i, 1024);
                ctx.moveTo(0, i); ctx.lineTo(1024, i);
            }
            ctx.stroke();
            
            // Border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.strokeRect(0,0,1024,1024);
        }
        
        uvGridTexture = new THREE.CanvasTexture(canvas);
        uvGridTexture.anisotropy = 4;
        uvGridTexture.colorSpace = THREE.SRGBColorSpace;
        return uvGridTexture;
    };

    const getProceduralNormalMap = () => {
        if (proceduralNormalMap) return proceduralNormalMap;

        // 512x512 as requested
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
             // 1. Fill base "flat" normal color: RGB(128, 128, 255)
             // R=0.5 (X=0), G=0.5 (Y=0), B=1.0 (Z=1)
             ctx.fillStyle = 'rgb(128, 128, 255)';
             ctx.fillRect(0, 0, size, size);

             // 2. Draw "Tech Plates" with high contrast bevels
             const count = 30;
             for (let i = 0; i < count; i++) {
                 const x = Math.random() * size;
                 const y = Math.random() * size;
                 const w = Math.random() * 80 + 40;
                 const h = Math.random() * 80 + 40;
                 const bevel = 6;

                 // We use standard Tangent Space Normal Map colors for slopes
                 
                 // Top Bevel (Normal facing Y+) -> RGB(128, 255, 128) - Bright Green
                 ctx.fillStyle = 'rgb(128, 255, 128)';
                 ctx.fillRect(x, y, w, bevel);

                 // Bottom Bevel (Normal facing Y-) -> RGB(128, 0, 128) - Dark Green/Purple
                 ctx.fillStyle = 'rgb(128, 0, 128)';
                 ctx.fillRect(x, y + h - bevel, w, bevel);

                 // Left Bevel (Normal facing X-) -> RGB(0, 128, 128) - Dark Red/Cyan
                 ctx.fillStyle = 'rgb(0, 128, 128)';
                 ctx.fillRect(x, y, bevel, h);

                 // Right Bevel (Normal facing X+) -> RGB(255, 128, 128) - Bright Red
                 ctx.fillStyle = 'rgb(255, 128, 128)';
                 ctx.fillRect(x + w - bevel, y, bevel, h);

                 // Center Plate (Flat, slightly raised visually if we were doing displacement, but here just flat normal)
                 // Let's vary the flat normal slightly to simulate uneven surface or just keep flat
                 ctx.fillStyle = 'rgb(128, 128, 255)';
                 ctx.fillRect(x + bevel, y + bevel, w - bevel*2, h - bevel*2);
                 
                 // Add some "rivets" or dots
                 ctx.fillStyle = 'rgb(128, 255, 128)'; // Y+ bump
                 ctx.fillRect(x + 10, y + 10, 4, 4);
                 ctx.fillRect(x + w - 14, y + 10, 4, 4);
                 ctx.fillRect(x + w - 14, y + h - 14, 4, 4);
                 ctx.fillRect(x + 10, y + h - 14, 4, 4);
             }
             
             // 3. Grid Lines / Grooves (Deep recesses)
             // A deep groove typically has normals pointing inward. 
             // Simplifying: dark lines don't work in normal maps, we need slope vectors.
             // We'll simulate a thin "ditch".
             
             ctx.lineWidth = 2;
             const step = size / 4;
             
             for(let i=0; i<size; i+=step) {
                 // Vertical Groove
                 // Left bank (X+) | Right bank (X-)
                 ctx.fillStyle = 'rgb(255, 128, 128)'; // Right facing
                 ctx.fillRect(i, 0, 1, size);
                 ctx.fillStyle = 'rgb(0, 128, 128)'; // Left facing
                 ctx.fillRect(i+1, 0, 1, size);

                 // Horizontal Groove
                 // Top bank (Y+) | Bottom bank (Y-)
                 ctx.fillStyle = 'rgb(128, 255, 128)'; // Up facing
                 ctx.fillRect(0, i, size, 1);
                 ctx.fillStyle = 'rgb(128, 0, 128)'; // Down facing
                 ctx.fillRect(0, i+1, size, 1);
             }
        }

        proceduralNormalMap = new THREE.CanvasTexture(canvas);
        // Important: Repeat wrapping ensures the texture density looks good on larger models
        proceduralNormalMap.wrapS = THREE.RepeatWrapping;
        proceduralNormalMap.wrapT = THREE.RepeatWrapping;
        proceduralNormalMap.repeat.set(2, 2); 
        proceduralNormalMap.anisotropy = 4;
        proceduralNormalMap.colorSpace = THREE.LinearSRGBColorSpace; 
        return proceduralNormalMap;
    };

    // State
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let zoom = 1;

    // --- SETUP FUNCTIONS (unchanged) ---

    const initThree = () => {
        if (!canvasContainer.value) return;

        // Scene
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x050505, 0.0005);

        // Camera
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera = new THREE.PerspectiveCamera(60, width / height, 1, 3000);
        camera.position.z = 800;
        camera.lookAt(0, 0, 0);

        // Renderer
        renderer = new THREE.WebGLRenderer({ 
            alpha: true, 
            antialias: true, 
            powerPreference: 'high-performance' 
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        canvasContainer.value.appendChild(renderer.domElement);

        // Lights
        ambientLight = new THREE.AmbientLight(0xffffff, 0.4); 
        scene.add(ambientLight);

        dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(200, 500, 500);
        scene.add(dirLight);

        pointLight = new THREE.PointLight(0xaaccff, 1, 1000); 
        pointLight.position.set(-200, 100, 200);
        scene.add(pointLight);

        // Events
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('wheel', handleWheel);

        createChaosParticles();
        createAxisSystem();
        updateVisibility();
        animate();
    };

    const handleResize = () => {
        if (!camera || !renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
        mouse.targetX = (e.clientX - window.innerWidth / 2) * 0.5;
        mouse.targetY = (e.clientY - window.innerHeight / 2) * 0.5;
    };

    const handleWheel = (e: WheelEvent) => {
        if (props.mode === 'chaos') return;
        zoom += e.deltaY * 0.001;
        zoom = Math.max(0.2, Math.min(zoom, 5.0));
    };

    // --- OBJECT CREATION ---
    const createCircleTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        return new THREE.CanvasTexture(canvas);
    };

    const createChaosParticles = () => {
        const count = 3000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
            sizes[i] = Math.random() * 2 + 1;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        const material = new THREE.PointsMaterial({
            color: 0xffffff, size: 4, sizeAttenuation: true, map: createCircleTexture(),
            alphaTest: 0.5, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
        });
        chaosParticles = new THREE.Points(geometry, material);
        if (scene) scene.add(chaosParticles);
    };

    const createAxisSystem = () => {
        axisGroup = new THREE.Group();
        const createAxisLine = (endPoint: THREE.Vector3, color: THREE.Color, isNegative: boolean = false) => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([0,0,0, endPoint.x, endPoint.y, endPoint.z]);
            const colors = new Float32Array([1,1,1, color.r, color.g, color.b]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            return new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: isNegative ? 0.3 : 0.8 }));
        };
        axisGroup.add(createAxisLine(new THREE.Vector3(400,0,0), new THREE.Color(1, 0.2, 0.2)));
        axisGroup.add(createAxisLine(new THREE.Vector3(0,400,0), new THREE.Color(0.2, 1, 0.2)));
        axisGroup.add(createAxisLine(new THREE.Vector3(0,0,-400), new THREE.Color(0.2, 0.2, 1))); 
        axisGroup.add(createAxisLine(new THREE.Vector3(-400,0,0), new THREE.Color(1, 0.2, 0.2), true));
        axisGroup.add(createAxisLine(new THREE.Vector3(0,-400,0), new THREE.Color(0.2, 1, 0.2), true));
        axisGroup.add(createAxisLine(new THREE.Vector3(0,0,400), new THREE.Color(0.2, 0.2, 1), true));
        axisGroup.visible = false;
        if (scene) scene.add(axisGroup);
    };

    // Shaders (Points)
    const vertexShader = `
        uniform float uMix;
        uniform float uPointSize;
        attribute vec2 uvCoordinates;
        void main() {
            vec3 pos3D = position;
            vec3 pos2D = vec3((uvCoordinates.x - 0.5) * 400.0, (uvCoordinates.y - 0.5) * 400.0, 0.0);
            vec3 finalPos = mix(pos3D, pos2D, uMix);
            vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = uPointSize * (800.0 / -mvPosition.z);
        }
    `;
    const fragmentShader = `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, 1.0); }
    `;

    const updateModel = () => {
        if (currentObject && scene) {
            scene.remove(currentObject);
            if ((currentObject as any).geometry) (currentObject as any).geometry.dispose();
            if ((currentObject as any).material) {
                if (Array.isArray((currentObject as any).material)) {
                    (currentObject as any).material.forEach((m: any) => m.dispose());
                } else {
                    (currentObject as any).material.dispose();
                }
            }
            currentObject = null;
        }

        if (!props.model) return;

        let geometry: THREE.BufferGeometry | null = null;
        let pointSize = 1.5;
        let renderMode = props.renderMode || 'point';

        if (props.model === 'cube') {
            geometry = new THREE.BoxGeometry(300, 300, 300, 20, 20, 20);
        } else if (props.model === 'sphere') {
            geometry = new THREE.SphereGeometry(200, 60, 60);
        } else if (props.model === 'helix') {
            const segments = 3000;
            if (renderMode === 'surface' || renderMode === 'texture') {
                 const curve = new THREE.CatmullRomCurve3(
                    new Array(100).fill(0).map((_, i) => {
                        const t = i/100;
                        const angle = t * Math.PI * 20;
                        const y = (t - 0.5) * 600;
                        const r = 150;
                        return new THREE.Vector3(Math.cos(angle)*r, y, Math.sin(angle)*r);
                    })
                 );
                 geometry = new THREE.TubeGeometry(curve, 300, 20, 8, false);
            } else {
                 const points = []; const uvs = [];
                 for(let i=0; i<segments; i++) {
                    const t = i/segments;
                    const angle = t * Math.PI * 20;
                    points.push(Math.cos(angle)*150, (t - 0.5) * 600, Math.sin(angle)*150);
                    uvs.push(t, (Math.sin(angle) + 1) / 2);
                 }
                 geometry = new THREE.BufferGeometry();
                 geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
                 geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            }
        } else if (props.model === 'custom' && props.customMesh) {
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(props.customMesh as Float32Array, 3));
            if (props.customUVs) geometry.setAttribute('uv', new THREE.BufferAttribute(props.customUVs as Float32Array, 2));
            else {
                 const count = props.customMesh.length / 3;
                 const uvBuffer = new Float32Array(count * 2);
                 for(let i=0; i<count; i++) { uvBuffer[i*2] = 0.5; uvBuffer[i*2+1] = 0.5; }
                 geometry.setAttribute('uv', new THREE.BufferAttribute(uvBuffer, 2));
            }
            if (renderMode === 'surface' || renderMode === 'texture') geometry.computeVertexNormals();
            pointSize = 1.0; 
        }

        if (geometry) {
            if (renderMode === 'point') {
                if (!geometry.attributes.uvCoordinates && geometry.attributes.uv) {
                    geometry.setAttribute('uvCoordinates', geometry.attributes.uv);
                }
            }

            if (renderMode === 'point') {
                pointUniforms.uPointSize.value = pointSize;
                pointUniforms.uMix.value = 0;
                currentObject = new THREE.Points(geometry, new THREE.ShaderMaterial({
                    uniforms: pointUniforms, vertexShader: vertexShader, fragmentShader: fragmentShader,
                    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
                }));
            } 
            else if (renderMode === 'line') {
                if (props.model === 'helix' && !(geometry instanceof THREE.TubeGeometry)) {
                     currentObject = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
                } else {
                     currentObject = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1 }));
                }
            }
            else if (renderMode === 'surface' || renderMode === 'texture') {
                const material = new THREE.MeshPhysicalMaterial({
                    color: 0xe0e0e0,
                    metalness: 0.2,
                    roughness: 0.4,
                    clearcoat: 0.5,
                    clearcoatRoughness: 0.1,
                    side: THREE.DoubleSide
                });

                if (renderMode === 'texture') {
                    if (props.model === 'custom' && props.customTexture) {
                         material.map = props.customTexture;
                         material.color.setHex(0xffffff);
                    } else {
                         material.map = getUVGridTexture();
                         material.color.setHex(0xffffff); 
                    }
                }

                // Normal Map Logic
                const scale = props.useNormalMap ? (props.normalScale || 1.0) : 0;
                
                if (props.model === 'custom' && props.customNormalMap) {
                     material.normalMap = props.customNormalMap;
                     material.normalScale.set(scale, scale);
                } else {
                     material.normalMap = getProceduralNormalMap();
                     material.normalScale.set(scale, scale);
                }

                material.onBeforeCompile = (shader) => {
                    shader.uniforms.uMix = surfaceUniforms.uMix;
                    shader.vertexShader = `uniform float uMix;\n` + shader.vertexShader;
                    shader.fragmentShader = `uniform float uMix;\n` + shader.fragmentShader;
                    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                        vec3 transformed = vec3( position );
                        vec3 pos2D = vec3((uv.x - 0.5) * 400.0, (uv.y - 0.5) * 400.0, 0.0);
                        transformed = mix(transformed, pos2D, uMix);
                    `);
                    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
                        #include <beginnormal_vertex>
                        vec3 flatNormal = vec3( 0.0, 0.0, 1.0 );
                        objectNormal = mix(objectNormal, flatNormal, uMix);
                    `);
                    shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', `
                        // When unwrapping, we fade out lighting/shading, which effectively flattens the normal map effect too
                        outgoingLight = mix(outgoingLight, diffuseColor.rgb, uMix);
                        #include <output_fragment>
                    `);
                };

                currentObject = new THREE.Mesh(geometry, material);
            }

            if (scene && currentObject) scene.add(currentObject);
        }
    };

    // --- ANIMATION & WATCHERS (unchanged logic) ---
    const updateVisibility = () => {
        if (!scene) return;
        if (props.mode === 'chaos') {
            if (chaosParticles) chaosParticles.visible = true;
            if (axisGroup) axisGroup.visible = false;
            if (currentObject) currentObject.visible = false;
        } else {
            if (chaosParticles) chaosParticles.visible = true; 
            if (axisGroup) axisGroup.visible = true;
            if (currentObject) currentObject.visible = true;
        }
    };

    const animate = () => {
        animationId = requestAnimationFrame(animate);
        time += 0.005;
        pointUniforms.uTime.value = time;

        const targetMix = props.uvMode ? 1.0 : 0.0;
        pointUniforms.uMix.value += (targetMix - pointUniforms.uMix.value) * 0.05;
        surfaceUniforms.uMix.value = pointUniforms.uMix.value;

        if (!scene || !camera) return;
        mouse.x += (mouse.targetX - mouse.x) * 0.05;
        mouse.y += (mouse.targetY - mouse.y) * 0.05;
        camera.position.z += (800 * zoom - camera.position.z) * 0.1;
        const rotX = mouse.y * 0.001;
        const rotY = mouse.x * 0.001;
        scene.rotation.x = rotX;
        scene.rotation.y = rotY;

        if (chaosParticles) {
            chaosParticles.rotation.y = time * 0.1;
            chaosParticles.rotation.z = time * 0.05;
            const material = chaosParticles.material as THREE.PointsMaterial;
            material.opacity += (props.mode === 'chaos' ? 0.6 : 0.1 - material.opacity) * 0.05;
        }

        if (axisGroup) {
            axisGroup.children.forEach((child: any) => {
                if (child.material) {
                    const targetOpacity = (props.mode === 'axis' && !props.uvMode) ? (props.model ? 0.3 : 0.8) : 0;
                    if (child.material.opacity < targetOpacity) child.material.opacity += 0.02;
                    else if (child.material.opacity > targetOpacity) child.material.opacity -= 0.05;
                }
            });
        }

        if (currentObject) {
            const currentMix = pointUniforms.uMix.value;
            if (currentMix <= 0.1) {
                 if (props.model === 'custom') currentObject.rotation.y = time * 0.2;
                 else currentObject.rotation.y = time * 0.5;
            } else {
                currentObject.rotation.y += (0 - currentObject.rotation.y) * 0.05;
                currentObject.rotation.x += (0 - currentObject.rotation.x) * 0.05;
                currentObject.rotation.z += (0 - currentObject.rotation.z) * 0.05;
            }
        }

        if (renderer) renderer.render(scene, camera);
    };

    watch(() => props.mode, updateVisibility);
    
    // Watch intensity specifically to avoid full rebuild
    watch(() => props.normalScale, (val) => {
        if (currentObject && (currentObject as any).material && (currentObject as any).material.normalScale) {
            const intensity = props.useNormalMap ? val : 0;
            (currentObject as any).material.normalScale.set(intensity, intensity);
        }
    });

    // Watch all props that require model rebuild
    watch([
        () => props.model, 
        () => props.customMesh, 
        () => props.customUVs,
        () => props.renderMode,
        () => props.customTexture,
        () => props.customNormalMap,
        () => props.useNormalMap
    ], () => {
        updateModel();
        updateVisibility();
    });

    onMounted(() => { initThree(); });
    onUnmounted(() => {
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('wheel', handleWheel);
        if (renderer) renderer.dispose();
    });

    return () => h('div', { ref: canvasContainer, class: 'fixed top-0 left-0 w-full h-full z-0 bg-[#050505]' });
  }
});
