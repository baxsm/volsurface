import { useFrame } from "@react-three/fiber";
import { type FC, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  buildSurfaceMesh,
  canMorph,
  morphPositions,
  type SurfaceMesh,
} from "@/lib/surface-geometry";
import type { SurfaceGrid } from "@/lib/types";

interface SurfaceMeshViewProps {
  grid: SurfaceGrid;
  /** the grid being morphed away from, so a snapshot change tweens rather than snaps */
  previous: SurfaceGrid | null;
  showWireframe: boolean;
  instant: boolean;
  onMorphSettled?: () => void;
}

/** seconds the surface takes to travel between two snapshot fits */
const MORPH_SECONDS = 0.9;

const useDisposable = <T extends { dispose: () => void }>(make: () => T, deps: unknown[]): T => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller owns the dependency list
  const resource = useMemo(make, deps);

  useEffect(() => () => resource.dispose(), [resource]);
  return resource;
};

/**
 * the shaded surface, its teal wireframe, and the morph between two snapshot
 * fits. positions are written into the existing attribute buffer on each frame
 * of a morph rather than rebuilding geometry, so a scrub never reallocates.
 */
export const SurfaceMeshView: FC<SurfaceMeshViewProps> = ({
  grid,
  previous,
  showWireframe,
  instant,
  onMorphSettled,
}) => {
  const target = useMemo(() => buildSurfaceMesh(grid), [grid]);
  const from = useMemo(() => (previous === null ? null : buildSurfaceMesh(previous)), [previous]);

  const geometry = useDisposable(() => new THREE.BufferGeometry(), []);
  const wireGeometry = useDisposable(() => new THREE.BufferGeometry(), []);
  const edgeGeometry = useDisposable(() => new THREE.BufferGeometry(), []);

  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.44,
        metalness: 0.08,
        flatShading: false,
      }),
    [],
  );

  const wireMaterial = useDisposable(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#35e0c8"),
        transparent: true,
        opacity: 0.16,
      }),
    [],
  );

  // brighter than the wireframe: this traces where the fit stops, which is
  // information, not decoration
  const edgeMaterial = useDisposable(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#6fe9c8"),
        transparent: true,
        opacity: 0.55,
      }),
    [],
  );

  const morph = useRef({ elapsed: 0, running: false });
  const scratch = useRef<Float32Array | null>(null);

  // rebuilding the attributes is the only place the buffers change size, so a
  // grid swap re-uploads once and every morph frame then writes in place
  useEffect(() => {
    if (target === null) return;

    const morphable = from !== null && canMorph(from, target) && !instant;
    const start = morphable && from !== null ? from.positions : target.positions;

    const positions = new Float32Array(start);
    scratch.current = positions;

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(target.colors), 3));
    geometry.setIndex(new THREE.BufferAttribute(target.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    wireGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    wireGeometry.setIndex(new THREE.BufferAttribute(target.wireIndices, 1));

    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    edgeGeometry.setIndex(new THREE.BufferAttribute(target.edgeIndices, 1));

    morph.current = { elapsed: 0, running: morphable };
    if (!morphable) onMorphSettled?.();
  }, [target, from, instant, geometry, wireGeometry, edgeGeometry, onMorphSettled]);

  useFrame((_state, delta) => {
    if (!morph.current.running || target === null || from === null) return;

    const positions = scratch.current;
    if (positions === null) return;

    morph.current.elapsed += delta;
    const raw = Math.min(morph.current.elapsed / MORPH_SECONDS, 1);
    // ease-in-out so the surface settles rather than arriving at full speed
    const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - (-2 * raw + 2) ** 3 / 2;

    morphPositions(from.positions, target.positions, eased, positions);

    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    geometry.computeVertexNormals();

    const wireAttribute = wireGeometry.getAttribute("position") as THREE.BufferAttribute;
    wireAttribute.needsUpdate = true;
    const edgeAttribute = edgeGeometry.getAttribute("position") as THREE.BufferAttribute;
    edgeAttribute.needsUpdate = true;

    if (raw >= 1) {
      morph.current.running = false;
      onMorphSettled?.();
    }
  });

  if (target === null) return null;

  return (
    <group>
      <mesh geometry={geometry} material={material} castShadow={false} receiveShadow={false} />
      {showWireframe && <lineSegments geometry={wireGeometry} material={wireMaterial} />}
      <lineSegments geometry={edgeGeometry} material={edgeMaterial} />
    </group>
  );
};

export type { SurfaceMesh };
