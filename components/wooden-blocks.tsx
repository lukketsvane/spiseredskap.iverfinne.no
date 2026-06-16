"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { ContactShadows, Html, useGLTF } from "@react-three/drei"
import {
  Physics,
  RigidBody,
  CuboidCollider,
  ConvexHullCollider,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier"
import * as THREE from "three"
import { RotateCcw, Smartphone, Volume2, VolumeX } from "lucide-react"
import { playImpact, setMuted, unlockAudio } from "@/lib/impact-sound"

const BODY_DYNAMIC = 0
const BODY_KINEMATIC_POSITION = 2

type TiltState = {
  enabled: boolean
  beta: number
  gamma: number
}

/* ------------------------------------------------------------------ */
/*  Utensil catalogue                                                   */
/* ------------------------------------------------------------------ */
type GlbBlock = {
  id: string
  name: string
  modelPath: string
  targetSize: number   // desired longest dimension in scene units
  pos: [number, number, number]
  rot?: [number, number, number]
}

const ITEMS: GlbBlock[] = [
  {
    // dims 0.52×0.27×1.0 — long double spoon
    id: "s01", name: "Dobbel treskje",
    modelPath: "/models/spiseredskap_01.glb", targetSize: 3.2,
    pos: [-2.2, 3.0, -2.2], rot: [0, 0.4, 0],
  },
  {
    // dims 0.57×1.0×1.0 — compact massage/wellness tool
    id: "s02", name: "Massasjeverktøy",
    modelPath: "/models/spiseredskap_02.glb", targetSize: 2.5,
    pos: [0.3, 3.5, -2.5], rot: [0, -0.3, 0],
  },
  {
    // dims 1.0×0.31×0.66 — wide flat loop/scoop
    id: "s03", name: "Treøse II",
    modelPath: "/models/spiseredskap_03.glb", targetSize: 3.1,
    pos: [2.4, 3.0, -2.2], rot: [0, 0.8, 0],
  },
  {
    // dims 0.39×0.91×1.0 — narrow tall loop
    id: "s04", name: "Treøse",
    modelPath: "/models/spiseredskap_04.glb", targetSize: 2.9,
    pos: [-2.6, 3.0, 0.5], rot: [0, 1.2, 0],
  },
  {
    // dims 0.53×0.39×1.0 — small play spoon
    id: "s05", name: "Lekeskje",
    modelPath: "/models/spiseredskap_05.glb", targetSize: 2.8,
    pos: [0, 4.0, 0.3], rot: [0, -0.6, 0],
  },
  {
    // dims 1.0×0.47×1.0 — square-footprint spoon
    id: "s06", name: "Treskje",
    modelPath: "/models/spiseredskap_06.glb", targetSize: 3.2,
    pos: [2.6, 3.0, 0.5], rot: [0, -1.0, 0],
  },
  {
    // dims 0.59×0.55×1.0 — stool/chair, largest piece
    id: "s07", name: "Trestol",
    modelPath: "/models/spiseredskap_07.glb", targetSize: 3.8,
    pos: [0, 3.5, 2.8], rot: [0, 0.2, 0],
  },
  {
    // dims 0.98×0.45×0.70 — wide low bowl
    id: "s08", name: "Trebolle",
    modelPath: "/models/spiseredskap_08.glb", targetSize: 2.3,
    pos: [-1.8, 3.5, 2.3], rot: [0, 0.6, 0],
  },
  {
    // dims 0.60×0.25×0.98 — long flat ladle
    id: "s09", name: "Tresleiv",
    modelPath: "/models/spiseredskap_09.glb", targetSize: 3.5,
    pos: [2.2, 4.5, -0.8], rot: [0, -0.5, 0],
  },
  {
    // dims 0.41×0.98×0.73 — tall narrow sculpture
    id: "s10", name: "Treskulptur",
    modelPath: "/models/spiseredskap_10.glb", targetSize: 3.0,
    pos: [-3.0, 3.2, -0.6], rot: [0, 1.1, 0],
  },
  {
    // dims 0.43×0.43×0.98 — medium spoon
    id: "s11", name: "Treskje II",
    modelPath: "/models/spiseredskap_11.glb", targetSize: 3.1,
    pos: [1.0, 5.0, -0.4], rot: [0, -0.9, 0],
  },
  {
    // dims 0.53×0.28×0.98 — small play sculpture
    id: "s12", name: "Lekeskulptur",
    modelPath: "/models/spiseredskap_12.glb", targetSize: 2.6,
    pos: [-1.1, 4.2, -0.9], rot: [0, 0.3, 0],
  },
  {
    // dims 0.88×0.24×0.98 — wide very shallow three-legged bowl
    id: "s13", name: "Trefotbolle",
    modelPath: "/models/spiseredskap_13.glb", targetSize: 2.4,
    pos: [3.0, 3.8, 1.9], rot: [0, -0.4, 0],
  },
]

// Preload all models
ITEMS.forEach((item) => useGLTF.preload(item.modelPath))

/* ------------------------------------------------------------------ */
/*  Camera + tray layout                                               */
/* ------------------------------------------------------------------ */
const CAM_FOV = 36
const TARGET_HALF_X = 4.4
const TARGET_HALF_Z = 4.4
const BOX_INSET = 0.9
const WALL_HALF_THICK = 0.4
const WALL_VIS_HEIGHT = 3.0
const WALL_COL_HEIGHT = 16

type Box = { bx: number; bz: number }

function boxLayout(aspect: number) {
  const halfV = Math.tan((CAM_FOV / 2) * (Math.PI / 180))
  const dist = Math.max(TARGET_HALF_X / (halfV * aspect), TARGET_HALF_Z / halfV) + 0.5
  const halfX = dist * halfV * aspect
  const halfZ = dist * halfV
  return { dist, bx: halfX * BOX_INSET, bz: halfZ * BOX_INSET }
}

function useBox(): Box {
  const size = useThree((s) => s.size)
  return useMemo(() => {
    const { bx, bz } = boxLayout(size.width / size.height)
    return { bx, bz }
  }, [size.width, size.height])
}

type Wall = { half: [number, number, number]; pos: [number, number, number] }

function buildWalls({ bx, bz }: Box, height: number): Wall[] {
  const t = WALL_HALF_THICK
  const h = height / 2
  return [
    { half: [t, h, bz + 2 * t], pos: [-(bx + t), h, 0] },
    { half: [t, h, bz + 2 * t], pos: [bx + t, h, 0] },
    { half: [bx + 2 * t, h, t], pos: [0, h, -(bz + t)] },
    { half: [bx + 2 * t, h, t], pos: [0, h, bz + t] },
  ]
}

/* ------------------------------------------------------------------ */
/*  Inner GLB loader – provides both convex hull collider + visual     */
/*  Must be inside a Suspense boundary (useGLTF suspends on load)     */
/* ------------------------------------------------------------------ */
function GlbInner({
  block,
  onPointerDown,
}: {
  block: GlbBlock
  onPointerDown: (e: any) => void
}) {
  const { scene } = useGLTF(block.modelPath)

  const { cloned, hullVerts } = useMemo(() => {
    const c = scene.clone(true)

    // scale to targetSize along longest axis
    const box0 = new THREE.Box3().setFromObject(c)
    const size0 = box0.getSize(new THREE.Vector3())
    const maxDim = Math.max(size0.x, size0.y, size0.z)
    if (maxDim > 0) c.scale.setScalar(block.targetSize / maxDim)

    // re-centre on bounding box centre so the pivot is central
    c.updateMatrixWorld(true)
    const centre = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3())
    c.position.sub(centre)
    c.updateMatrixWorld(true)

    // collect world-space vertices for the convex hull collider
    const verts: number[] = []
    let meshIdx = 0
    c.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.geometry?.attributes.position) {
        const pos = mesh.geometry.attributes.position
        const mat = mesh.matrixWorld
        const v = new THREE.Vector3()
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mat)
          verts.push(v.x, v.y, v.z)
        }
        mesh.castShadow = true
        mesh.receiveShadow = true
        const mtl = mesh.material as THREE.MeshStandardMaterial
        if (mtl?.isMeshStandardMaterial) {
          // clone material so per-mesh variation doesn't mutate shared instances
          const m = mtl.clone()
          mesh.material = m
          const base = isNaN(m.roughness) ? 0.76 : m.roughness
          // subtle per-mesh imperfection — mimics micro surface variation in hand-worked wood
          const jitter = [-0.04, 0, +0.05, -0.02, +0.03][meshIdx % 5]
          m.roughness = THREE.MathUtils.clamp(base + jitter, 0.55, 0.94)
          m.metalness = 0
          m.envMapIntensity = 0
          meshIdx++
        }
      }
    })

    return { cloned: c, hullVerts: new Float32Array(verts) }
  }, [scene, block.targetSize])

  return (
    <>
      {hullVerts.length > 0 && <ConvexHullCollider args={[hullVerts]} />}
      <primitive object={cloned} onPointerDown={onPointerDown} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  A single draggable utensil                                         */
/* ------------------------------------------------------------------ */
function GlbBlockBody({
  block,
  bodyRef,
  onGrab,
  measureMode,
  selected,
  onSelect,
  gestureRef,
  onDetail,
  detailId,
}: {
  block: GlbBlock
  bodyRef: (b: RapierRigidBody | null) => void
  onGrab: (body: RapierRigidBody, point: THREE.Vector3, radius: number) => void
  measureMode: boolean
  selected: boolean
  onSelect: (id: string) => void
  gestureRef: React.MutableRefObject<{ fingers: number }>
  onDetail: (id: string | null) => void
  detailId: string | null
}) {
  const ref = useRef<RapierRigidBody>(null)
  const radius = block.targetSize * 0.65
  const lastTapRef = useRef(0)

  const handlePointerDown = (e: any) => {
    e.stopPropagation()
    if (!ref.current) return
    if (gestureRef.current.fingers >= 3) return

    const now = performance.now()
    const isDoubleTap = now - lastTapRef.current < 350
    lastTapRef.current = now

    if (isDoubleTap) {
      // Toggle detail spotlight: double-tap to enter, double-tap again to exit
      onDetail(detailId === block.id ? null : block.id)
      return
    }

    // If this item is in detail mode, a single tap exits detail mode
    if (detailId === block.id) {
      onDetail(null)
      return
    }

    if (measureMode) { onSelect(block.id); return }
    if (detailId) return // don't drag while another item is spotlit
    onGrab(ref.current, e.point.clone(), radius)
  }

  const pitch = THREE.MathUtils.clamp(1.4 - 0.3 * radius, 0.7, 1.4)

  const handleImpact = (payload: {
    target: { rigidBody?: RapierRigidBody }
    other: { rigidBody?: RapierRigidBody }
  }) => {
    const a = payload.target.rigidBody
    if (!a) return
    const av = a.linvel()
    let speed = Math.hypot(av.x, av.y, av.z)
    const b = payload.other.rigidBody
    if (b) {
      const bv = b.linvel()
      speed = Math.max(speed, Math.hypot(bv.x, bv.y, bv.z))
    }
    const strength = THREE.MathUtils.clamp((speed - 0.45) / 7, 0, 1)
    if (strength > 0) playImpact(strength, pitch)
  }

  return (
    <RigidBody
      ref={(r) => { ref.current = r; bodyRef(r) }}
      position={block.pos}
      rotation={block.rot}
      colliders={false}
      friction={1.2}
      restitution={0.01}
      density={65}
      linearDamping={0.55}
      angularDamping={0.65}
      canSleep={false}
      onCollisionEnter={handleImpact}
      ccd
    >
      <Suspense fallback={
        // thin placeholder collider while model streams in
        <CuboidCollider args={[block.targetSize / 2, block.targetSize / 4, block.targetSize / 2]} />
      }>
        <GlbInner block={block} onPointerDown={handlePointerDown} />
      </Suspense>

      {measureMode && selected && (
        <Html position={[0, block.targetSize / 2 + 0.5, 0]} center distanceFactor={10} zIndexRange={[100, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-md border border-black/5 bg-background/95 px-2.5 py-1.5 text-center shadow-lg">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {block.name}
            </span>
          </div>
        </Html>
      )}
    </RigidBody>
  )
}

/* ------------------------------------------------------------------ */
/*  Tilt controller                                                     */
/* ------------------------------------------------------------------ */
const G = 28

function TiltController({
  tiltRef,
  lightRef,
  lightManualRef,
}: {
  tiltRef: React.MutableRefObject<TiltState>
  lightRef: React.MutableRefObject<THREE.DirectionalLight | null>
  lightManualRef: React.MutableRefObject<{ x: number; z: number }>
}) {
  const { world } = useRapier()
  const cur = useRef({ beta: 0, gamma: 0 })

  useFrame(() => {
    const t = tiltRef.current
    const targetBeta = t.enabled ? t.beta : 0
    const targetGamma = t.enabled ? t.gamma : 0

    cur.current.beta += (targetBeta - cur.current.beta) * 0.12
    cur.current.gamma += (targetGamma - cur.current.gamma) * 0.12

    const b = THREE.MathUtils.clamp(cur.current.beta, -55, 55) * (Math.PI / 180)
    const g = THREE.MathUtils.clamp(cur.current.gamma, -55, 55) * (Math.PI / 180)

    const gx = Math.sin(g)
    const gz = Math.sin(b)
    const gy = -Math.max(Math.cos(b) * Math.cos(g), 0.15)
    const v = new THREE.Vector3(gx, gy, gz).normalize().multiplyScalar(G)

    if (world) {
      world.gravity.x = v.x
      world.gravity.y = v.y
      world.gravity.z = v.z
    }

    if (lightRef.current) {
      lightRef.current.position.set(
        -9 + gx * 8 + lightManualRef.current.x,
        16,
        -6 + gz * 8 + lightManualRef.current.z,
      )
    }
  })

  return null
}

/* ------------------------------------------------------------------ */
/*  Scene contents                                                      */
/* ------------------------------------------------------------------ */
type DragState = {
  body: RapierRigidBody
  plane: THREE.Plane
  offset: THREE.Vector3
  last: THREE.Vector3
  vel: THREE.Vector3
  time: number
  radius: number
}

const MIN_LIFT = 0.35
const MAX_LIFT = WALL_VIS_HEIGHT - 0.6
const THROW_MAX = 2.5
const ESCAPE_MARGIN = 0.4

function SceneContents({
  measureMode,
  selectedId,
  setSelectedId,
  registerReset,
  tiltRef,
  detailId,
  setDetailId,
}: {
  measureMode: boolean
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  registerReset: (fn: () => void) => void
  tiltRef: React.MutableRefObject<TiltState>
  detailId: string | null
  setDetailId: (id: string | null) => void
}) {
  const { camera, gl, size } = useThree()
  const box = useBox()
  const boxRef = useRef(box)
  boxRef.current = box
  const colliderWalls = useMemo(() => buildWalls(box, WALL_COL_HEIGHT), [box])
  const visibleWalls = useMemo(() => buildWalls(box, WALL_VIS_HEIGHT), [box])
  const shadowSpan = Math.max(box.bx, box.bz) + 1.5
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const lightManualRef = useRef({ x: 0, z: 0 })
  const gestureRef = useRef({ fingers: 0 })
  const bodies = useRef<Record<string, RapierRigidBody | null>>({})
  const drag = useRef<DragState | null>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    lightRef.current?.shadow.camera.updateProjectionMatrix()
  }, [shadowSpan])

  useEffect(() => {
    registerReset(() => {
      setDetailId(null)
      ITEMS.forEach((b) => {
        const body = bodies.current[b.id]
        if (!body) return
        body.setBodyType(BODY_DYNAMIC, true)
        body.setTranslation({ x: b.pos[0], y: b.pos[1], z: b.pos[2] }, true)
        const e = new THREE.Euler(...(b.rot ?? [0, 0, 0]))
        const q = new THREE.Quaternion().setFromEuler(e)
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      })
    })
  }, [registerReset, setDetailId])

  // When detailId changes: freeze the spotlit item kinematic; release the previous one
  const prevDetailId = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevDetailId.current
    prevDetailId.current = detailId
    if (prev && prev !== detailId) {
      const body = bodies.current[prev]
      if (body) {
        body.setBodyType(BODY_DYNAMIC, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
    if (detailId) {
      // terminate any active drag first
      if (drag.current) {
        drag.current.body.setBodyType(BODY_DYNAMIC, true)
        drag.current.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        drag.current = null
        gl.domElement.style.cursor = "grab"
      }
      const body = bodies.current[detailId]
      if (body) {
        body.setBodyType(BODY_KINEMATIC_POSITION, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
  }, [detailId, gl])

  const onGrab = useCallback(
    (body: RapierRigidBody, point: THREE.Vector3, radius: number) => {
      gl.domElement.style.cursor = "grabbing"
      const t = body.translation()
      const center = new THREE.Vector3(t.x, t.y, t.z)
      const liftY = THREE.MathUtils.clamp(point.y, MIN_LIFT, MAX_LIFT)
      body.setBodyType(BODY_KINEMATIC_POSITION, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      drag.current = {
        body,
        plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -liftY),
        offset: center.sub(point),
        last: new THREE.Vector3(point.x, liftY, point.z),
        vel: new THREE.Vector3(),
        time: performance.now(),
        radius,
      }
    },
    [gl],
  )

  useEffect(() => {
    const el = gl.domElement
    const ndc = new THREE.Vector2()

    const setNdc = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      setNdc(e)
      raycaster.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(d.plane, hit)) return
      const target = hit.add(d.offset)
      target.y = -d.plane.constant
      const { bx, bz } = boxRef.current
      const lx = Math.max(bx - d.radius, 0)
      const lz = Math.max(bz - d.radius, 0)
      target.x = THREE.MathUtils.clamp(target.x, -lx, lx)
      target.z = THREE.MathUtils.clamp(target.z, -lz, lz)
      const now = performance.now()
      const dt = Math.max((now - d.time) / 1000, 1 / 240)
      d.vel.copy(target).sub(d.last).multiplyScalar(1 / dt)
      d.last.copy(target)
      d.time = now
      d.body.setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z })
    }

    const onUp = () => {
      const d = drag.current
      if (!d) return
      el.style.cursor = "grab"
      d.body.setBodyType(BODY_DYNAMIC, true)
      const v = d.vel.clone()
      if (v.length() > THROW_MAX) v.setLength(THROW_MAX)
      d.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true)
      d.body.setAngvel(
        { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4 },
        true,
      )
      drag.current = null
    }

    el.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      el.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [camera, gl, raycaster, size.width, size.height])

  useEffect(() => {
    const el = gl.domElement
    const prev = new Map<number, { x: number; y: number }>()

    const onTouchStart = (e: TouchEvent) => {
      gestureRef.current.fingers = e.touches.length
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        prev.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      gestureRef.current.fingers = e.touches.length
      if (e.touches.length >= 3 && drag.current) {
        // 3-finger light pan: release any active drag immediately
        const d = drag.current
        d.body.setBodyType(BODY_DYNAMIC, true)
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        drag.current = null
        el.style.cursor = "grab"
      }
      if (e.touches.length !== 3) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          prev.set(t.identifier, { x: t.clientX, y: t.clientY })
        }
        return
      }
      e.preventDefault()
      let dx = 0, dz = 0, count = 0
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        const p = prev.get(t.identifier)
        if (p) { dx += t.clientX - p.x; dz += t.clientY - p.y; count++ }
        prev.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
      if (count > 0) {
        const SENS = 0.04
        lightManualRef.current.x = THREE.MathUtils.clamp(lightManualRef.current.x + (dx / count) * SENS, -8, 8)
        lightManualRef.current.z = THREE.MathUtils.clamp(lightManualRef.current.z + (dz / count) * SENS, -8, 8)
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      gestureRef.current.fingers = e.touches.length
      for (let i = 0; i < e.changedTouches.length; i++) prev.delete(e.changedTouches[i].identifier)
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [gl])

  const detailQ = useRef(new THREE.Quaternion())
  useFrame(() => {
    const { bx, bz } = boxRef.current

    // Animate the spotlit item to a centred floating position
    if (detailId) {
      const body = bodies.current[detailId]
      if (body) {
        const t = body.translation()
        body.setNextKinematicTranslation({
          x: t.x + (0 - t.x) * 0.07,
          y: t.y + (8.5 - t.y) * 0.07,
          z: t.z + (0 - t.z) * 0.07,
        })
        const rot = body.rotation()
        detailQ.current.set(rot.x, rot.y, rot.z, rot.w)
        detailQ.current.slerp(new THREE.Quaternion(), 0.06)
        body.setNextKinematicRotation(detailQ.current)
      }
    }

    // Escape recovery: return out-of-bounds items to safety
    for (const b of ITEMS) {
      if (b.id === detailId) continue // detailId body is kinematic, skip
      const body = bodies.current[b.id]
      if (!body) continue
      if (drag.current?.body === body) continue
      const t = body.translation()
      const r = b.targetSize * 0.65
      const escaped =
        Math.abs(t.x) > bx + ESCAPE_MARGIN ||
        Math.abs(t.z) > bz + ESCAPE_MARGIN ||
        t.y < -0.5 ||
        t.y > WALL_COL_HEIGHT
      if (!escaped) continue
      body.setTranslation(
        {
          x: THREE.MathUtils.clamp(t.x, -(bx - r), bx - r),
          y: THREE.MathUtils.clamp(t.y, r + 0.05, WALL_VIS_HEIGHT),
          z: THREE.MathUtils.clamp(t.z, -(bz - r), bz - r),
        },
        true,
      )
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  })

  return (
    <>
      {/* Ambient: near-zero — lifts pure-black shadows just enough to read detail */}
      <ambientLight intensity={0.018} color="#ffeedd" />

      {/* KEY LIGHT — warm directional, lower altitude (y=16 not 22) so shadows
          cast at ~60° from overhead and are visible to the top-down camera.
          Follows device tilt via TiltController. */}
      <directionalLight
        ref={lightRef}
        position={[-9, 16, -6]}
        intensity={2.5}
        color="#fff7ec"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={70}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-bias={-0.00022}
        shadow-normalBias={0.04}
        shadow-radius={2.5}
      />

      {/* KICKER / RIM — cool blue-grey, far upper-right-back, no shadow.
          Separates object edges from the floor, creates depth. */}
      <directionalLight
        position={[12, 10, 10]}
        intensity={0.38}
        color="#bdd0f0"
      />

      {/* PRACTICAL A — warm amber point light, low front-right, simulates
          a nearby candle/lamp. Physically-correct inverse-square falloff. */}
      <pointLight
        position={[5.5, 1.6, 4.5]}
        intensity={11}
        color="#ff8c2a"
        distance={15}
        decay={2}
      />

      {/* PRACTICAL B — softer warm bounce from opposite side, simulates
          secondary window or indirect bounce from a wall. Negative-fill
          side deliberately left dark — no source from upper-right-front. */}
      <pointLight
        position={[-5.5, 2.4, -4.5]}
        intensity={3.8}
        color="#ffd0a0"
        distance={11}
        decay={2}
      />

      {/* FLOOR BOUNCE — very low warm glow from the floor plane,
          fills the underside of raised/tilted objects subtly. */}
      <pointLight
        position={[0, 0.08, 0]}
        intensity={1.4}
        color="#ffe0c0"
        distance={7}
        decay={2}
      />

      {/* Contact shadows: sharper blur for tight contact, wider far for
          soft penumbra as objects lift off the surface. */}
      <ContactShadows
        position={[0, 0.002, 0]}
        scale={shadowSpan * 2.2}
        resolution={2048}
        far={4.5}
        blur={0.65}
        opacity={0.88}
        color="#150d04"
      />

      {/* DETAIL SPOTLIGHT: dark overlay plane sits above all resting items (y=6)
          but below the spotlit item (y=8.5). The z-buffer ensures the overlay
          does not overdraw the spotlit item which is closer to the camera. */}
      {detailId && (
        <>
          <mesh position={[0, 6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[300, 300]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.82} depthWrite={false} />
          </mesh>
          <Html
            position={[0, 10.5, 0]}
            center
            distanceFactor={14}
            zIndexRange={[200, 0]}
          >
            <div className="pointer-events-none select-none whitespace-nowrap rounded-lg border border-white/10 bg-black/60 px-4 py-2 text-center backdrop-blur-sm">
              <span className="block text-xs font-semibold uppercase tracking-widest text-white/80">
                {ITEMS.find((i) => i.id === detailId)?.name}
              </span>
            </div>
          </Html>
          {/* Tap the dark overlay to exit detail mode */}
          <mesh
            position={[0, 6.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={() => setDetailId(null)}
          >
            <planeGeometry args={[300, 300]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </>
      )}

      <TiltController tiltRef={tiltRef} lightRef={lightRef} lightManualRef={lightManualRef} />

      <RigidBody type="fixed" colliders={false} friction={0.9} restitution={0.04}>
        <CuboidCollider args={[60, 1, 60]} position={[0, -1, 0]} />
        {colliderWalls.map((w, i) => (
          <CuboidCollider key={i} args={w.half} position={w.pos} restitution={0.04} />
        ))}
      </RigidBody>

      {/* Floor: warm neutral grey, matte — chosen as the tray base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#ccc8c0" roughness={0.95} metalness={0} envMapIntensity={0} />
      </mesh>

      {/* Walls: slightly darker neutral grey, extended 0.05 below y=0 to
          eliminate the z-fighting light stripe at the wall-floor junction. */}
      {visibleWalls.map((w, i) => (
        <mesh
          key={`wall-${i}`}
          position={[w.pos[0], w.pos[1] - 0.05, w.pos[2]]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[w.half[0] * 2, w.half[1] * 2 + 0.1, w.half[2] * 2]} />
          <meshStandardMaterial color="#b8b4ac" roughness={0.92} metalness={0} envMapIntensity={0} />
        </mesh>
      ))}

      {ITEMS.map((b) => (
        <GlbBlockBody
          key={b.id}
          block={b}
          bodyRef={(r) => (bodies.current[b.id] = r)}
          onGrab={onGrab}
          measureMode={measureMode}
          selected={selectedId === b.id}
          onSelect={(id) => setSelectedId(id)}
          gestureRef={gestureRef}
          onDetail={setDetailId}
          detailId={detailId}
        />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Camera rig                                                          */
/* ------------------------------------------------------------------ */
function CameraRig() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const aspect = size.width / size.height
    const { dist } = boxLayout(aspect)
    const cam = camera as THREE.PerspectiveCamera
    cam.up.set(0, 0, -1)
    cam.position.set(0, dist, 0)
    cam.lookAt(0, 0, 0)
    cam.fov = CAM_FOV
    cam.aspect = aspect
    cam.updateProjectionMatrix()
  }, [camera, size])

  return null
}

/* ------------------------------------------------------------------ */
/*  Public component                                                    */
/* ------------------------------------------------------------------ */
export default function WoodenBlocks() {
  const [measureMode, setMeasureMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [tiltOn, setTiltOn] = useState(false)
  const [muted, setMutedState] = useState(false)
  const resetRef = useRef<() => void>(() => {})
  const tiltRef = useRef<TiltState>({ enabled: false, beta: 0, gamma: 0 })
  const iconRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener("pointerdown", unlock, { once: true })
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  useEffect(() => {
    const el = iconRef.current
    if (!tiltOn) {
      if (el) el.style.transform = ""
      return
    }
    let raf = 0
    const cur = { beta: 0, gamma: 0 }
    const loop = () => {
      const t = tiltRef.current
      cur.gamma += (t.gamma - cur.gamma) * 0.18
      cur.beta += (t.beta - cur.beta) * 0.18
      const ry = Math.max(-48, Math.min(48, cur.gamma))
      const rx = Math.max(-48, Math.min(48, cur.beta))
      if (iconRef.current) {
        iconRef.current.style.transform = `perspective(140px) rotateY(${ry}deg) rotateX(${-rx}deg)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tiltOn])

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const angle = (typeof screen !== "undefined" && screen.orientation?.angle) ?? 0
    const b = e.beta ?? 0
    const g = e.gamma ?? 0
    // Screen orientation correction: in landscape the device axes are rotated
    // relative to the scene axes, so swap and sign-flip beta/gamma to match.
    if (angle === 90) {
      // landscape — home button right
      tiltRef.current.beta = g
      tiltRef.current.gamma = -b
    } else if (angle === 270 || angle === -90) {
      // landscape — home button left
      tiltRef.current.beta = -g
      tiltRef.current.gamma = b
    } else {
      // portrait (default)
      tiltRef.current.beta = b
      tiltRef.current.gamma = g
    }
  }, [])

  useEffect(() => {
    return () => window.removeEventListener("deviceorientation", onOrient)
  }, [onOrient])

  const toggleTilt = useCallback(async () => {
    if (tiltOn) {
      window.removeEventListener("deviceorientation", onOrient)
      tiltRef.current.enabled = false
      setTiltOn(false)
      return
    }
    const DOE = window.DeviceOrientationEvent as any
    try {
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission()
        if (res !== "granted") return
      }
    } catch {
      return
    }
    window.addEventListener("deviceorientation", onOrient)
    tiltRef.current.enabled = true
    setTiltOn(true)
  }, [tiltOn, onOrient])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#e8e4de]">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        camera={{ position: [0, 30, 0], fov: CAM_FOV, near: 0.1, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.06
          gl.shadowMap.type = THREE.PCFSoftShadowMap
          gl.domElement.style.cursor = "grab"
        }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#e8e4de"]} />
        <CameraRig />
        <Physics
          gravity={[0, -G, 0]}
          timeStep={1 / 120}
          numSolverIterations={8}
          maxCcdSubsteps={4}
          interpolate
        >
          <SceneContents
            measureMode={measureMode}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            registerReset={(fn) => (resetRef.current = fn)}
            tiltRef={tiltRef}
            detailId={detailId}
            setDetailId={setDetailId}
          />
        </Physics>
      </Canvas>

      <div className="pointer-events-none absolute bottom-7 right-7 z-10 flex flex-col gap-3">
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => {
            const next = !muted
            setMutedState(next)
            setMuted(next)
          }}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-foreground opacity-40 transition hover:opacity-90"
        >
          {muted ? <VolumeX className="h-5 w-5" strokeWidth={2.4} /> : <Volume2 className="h-5 w-5" strokeWidth={2.4} />}
        </button>
        <button
          type="button"
          aria-label="Tilt to control gravity"
          aria-pressed={tiltOn}
          onClick={toggleTilt}
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-foreground transition ${tiltOn ? "opacity-100" : "opacity-40 hover:opacity-90"}`}
        >
          <span ref={iconRef} className="flex items-center justify-center [transform-style:preserve-3d]">
            <Smartphone className="h-5 w-5" strokeWidth={2.4} />
          </span>
        </button>
        <button
          type="button"
          aria-label="Reset"
          onClick={() => {
            setSelectedId(null)
            resetRef.current()
          }}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-foreground opacity-40 transition hover:opacity-90"
        >
          <RotateCcw className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>

    </div>
  )
}
