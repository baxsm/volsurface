import { OrbitControls } from "@react-three/drei";
import { type FC, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  colOffset,
  ivHeight,
  rowDepth,
  STAGE,
  type SurfaceBounds,
  sliceAtExpiry,
  sliceAtMoneyness,
} from "@/lib/surface-geometry";
import type { SurfaceGrid } from "@/lib/types";

/** the floor grid and the box the surface sits in, drawn faint so it reads as a
    stage and never competes with the mesh */
export const Stage: FC<{ bounds: SurfaceBounds }> = () => {
  const lines = useMemo(() => {
    const points: number[] = [];
    const halfWidth = STAGE.width / 2;
    const halfDepth = STAGE.depth / 2;
    const divisions = 8;

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const x = -halfWidth + STAGE.width * t;
      const z = -halfDepth + STAGE.depth * t;
      points.push(x, 0, -halfDepth, x, 0, halfDepth);
      points.push(-halfWidth, 0, z, halfWidth, 0, z);
    }

    return new Float32Array(points);
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(lines, 3));
    return geo;
  }, [lines]);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#21252c", transparent: true, opacity: 0.55 }),
    [],
  );

  return <lineSegments geometry={geometry} material={material} />;
};

/** r3f wants a fixed-length tuple, which a plain array literal does not satisfy */
const vec3 = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

interface SlicePlaneProps {
  grid: SurfaceGrid;
  bounds: SurfaceBounds;
  axis: "expiry" | "moneyness";
  index: number;
}

/**
 * the plane the user sweeps through the surface. it is drawn where the cut is
 * taken, so the 2D smile in the readout is visibly the curve under this plane.
 */
export const SlicePlane: FC<SlicePlaneProps> = ({ grid, bounds, axis, index }) => {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#35e0c8",
        transparent: true,
        // barely there. a solid plane sized to the stage reads as a wall
        // standing behind the surface rather than a cut taken through it, and
        // it darkens everything seen through it.
        opacity: 0.03,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const edgeMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#35e0c8", transparent: true, opacity: 0.55 }),
    [],
  );

  const { position, rotation, size } = useMemo(() => {
    // only as tall as the surface itself, so the plane never towers over it
    const height = STAGE.height * 1.06;

    if (axis === "expiry") {
      // spans only the moneyness this expiry was quoted over. sized to the full
      // stage it juts past the mesh, which reads as a floating pane rather than
      // a cut through the surface.
      const quoted = (grid.iv[index] ?? [])
        .map((iv, col) => (iv === null ? -1 : col))
        .filter((col) => col >= 0);
      const first = quoted[0] ?? 0;
      const last = quoted[quoted.length - 1] ?? grid.moneyness.length - 1;

      const left = colOffset(grid, first, bounds);
      const right = colOffset(grid, last, bounds);

      return {
        position: vec3((left + right) / 2, height / 2, rowDepth(grid, index, bounds)),
        rotation: vec3(0, 0, 0),
        size: [Math.max(right - left, 0.05), height] as [number, number],
      };
    }

    const supported = grid.iv
      .map((row, rowIndex) => (row[index] === null || row[index] === undefined ? -1 : rowIndex))
      .filter((rowIndex) => rowIndex >= 0);
    const firstRow = supported[0] ?? 0;
    const lastRow = supported[supported.length - 1] ?? grid.years.length - 1;

    const near = rowDepth(grid, firstRow, bounds);
    const far = rowDepth(grid, lastRow, bounds);

    return {
      position: vec3(colOffset(grid, index, bounds), height / 2, (near + far) / 2),
      rotation: vec3(0, Math.PI / 2, 0),
      size: [Math.max(far - near, 0.05), height] as [number, number],
    };
  }, [axis, grid, index, bounds]);

  const edges = useMemo(() => {
    const [w, h] = size;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        // biome-ignore format: the corner ring reads better as one loop
        new Float32Array([
          -w / 2, -h / 2, 0,  w / 2, -h / 2, 0,
           w / 2, -h / 2, 0,  w / 2,  h / 2, 0,
           w / 2,  h / 2, 0, -w / 2,  h / 2, 0,
          -w / 2,  h / 2, 0, -w / 2, -h / 2, 0,
        ]),
        3,
      ),
    );
    return geo;
  }, [size]);

  // the curve where the plane meets the surface. this is the line the 2D
  // readout draws, so seeing it lit on the mesh is what connects the two.
  const cutGeometry = useMemo(() => {
    const points: number[] = [];
    const bump = 0.004;

    if (axis === "expiry") {
      const cut = sliceAtExpiry(grid, index);
      const z = rowDepth(grid, index, bounds);
      if (cut !== null) {
        for (const point of cut.points) {
          const col = grid.moneyness.indexOf(point.moneyness);
          points.push(
            colOffset(grid, col, bounds),
            ivHeight(point.iv, bounds) * STAGE.height + bump,
            z,
          );
        }
      }
    } else {
      const x = colOffset(grid, index, bounds);
      for (const point of sliceAtMoneyness(grid, index)) {
        const row = grid.years.indexOf(point.years);
        points.push(
          x,
          ivHeight(point.iv, bounds) * STAGE.height + bump,
          rowDepth(grid, row, bounds),
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3));
    return geo;
  }, [axis, grid, index, bounds]);

  // built as a three object rather than a <line> tag: that tag name resolves to
  // the SVG element in JSX, not to three's Line
  const cut = useMemo(
    () =>
      new THREE.Line(
        cutGeometry,
        new THREE.LineBasicMaterial({ color: "#f2e9a0", transparent: true, opacity: 0.95 }),
      ),
    [cutGeometry],
  );

  // the cut is rebuilt every time the plane moves, so the old geometry and
  // material have to go with it or a sweep leaks one of each per step
  useEffect(
    () => () => {
      cut.geometry.dispose();
      (cut.material as THREE.Material).dispose();
    },
    [cut],
  );

  return (
    <group>
      <group position={position} rotation={rotation}>
        <mesh material={material}>
          <planeGeometry args={size} />
        </mesh>
        <lineSegments geometry={edges} material={edgeMaterial} />
      </group>
      <primitive object={cut} />
    </group>
  );
};

/**
 * soft studio lighting: one key, one cool rim, and enough ambient that the
 * troughs stay readable instead of going black.
 *
 * kept deliberately dim. the mesh carries the vol ramp in its vertex colours,
 * and a bright white key washes those toward the pale end of the ramp until a
 * teal midsection renders near white - the lighting has to shape the surface
 * without repainting it.
 */
export const StudioLights: FC = () => (
  <>
    <ambientLight intensity={0.32} />
    <directionalLight position={[3.5, 5, 2.5]} intensity={0.85} color="#ffffff" />
    <directionalLight position={[-4, 2.5, -3]} intensity={0.45} color="#7fd6ff" />
    <directionalLight position={[0, -3, 1]} intensity={0.14} color="#35e0c8" />
  </>
);

interface ControlsProps {
  reducedMotion: boolean;
}

export const Controls: FC<ControlsProps> = ({ reducedMotion }) => (
  <OrbitControls
    makeDefault
    // orbit around the middle of the surface, not the floor it stands on
    target={[0, STAGE.height * 0.45, 0]}
    enableDamping={!reducedMotion}
    dampingFactor={0.08}
    enablePan={false}
    minDistance={2.6}
    maxDistance={9}
    // below the floor the surface reads upside down, and straight overhead it
    // collapses to a flat sheet, so the polar angle stops short of both
    minPolarAngle={0.15}
    maxPolarAngle={Math.PI / 2.1}
    rotateSpeed={0.7}
    zoomSpeed={0.7}
  />
);
