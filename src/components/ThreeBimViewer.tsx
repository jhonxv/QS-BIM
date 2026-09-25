import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BIMElement,
  FootingElement,
  ColumnElement,
  BeamElement,
  WallElement,
  SlabElement,
  DXFEntity,
} from '../types/bim';
import { Box, Layers, Maximize2, RotateCcw, MapPin, ZoomIn, ZoomOut } from 'lucide-react';

interface ThreeBimViewerProps {
  elements: BIMElement[];
  dxfEntities?: DXFEntity[];
  scaleRatio?: number;
  onSelectElement?: (element: BIMElement) => void;
  onDeselect?: () => void;
}

export const ThreeBimViewer: React.FC<ThreeBimViewerProps> = ({
  elements,
  dxfEntities,
  scaleRatio = 1.0,
  onSelectElement,
  onDeselect,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [wireframeMode, setWireframeMode] = useState<boolean>(false);
  const [showDxfUnderlay, setShowDxfUnderlay] = useState<boolean>(true);

  // Active scale factor for converting drawing units (e.g. mm) to 3D scene meters
  const s = scaleRatio > 0 ? scaleRatio : 1.0;

  // Scene references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshesGroupRef = useRef<THREE.Group | null>(null);
  const dxfGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const hasInitializedCameraRef = useRef<boolean>(false);

  // Orbit state & click detection
  const isDraggingRef = useRef<boolean>(false);
  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sphericalRef = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 35,
    theta: Math.PI / 4,
    phi: Math.PI / 3,
  });
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.5, 0));

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');
    sceneRef.current = scene;

    // Fallback dimensions in case container hasn't resolved layout yet
    const initialW = container.clientWidth > 0 ? container.clientWidth : 800;
    const initialH = container.clientHeight > 0 ? container.clientHeight : 600;

    // 2. Camera with large dynamic range
    const camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.05, 50000);
    cameraRef.current = camera;

    // 3. Renderer with absolute positioning to prevent flex collapse
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialW, initialH, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.outline = 'none';

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(40, 60, 50);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6); // subtle blue fill light
    dirLight2.position.set(-40, -20, 30);
    scene.add(dirLight2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.5);
    scene.add(hemiLight);

    // 5. Ground Grid
    const gridHelper = new THREE.GridHelper(120, 120, 0x0284c7, 0x1e293b);
    gridHelper.position.set(0, 0, 0);
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Groups for BIM elements & DXF lines
    const bimGroup = new THREE.Group();
    scene.add(bimGroup);
    meshesGroupRef.current = bimGroup;

    const dxfGroup = new THREE.Group();
    scene.add(dxfGroup);
    dxfGroupRef.current = dxfGroup;

    // Camera update function
    const updateCamera = () => {
      const { radius, theta, phi } = sphericalRef.current;
      const target = targetRef.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
    };
    updateCamera();

    // Dimension updater helper
    const updateDimensions = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      updateCamera();
    };

    // Render loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver on the container to immediately respond to tab switches & layout shifts
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0) {
            updateDimensions(w, h);
            if (!hasInitializedCameraRef.current) {
              hasInitializedCameraRef.current = true;
              fitToModel();
            }
          }
        }
      });
      ro.observe(container);
    }

    // Window resize fallback
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        updateDimensions(w, h);
      }
    };
    window.addEventListener('resize', handleResize);

    // Global mouseup / pointerup to avoid stuck dragging
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('pointerup', handleGlobalMouseUp);

    // Trigger immediate layout check on next frame
    const timerId = setTimeout(() => {
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          updateDimensions(w, h);
          fitToModel();
        }
      }
    }, 40);

    return () => {
      clearTimeout(timerId);
      if (ro) ro.disconnect();
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('pointerup', handleGlobalMouseUp);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Helper to normalize dimensions to meters
  const toM = (val: number | undefined, defaultVal: number): number => {
    if (val === undefined || isNaN(val)) return defaultVal;
    if (s < 0.1 && val > 20) return val * s;
    // If drawing units are millimeters but uncalibrated (s >= 0.1) and value > 25 (e.g. 300, 400, 2000)
    if (s >= 0.1 && val > 25) return val / 1000;
    return val;
  };

  // Fit view function
  const fitToModel = () => {
    const camera = cameraRef.current;
    if (!camera) return;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minY = 0, maxY = 3.5;

    elements.forEach((el) => {
      if (el.type === 'footing') {
        const normW = toM(el.width, 2.0);
        const normL = toM(el.length, 2.0);
        if (el.points && el.points.length >= 3) {
          el.points.forEach((p) => {
            minX = Math.min(minX, p.x * s);
            maxX = Math.max(maxX, p.x * s);
            minZ = Math.min(minZ, p.y * s);
            maxZ = Math.max(maxZ, p.y * s);
          });
        } else {
          minX = Math.min(minX, el.x * s - normW / 2);
          maxX = Math.max(maxX, el.x * s + normW / 2);
          minZ = Math.min(minZ, el.y * s - normL / 2);
          maxZ = Math.max(maxZ, el.y * s + normL / 2);
        }
        minY = Math.min(minY, el.elevation || -1.5);
      } else if (el.type === 'column') {
        const normW = toM(el.width, 0.40);
        const normD = toM(el.depth, 0.40);
        const normH = toM(el.height, 3.0);
        if (el.points && el.points.length >= 3) {
          el.points.forEach((p) => {
            minX = Math.min(minX, p.x * s);
            maxX = Math.max(maxX, p.x * s);
            minZ = Math.min(minZ, p.y * s);
            maxZ = Math.max(maxZ, p.y * s);
          });
        } else {
          minX = Math.min(minX, el.x * s - normW / 2);
          maxX = Math.max(maxX, el.x * s + normW / 2);
          minZ = Math.min(minZ, el.y * s - normD / 2);
          maxZ = Math.max(maxZ, el.y * s + normD / 2);
        }
        maxY = Math.max(maxY, (el.baseElevation || 0) + normH);
      } else if (el.type === 'wall' || el.type === 'beam') {
        minX = Math.min(minX, el.startPoint.x * s, el.endPoint.x * s);
        maxX = Math.max(maxX, el.startPoint.x * s, el.endPoint.x * s);
        minZ = Math.min(minZ, el.startPoint.y * s, el.endPoint.y * s);
        maxZ = Math.max(maxZ, el.startPoint.y * s, el.endPoint.y * s);
        if (el.type === 'wall') {
          maxY = Math.max(maxY, (el.baseElevation || 0) + toM(el.height, 3.0));
        } else {
          maxY = Math.max(maxY, el.elevation || 3.2);
        }
      } else if (el.type === 'slab') {
        el.points.forEach((p) => {
          minX = Math.min(minX, p.x * s);
          maxX = Math.max(maxX, p.x * s);
          minZ = Math.min(minZ, p.y * s);
          maxZ = Math.max(maxZ, p.y * s);
        });
        maxY = Math.max(maxY, el.elevation || 3.2);
      }
    });

    // Also include DXF entities if elements are empty or few
    if ((elements.length === 0 || !isFinite(minX)) && dxfEntities && dxfEntities.length > 0) {
      dxfEntities.forEach((ent) => {
        if (ent.points && ent.points.length > 0) {
          ent.points.forEach((p) => {
            if (isFinite(p.x) && isFinite(p.y)) {
              minX = Math.min(minX, p.x * s);
              maxX = Math.max(maxX, p.x * s);
              minZ = Math.min(minZ, p.y * s);
              maxZ = Math.max(maxZ, p.y * s);
            }
          });
        }
        if (ent.center && ent.radius) {
          minX = Math.min(minX, (ent.center.x - ent.radius) * s);
          maxX = Math.max(maxX, (ent.center.x + ent.radius) * s);
          minZ = Math.min(minZ, (ent.center.y - ent.radius) * s);
          maxZ = Math.max(maxZ, (ent.center.y + ent.radius) * s);
        }
      });
      minY = 0;
      maxY = 3.0;
    }

    if (isFinite(minX) && isFinite(maxX) && isFinite(minZ) && isFinite(maxZ)) {
      const cX = (minX + maxX) / 2;
      const cZ = (minZ + maxZ) / 2;
      const cY = (minY + maxY) / 2;
      const span = Math.max(maxX - minX, maxZ - minZ, maxY - minY, 2);
      targetRef.current.set(cX, cY, cZ);
      sphericalRef.current.radius = Math.max(3, span * 1.35);
      if (gridHelperRef.current) {
        gridHelperRef.current.position.set(cX, Math.min(minY, 0), cZ);
      }
    } else {
      targetRef.current.set(0, 1.5, 0);
      sphericalRef.current = { radius: 25, theta: Math.PI / 4, phi: Math.PI / 3 };
    }

    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };

  const selectedElement = elements.find((e) => e.selected);

  const focusSelected = () => {
    if (!selectedElement || !cameraRef.current) return;
    let targetX = 0;
    let targetY = 1.5;
    let targetZ = 0;

    if (selectedElement.type === 'footing') {
      if (selectedElement.points && selectedElement.points.length >= 3) {
        targetX = (selectedElement.points.reduce((sum, p) => sum + p.x, 0) / selectedElement.points.length) * s;
        targetZ = (selectedElement.points.reduce((sum, p) => sum + p.y, 0) / selectedElement.points.length) * s;
      } else {
        targetX = selectedElement.x * s;
        targetZ = selectedElement.y * s;
      }
      targetY = selectedElement.elevation || -0.5;
    } else if (selectedElement.type === 'column') {
      if (selectedElement.points && selectedElement.points.length >= 3) {
        targetX = (selectedElement.points.reduce((sum, p) => sum + p.x, 0) / selectedElement.points.length) * s;
        targetZ = (selectedElement.points.reduce((sum, p) => sum + p.y, 0) / selectedElement.points.length) * s;
      } else {
        targetX = selectedElement.x * s;
        targetZ = selectedElement.y * s;
      }
      targetY = (selectedElement.baseElevation || 0) + 1.5;
    } else if (selectedElement.type === 'beam' || selectedElement.type === 'wall') {
      targetX = ((selectedElement.startPoint.x + selectedElement.endPoint.x) / 2) * s;
      targetZ = ((selectedElement.startPoint.y + selectedElement.endPoint.y) / 2) * s;
      targetY = selectedElement.type === 'beam' ? selectedElement.elevation || 3.0 : 1.5;
    } else if (selectedElement.type === 'slab') {
      targetX = (selectedElement.points.reduce((sum, p) => sum + p.x, 0) / selectedElement.points.length) * s;
      targetZ = (selectedElement.points.reduce((sum, p) => sum + p.y, 0) / selectedElement.points.length) * s;
      targetY = selectedElement.elevation || 3.0;
    }

    targetRef.current.set(targetX, targetY, targetZ);
    sphericalRef.current.radius = 8.0;
    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  };

  // Re-build 3D Meshes whenever elements change or wireframe changes
  useEffect(() => {
    const group = meshesGroupRef.current;
    if (!group) return;

    // Clear old meshes
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
      group.remove(obj);
    }

    // Material definitions with DoubleSide for full visibility from all 3D camera angles
    const footingMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.7,
      metalness: 0.1,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.5,
      metalness: 0.2,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      roughness: 0.5,
      metalness: 0.2,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.7,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.4,
      transparent: true,
      opacity: 0.75,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x92400e, // Warm wood door finish
      roughness: 0.6,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const windowGlassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.45,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const stairMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Cast concrete stair treads
      roughness: 0.5,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });

    // High-visibility glowing materials for selected elements in 3D
    const selectedMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.2,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });
    const selectedSlabMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
      wireframe: wireframeMode,
      side: THREE.DoubleSide,
    });

    // 1. Build 3D Footings
    elements
      .filter((e): e is FootingElement => e.type === 'footing')
      .forEach((f) => {
        const normW = toM(f.width, 2.0);
        const normL = toM(f.length, 2.0);
        const normDepth = toM(f.depth, 0.60);
        const fMat = f.selected ? selectedMat : footingMat;

        if (f.points && f.points.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(f.points[0].x * s, f.points[0].y * s);
          for (let i = 1; i < f.points.length; i++) {
            shape.lineTo(f.points[i].x * s, f.points[i].y * s);
          }
          shape.closePath();
          const geom = new THREE.ExtrudeGeometry(shape, { depth: normDepth, bevelEnabled: false });
          geom.rotateX(Math.PI / 2);
          const mesh = new THREE.Mesh(geom, fMat);
          mesh.position.set(0, f.elevation || -normDepth, 0);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { bim: f };
          group.add(mesh);
        } else {
          const geom = new THREE.BoxGeometry(normW, normDepth, normL);
          const mesh = new THREE.Mesh(geom, fMat);
          mesh.position.set(f.x * s, (f.elevation ?? -1.5) + normDepth / 2, f.y * s);
          if (f.rotation) {
            mesh.rotation.y = -(f.rotation * Math.PI) / 180;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { bim: f };
          group.add(mesh);
        }
      });

    // 2. Build 3D Columns
    elements
      .filter((e): e is ColumnElement => e.type === 'column')
      .forEach((col) => {
        const normW = toM(col.width, 0.40);
        const normD = toM(col.depth, 0.40);
        const normH = toM(col.height, 3.0);
        const cMat = col.selected ? selectedMat : columnMat;

        if (col.points && col.points.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(col.points[0].x * s, -col.points[0].y * s);
          for (let i = 1; i < col.points.length; i++) {
            shape.lineTo(col.points[i].x * s, -col.points[i].y * s);
          }
          shape.closePath();
          const geom = new THREE.ExtrudeGeometry(shape, { depth: normH, bevelEnabled: false });
          geom.rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geom, cMat);
          mesh.position.set(0, col.baseElevation || 0, 0);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { bim: col };
          group.add(mesh);
        } else {
          const geom = new THREE.BoxGeometry(normW, normH, normD);
          const mesh = new THREE.Mesh(geom, cMat);
          mesh.position.set(col.x * s, (col.baseElevation || 0) + normH / 2, col.y * s);
          if (col.rotation) {
            mesh.rotation.y = -(col.rotation * Math.PI) / 180;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { bim: col };
          group.add(mesh);
        }
      });

    // 3. Build 3D Beams
    elements
      .filter((e): e is BeamElement => e.type === 'beam')
      .forEach((b) => {
        const p1x = b.startPoint.x * s;
        const p1z = b.startPoint.y * s;
        const p2x = b.endPoint.x * s;
        const p2z = b.endPoint.y * s;
        const dx = p2x - p1x;
        const dz = p2z - p1z;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) return;

        const normW = toM(b.width, 0.30);
        const normD = toM(b.depth, 0.50);
        const geom = new THREE.BoxGeometry(normW, normD, len);
        const mesh = new THREE.Mesh(geom, b.selected ? selectedMat : beamMat);

        const midX = (p1x + p2x) / 2;
        const midZ = (p1z + p2z) / 2;
        const midY = (b.elevation || 3.20) - normD / 2;

        mesh.position.set(midX, midY, midZ);
        mesh.rotation.y = Math.atan2(dx, dz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { bim: b };
        group.add(mesh);
      });

    // 4. Build 3D Walls (With Architectural Door & Window Openings)
    elements
      .filter((e): e is WallElement => e.type === 'wall')
      .forEach((w) => {
        const p1x = w.startPoint.x * s;
        const p1z = w.startPoint.y * s;
        const p2x = w.endPoint.x * s;
        const p2z = w.endPoint.y * s;
        const dx = p2x - p1x;
        const dz = p2z - p1z;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) return;

        const normThk = toM(w.thickness, 0.20);
        const normH = toM(w.height, 3.0);
        const baseElev = w.baseElevation || 0;
        const midX = (p1x + p2x) / 2;
        const midZ = (p1z + p2z) / 2;
        const angle = Math.atan2(dx, dz);
        const mWall = w.selected ? selectedMat : wallMat;

        if (!w.openings || w.openings.length === 0) {
          const geom = new THREE.BoxGeometry(normThk, normH, len);
          const mesh = new THREE.Mesh(geom, mWall);
          mesh.position.set(midX, baseElev + normH / 2, midZ);
          mesh.rotation.y = angle;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { bim: w };
          group.add(mesh);
        } else {
          // Wall has openings: generate wall segments, lintels, sills, and door/window panels
          const wallContainer = new THREE.Group();
          wallContainer.position.set(midX, baseElev, midZ);
          wallContainer.rotation.y = angle;
          wallContainer.userData = { bim: w };

          // Sort openings by offset along wall
          const sortedOps = [...w.openings].sort((a, b) => a.offset - b.offset);
          let currentZ = -len / 2;

          sortedOps.forEach((op) => {
            const opWidth = Math.min(op.width || 0.9, len);
            const opHeight = Math.min(op.height || 2.1, normH);
            const sillH = Math.max(0, op.sillHeight || 0);
            const opStart = Math.max(-len / 2, -len / 2 + (op.offset || 0));
            const opEnd = Math.min(len / 2, opStart + opWidth);

            if (opStart > currentZ + 0.02) {
              const segLen = opStart - currentZ;
              const segGeom = new THREE.BoxGeometry(normThk, normH, segLen);
              const segMesh = new THREE.Mesh(segGeom, mWall);
              segMesh.position.set(0, normH / 2, currentZ + segLen / 2);
              segMesh.castShadow = true;
              segMesh.receiveShadow = true;
              wallContainer.add(segMesh);
            }

            const activeOpLen = opEnd - opStart;
            if (activeOpLen > 0.05) {
              const opCenterZ = (opStart + opEnd) / 2;

              // 1. Sill wall below window
              if (sillH > 0.05) {
                const sillGeom = new THREE.BoxGeometry(normThk, sillH, activeOpLen);
                const sillMesh = new THREE.Mesh(sillGeom, mWall);
                sillMesh.position.set(0, sillH / 2, opCenterZ);
                sillMesh.castShadow = true;
                sillMesh.receiveShadow = true;
                wallContainer.add(sillMesh);
              }

              // 2. Lintel wall above door/window
              const lintelH = normH - (sillH + opHeight);
              if (lintelH > 0.05) {
                const lintelGeom = new THREE.BoxGeometry(normThk, lintelH, activeOpLen);
                const lintelMesh = new THREE.Mesh(lintelGeom, mWall);
                lintelMesh.position.set(0, sillH + opHeight + lintelH / 2, opCenterZ);
                lintelMesh.castShadow = true;
                lintelMesh.receiveShadow = true;
                wallContainer.add(lintelMesh);
              }

              // 3. Opening fixture (Door leaf or Window glazing)
              if (op.type === 'door') {
                const doorGeom = new THREE.BoxGeometry(normThk * 0.35, opHeight, activeOpLen * 0.95);
                const doorMesh = new THREE.Mesh(doorGeom, doorMat);
                doorMesh.position.set(0, opHeight / 2, opCenterZ);
                doorMesh.castShadow = true;
                wallContainer.add(doorMesh);
              } else {
                // Window glass pane
                const glassGeom = new THREE.BoxGeometry(normThk * 0.2, opHeight, activeOpLen * 0.95);
                const glassMesh = new THREE.Mesh(glassGeom, windowGlassMat);
                glassMesh.position.set(0, sillH + opHeight / 2, opCenterZ);
                wallContainer.add(glassMesh);
              }
            }

            currentZ = Math.max(currentZ, opEnd);
          });

          // Final wall segment after last opening
          if (currentZ < len / 2 - 0.02) {
            const segLen = len / 2 - currentZ;
            const segGeom = new THREE.BoxGeometry(normThk, normH, segLen);
            const segMesh = new THREE.Mesh(segGeom, mWall);
            segMesh.position.set(0, normH / 2, currentZ + segLen / 2);
            segMesh.castShadow = true;
            segMesh.receiveShadow = true;
            wallContainer.add(segMesh);
          }

          group.add(wallContainer);
        }
      });

    // 5. Build 3D Slabs (With Holes for Staircase Openings and Shafts)
    elements
      .filter((e): e is SlabElement => e.type === 'slab')
      .forEach((slab) => {
        if (slab.points.length < 3) return;
        const shape = new THREE.Shape();
        shape.moveTo(slab.points[0].x * s, slab.points[0].y * s);
        for (let i = 1; i < slab.points.length; i++) {
          shape.lineTo(slab.points[i].x * s, slab.points[i].y * s);
        }
        shape.closePath();

        // Punch holes for slab openings (staircases, shafts)
        if (slab.openings && slab.openings.length > 0) {
          slab.openings.forEach((op) => {
            if (op.points && op.points.length >= 3) {
              const hole = new THREE.Path();
              hole.moveTo(op.points[0].x * s, op.points[0].y * s);
              for (let j = 1; j < op.points.length; j++) {
                hole.lineTo(op.points[j].x * s, op.points[j].y * s);
              }
              hole.closePath();
              shape.holes.push(hole);

              // If it's a staircase opening, build 3D stair flight steps descending down
              if (op.type === 'stair') {
                const stairContainer = new THREE.Group();
                const minX = Math.min(...op.points.map((p) => p.x * s));
                const maxX = Math.max(...op.points.map((p) => p.x * s));
                const minY = Math.min(...op.points.map((p) => p.y * s));
                const maxY = Math.max(...op.points.map((p) => p.y * s));
                const stairW = Math.max(0.6, maxX - minX);
                const stairL = Math.max(1.2, maxY - minY);
                const numSteps = 12;
                const totalH = 3.0; // standard floor height
                const stepH = totalH / numSteps;
                const stepTread = stairL / numSteps;
                const slabElev = slab.elevation || 3.20;

                for (let k = 0; k < numSteps; k++) {
                  const stepGeom = new THREE.BoxGeometry(stairW * 0.95, stepH, stepTread);
                  const stepMesh = new THREE.Mesh(stepGeom, stairMat);
                  const stepY = slabElev - k * stepH - stepH / 2;
                  const stepZ = minY + k * stepTread + stepTread / 2;
                  stepMesh.position.set((minX + maxX) / 2, stepY, stepZ);
                  stepMesh.castShadow = true;
                  stepMesh.receiveShadow = true;
                  stairContainer.add(stepMesh);
                }
                group.add(stairContainer);
              }
            }
          });
        }

        const normThk = toM(slab.thickness, 0.20);
        const extrudeSettings = {
          depth: normThk,
          bevelEnabled: false,
        };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2);

        const mesh = new THREE.Mesh(geom, slab.selected ? selectedSlabMat : slabMat);
        mesh.position.set(0, slab.elevation || 3.20, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { bim: slab };
        group.add(mesh);
      });

    // Auto-fit when elements are first added or when switching from empty to populated
    if (elements.length > 0 && !hasInitializedCameraRef.current) {
      hasInitializedCameraRef.current = true;
      fitToModel();
    }
  }, [elements, wireframeMode, s]);

  // Update DXF Underlay lines at ground plane (Y=0)
  useEffect(() => {
    const dxfGroup = dxfGroupRef.current;
    if (!dxfGroup) return;

    while (dxfGroup.children.length > 0) {
      const obj = dxfGroup.children[0] as THREE.LineSegments;
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
      dxfGroup.remove(obj);
    }

    if (!showDxfUnderlay || !dxfEntities || dxfEntities.length === 0) return;

    const linePositions: number[] = [];
    dxfEntities.forEach((ent) => {
      if (ent.points && ent.points.length >= 2) {
        for (let i = 0; i < ent.points.length - 1; i++) {
          linePositions.push(ent.points[i].x * s, 0.02, ent.points[i].y * s);
          linePositions.push(ent.points[i + 1].x * s, 0.02, ent.points[i + 1].y * s);
        }
      } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
        const segs = 32;
        const cx = ent.center.x * s;
        const cy = ent.center.y * s;
        const r = ent.radius * s;
        for (let i = 0; i < segs; i++) {
          const t1 = (i / segs) * Math.PI * 2;
          const t2 = ((i + 1) / segs) * Math.PI * 2;
          linePositions.push(
            cx + Math.cos(t1) * r,
            0.02,
            cy + Math.sin(t1) * r
          );
          linePositions.push(
            cx + Math.cos(t2) * r,
            0.02,
            cy + Math.sin(t2) * r
          );
        }
      }
    });

    if (linePositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
      });
      const lines = new THREE.LineSegments(geom, mat);
      dxfGroup.add(lines);
    }
  }, [dxfEntities, showDxfUnderlay]);

  // Mouse Controls (Orbit / Pan / Zoom / Raycast Selection)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cameraRef.current) return;

    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    if (e.buttons === 1 && !e.shiftKey) {
      // Left click orbit
      sphericalRef.current.theta -= deltaX * 0.008;
      sphericalRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI / 2 - 0.02, sphericalRef.current.phi - deltaY * 0.008)
      );
    } else if (e.buttons === 2 || e.buttons === 4 || e.shiftKey) {
      // Right click, middle wheel click, or shift-drag: pan
      const factor = Math.max(0.5, sphericalRef.current.radius) * 0.0018;
      targetRef.current.x -= deltaX * factor * Math.cos(sphericalRef.current.theta);
      targetRef.current.z += deltaX * factor * Math.sin(sphericalRef.current.theta);
      targetRef.current.y += deltaY * factor;
    }

    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isDraggingRef.current = false;

    // Check if this was a click (not a camera drag)
    const moveDist = Math.hypot(
      e.clientX - mouseDownPosRef.current.x,
      e.clientY - mouseDownPosRef.current.y
    );

    if (moveDist < 6 && containerRef.current && cameraRef.current && meshesGroupRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const intersects = raycaster.intersectObjects(meshesGroupRef.current.children, true);

      if (intersects.length > 0) {
        // Find hit object with bim data
        const hit = intersects.find((i) => i.object.userData && i.object.userData.bim);
        if (hit && hit.object.userData.bim) {
          // Center orbit target on clicked element for precise close-up orbit and inspection
          targetRef.current.lerp(hit.point, 0.7);
          const { radius, theta, phi } = sphericalRef.current;
          const target = targetRef.current;
          const camera = cameraRef.current;
          camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
          camera.position.y = target.y + radius * Math.cos(phi);
          camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
          camera.lookAt(target);

          onSelectElement?.(hit.object.userData.bim);
          return;
        }
      }
      // Clicked on empty space
      onDeselect?.();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!cameraRef.current || !containerRef.current) return;
    const zoomFactor = e.deltaY < 0 ? 0.82 : 1.18;

    // Zoom towards mouse cursor when scrolling in:
    if (e.deltaY < 0 && meshesGroupRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const hits = raycaster.intersectObjects(meshesGroupRef.current.children, true);

      let targetPoint: THREE.Vector3 | null = null;
      if (hits.length > 0) {
        targetPoint = hits[0].point;
      } else {
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const planeIntersect = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, planeIntersect)) {
          targetPoint = planeIntersect;
        }
      }

      if (targetPoint) {
        targetRef.current.lerp(targetPoint, 0.22);
      }
    }

    // Allow zooming down to 0.02m (2cm) for micro inspection, and up to 50,000m for huge sites
    sphericalRef.current.radius = Math.max(0.02, Math.min(50000, sphericalRef.current.radius * zoomFactor));

    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  };

  const handleZoom = (factor: number) => {
    if (!cameraRef.current) return;
    sphericalRef.current.radius = Math.max(0.02, Math.min(50000, sphericalRef.current.radius * factor));
    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  };

  // View presets
  const setViewPreset = (type: 'iso' | 'top' | 'front') => {
    if (!cameraRef.current) return;
    if (type === 'iso') {
      sphericalRef.current.theta = Math.PI / 4;
      sphericalRef.current.phi = Math.PI / 3;
    } else if (type === 'top') {
      sphericalRef.current.theta = 0;
      sphericalRef.current.phi = 0.05;
    } else if (type === 'front') {
      sphericalRef.current.theta = 0;
      sphericalRef.current.phi = Math.PI / 2 - 0.05;
    }
    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;
    const camera = cameraRef.current;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070b14]">
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top 3D Controls Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs font-semibold text-white backdrop-blur-md flex items-center gap-2 shadow-lg">
          <Box className="w-4 h-4 text-cyan-400" />
          <span>3D Structural BIM</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono">
            {elements.length} Members
          </span>
        </div>

        <button
          onClick={() => setWireframeMode(!wireframeMode)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border backdrop-blur-md transition flex items-center gap-1.5 shadow ${
            wireframeMode
              ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300'
              : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
          }`}
          title="Toggle Solid vs Wireframe"
        >
          <Layers className="w-3.5 h-3.5" />
          {wireframeMode ? 'Wireframe ON' : 'Solid Shading'}
        </button>

        {dxfEntities && dxfEntities.length > 0 && (
          <button
            onClick={() => setShowDxfUnderlay(!showDxfUnderlay)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border backdrop-blur-md transition flex items-center gap-1.5 shadow ${
              showDxfUnderlay
                ? 'bg-sky-600/30 border-sky-400 text-sky-300'
                : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle DXF Ground Plan Underlay in 3D"
          >
            <MapPin className="w-3.5 h-3.5" />
            DXF Plan Underlay
          </button>
        )}
      </div>

      {/* View Presets & Fit Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg shadow transition"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom(1.25)}
          className="p-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg shadow transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={fitToModel}
          className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 hover:text-white rounded-lg shadow transition flex items-center gap-1"
          title="Fit Camera to All 3D Members"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Fit Model
        </button>
        {selectedElement && (
          <button
            onClick={focusSelected}
            className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-xs font-semibold text-amber-300 hover:text-white rounded-lg shadow transition flex items-center gap-1"
            title="Focus Camera on Selected Item"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            Focus Item
          </button>
        )}
        <button
          onClick={() => setViewPreset('iso')}
          className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg shadow transition"
        >
          Isometric
        </button>
        <button
          onClick={() => setViewPreset('top')}
          className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg shadow transition"
        >
          Top Plan
        </button>
        <button
          onClick={() => setViewPreset('front')}
          className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg shadow transition"
        >
          Elevation
        </button>
        <button
          onClick={fitToModel}
          className="p-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg shadow transition"
          title="Reset View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3D Navigation Guide */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 font-mono backdrop-blur-sm shadow">
          Left Drag: Orbit 360° • Right Drag: Pan • Scroll: Zoom
        </div>
      </div>
    </div>
  );
};
