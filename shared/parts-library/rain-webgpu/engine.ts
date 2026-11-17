/**
 * 雨夜引擎（编排器）：加载城景与夜空，装底光与后处理管线，
 * 再挂灯位/自发光/雨/湿膜；帧末 pipeline.render() 出画。
 *
 * 帧序：控件 → 灯笼微闪/闪电/雨雷声 → 高度图（隔帧）→ 雨 →
 * 湿膜/河面 → 河面烤图 → 一组路面烤图（两组轮转）→ 管线渲染。
 *
 * 相比参考实现（yisky/rainy-night-webgpu）的改动：
 * - 进度/状态通过回调上报，由 React 层渲染加载浮层；
 * - WebGPU 采样上限先探适配器再钳制，避免超限导致设备创建失败；
 * - ClusteredLighting 仅在 WebGPU 后端启用（WebGL2 回退走默认前向光照）；
 * - 音频与导览按钮由 React 层渲染，本引擎只暴露开关 API；
 * - 自适应性能档：弱 GPU 上自动降像素比、节流倒影烤图，避免 0fps 死亡螺旋。
 */

import { NoToneMapping, PCFShadowMap, PerspectiveCamera, Scene } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js'
import { WebGPURenderer } from 'three/webgpu'

import { createNightAmbient } from './atmosphere/ambient'
import { createPostPipeline } from './atmosphere/post'
import { createNightSky } from './atmosphere/sky'
import { createHorizonFill } from './atmosphere/horizon'
import { createRoadBridgeWet } from './ground/road-wet'
import { createPlanarPuddleReflect } from './ground/planar-reflect'
import { createCanalWater } from './water/canal'
import { createHeightMap } from './rain/height-map'
import { createRain } from './rain/rain'
import { createRainAudio } from './audio/rain-audio'
import { createLightning } from './lightning/lightning'
import { createLanternFlicker } from './city/lantern-flicker'
import { setupLanternEmissive } from './city/lantern-emissive'
import { setupLanternTableLights } from './city/lantern-lights'
import { loadCity } from './city/load'
import { setupTextureEmissive } from './city/texture-emissive'
import { setupWindowEmissive } from './city/window-emissive'
import { createSceneTour } from './tour/tour'

/** 像素比上限按性能档：2=满（≤2x DPR）、1=中（≤1.35x）、0=低（≤1x）。 */
const PERF_TIER_MAX_DPR = [ 1.0, 1.35, 2.0 ] as const

/** 性能评估窗口（毫秒）；首个窗口更短，弱卡尽快降档。 */
const PERF_WINDOW_MS = 2500
const PERF_FIRST_WINDOW_MS = 1500

/** 降档阈值：窗口平均帧耗超过此值（≈<24fps）就降一档。 */
const PERF_DROP_MS = 42

/** 升档阈值：窗口平均帧耗低于此值（≈>50fps）且冷却期已过才试升一档。 */
const PERF_RAISE_MS = 20
const PERF_RAISE_COOLDOWN_MS = 12000

/** 低档下烤图节流：河面/路面每 N 帧一烤（0 档=2，其余=1）。 */
const BAKE_EVERY_BY_TIER = [ 2, 1, 1 ] as const

/** 加载阶段说明（中文，展示在加载浮层）。 */
export interface EngineProgress {
        stage: string
        /** 0~1 总进度。 */
        ratio: number
}

export type EngineStatus = 'loading' | 'ready' | 'error'

export interface RainyNightEngineOptions {
        host: HTMLElement
        onProgress?: ( progress: EngineProgress ) => void
        onStatus?: ( status: EngineStatus, detail?: string ) => void
        /** 每帧回调（供 FPS 浮层）。 */
        onFrame?: ( ms: number, drawCalls: number ) => void
        /** 导览播放状态变化回调（含 start/stop）。 */
        onTourPlayingChange?: ( playing: boolean ) => void
}

export interface RainyNightEngineHandle {
        startTour: () => void
        stopTour: () => void
        setAudioMuted: ( muted: boolean ) => boolean
        getAudioMuted: () => boolean
        /** 是否已解锁且未静音（供按钮点亮状态轮询）。 */
        getAudioAudible: () => boolean
        dispose: () => void
}

/**
 * 启动雨夜引擎。返回句柄；dispose 后所有资源释放。
 */
export function startRainyNightEngine( options: RainyNightEngineOptions ): RainyNightEngineHandle {
        const { host, onProgress, onStatus, onFrame, onTourPlayingChange } = options

        let disposed = false
        let renderer: WebGPURenderer | undefined
        let frame = 0
        let controls: OrbitControls | undefined
        let cleanupExtras: () => void = () => {}
        const weatherAudio = createRainAudio()
        /** 创建导览句柄；就绪前调用会被忽略。 */
        const tourRef: { current: { start: () => void; stop: () => void } | null } = { current: null }

        const report = ( stage: string, ratio: number ) => {
                onProgress?.( { stage, ratio: Math.max( 0, Math.min( 1, ratio ) ) } )
        }

        /**
         * 异步启动：渲染器 → 城/夜空 → 底光 → 后处理管线 → 灯/雨/湿膜 → 循环。
         */
        async function boot(): Promise< () => void > {
                // —— 1. 渲染器 ——
                // 6 盏立方体阴影 + 材质贴图可能顶到默认 16 张采样贴图以上；
                // 先探适配器支持再钳制，超限请求会让设备创建失败。
                let requiredLimits: { maxSampledTexturesPerShaderStage: number } | undefined
                try {
                        const gpu = ( navigator as unknown as {
                                gpu?: { requestAdapter: () => Promise< { limits: { maxSampledTexturesPerShaderStage: number } } | null > }
                        } ).gpu
                        if ( typeof window !== 'undefined' && gpu ) {
                                const adapter = await gpu.requestAdapter()
                                const maxTex = adapter?.limits.maxSampledTexturesPerShaderStage
                                if ( maxTex && maxTex > 16 ) {
                                        requiredLimits = { maxSampledTexturesPerShaderStage: Math.min( 48, maxTex ) }
                                }
                        }
                } catch {
                        /* 探测失败走默认 */
                }

                renderer = new WebGPURenderer( {
                        antialias: true,
                        ...( requiredLimits ? { requiredLimits } : {} ),
                } )
                await renderer.init()
                const isWebGPUBackend = Boolean( ( renderer as unknown as { backend?: { isWebGPUBackend?: boolean } } ).backend?.isWebGPUBackend )
                console.info( '[rainy-night] renderer backend', { isWebGPUBackend } )
                if ( isWebGPUBackend ) {
                        // 无阴影点光走 Forward+ cluster；带阴影的 6 盏仍走传统材质灯
                        renderer.lighting = new ClusteredLighting( 32, 32, 24, 24 )
                }
                if ( disposed ) {
                        renderer.dispose()
                        return () => {}
                }
                report( '初始化渲染器', 0.04 )

                renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) )
                renderer.setSize( host.clientWidth, host.clientHeight )
                renderer.setClearColor( 0x0c141c, 1 )
                // 渲染器保持线性，倒影烤图才不会被 ACES 压两遍
                renderer.toneMapping = NoToneMapping
                renderer.toneMappingExposure = 1.05
                renderer.shadowMap.enabled = true
                renderer.shadowMap.type = PCFShadowMap
                // 自管 rAF，帧计数自己 reset
                renderer.info.autoReset = false
                host.appendChild( renderer.domElement )

                // —— 2. 场景 / 相机 / 轨道 ——
                const scene = new Scene()
                const camera = new PerspectiveCamera(
                        45,
                        host.clientWidth / Math.max( host.clientHeight, 1 ),
                        0.1,
                        400,
                )
                camera.position.set( 45.343, 21.692, 38.276 )
                controls = new OrbitControls( camera, renderer.domElement )
                controls.enableDamping = false
                controls.target.set( 1.926, 5.597, -4.203 )
                controls.maxPolarAngle = Math.PI * 0.49
                controls.minDistance = 4
                controls.maxDistance = 120
                controls.update()

                // —— 3. 城模（大文件，占进度大头）——
                report( '载入城郭', 0.06 )
                const city = await loadCity( {
                        renderer,
                        onProgress: ( ratio ) => report( '载入城郭', 0.06 + ratio * 0.62 ),
                } )
                if ( disposed ) {
                        return () => {}
                }
                scene.add( city.root )
                city.root.updateMatrixWorld( true )
                report( '点亮夜空', 0.72 )

                // —— 4. 夜空 / 底光 / 后处理管线 ——
                const sky = await createNightSky( { scene, renderer, camera } )
                const horizon = createHorizonFill( { scene, cityRoot: city.root } )
                const nightAmbient = createNightAmbient( scene )
                const post = createPostPipeline( { renderer, scene, camera } )
                const lightning = createLightning( { scene, camera } )
                weatherAudio.setAutoThunder( false )
                report( '挂灯笼灯位', 0.78 )

                // —— 5. 自发光与灯位表（正式点光）——
                const lanternGlow = setupLanternEmissive( city.lanternCandidates, city.root )
                const tableLights = await setupLanternTableLights( scene, city.root, {
                        enableShadows: true,
                        appliedScale: city.appliedScale,
                } )
                const shopGlow = setupTextureEmissive( city.root )
                const windowGlow = setupWindowEmissive( city.root )
                const lanternFlicker = createLanternFlicker( {
                        lights: tableLights.lights,
                        lanternRoots: city.lanternCandidates,
                } )
                report( '落下雨丝', 0.84 )

                // —— 6. 高度图 / 雨 / 路桥湿膜 ——
                const heightMap = createHeightMap( { scene, renderer } )
                const rain = await createRain( {
                        scene,
                        renderer,
                        heightMap,
                        camera,
                } )
                if ( disposed ) {
                        rain.dispose()
                        heightMap.dispose()
                        lightning.dispose()
                        horizon.dispose()
                        return () => {}
                }
                report( '浸湿路面', 0.9 )

                const roadWet = await createRoadBridgeWet( { scene, cityRoot: city.root } )
                const roadCluster0 = roadWet.clusters[ 0 ]!
                const roadCluster1 = roadWet.clusters[ 1 ]!
                const planarReflect0 = createPlanarPuddleReflect( {
                        scene,
                        planeY: roadCluster0.planeY,
                        aspect: camera.aspect,
                        resolution: 512,
                        strength: 2.5,
                        includeSky: true,
                        mirrorFar: 40,
                        bakeEmissiveGain: 6,
                        generateMipmaps: true,
                } )
                const planarReflect1 = createPlanarPuddleReflect( {
                        scene,
                        planeY: roadCluster1.planeY,
                        aspect: camera.aspect,
                        resolution: 384,
                        strength: 2.5,
                        includeSky: true,
                        mirrorFar: 40,
                        bakeEmissiveGain: 6,
                        generateMipmaps: true,
                } )
                roadWet.attachPlanarReflect( [
                        { sampleNode: planarReflect0.sampleNode, uTextureMatrix: planarReflect0.uTextureMatrix, planeY: roadCluster0.planeY },
                        { sampleNode: planarReflect1.sampleNode, uTextureMatrix: planarReflect1.uTextureMatrix, planeY: roadCluster1.planeY },
                ], heightMap )
                // 真河道：克隆 sm_water 几何；河面单独平面烤图
                const canalWater = createCanalWater( { scene, cityRoot: city.root } )
                const canalReflect = createPlanarPuddleReflect( {
                        scene,
                        planeY: canalWater.planeY,
                        aspect: camera.aspect,
                        resolution: 512,
                        strength: 2.5,
                        includeSky: true,
                        bakeMode: 'canalBanks',
                        bankMaxDistance: 18,
                        bankReferenceObjects: canalWater.meshes,
                        bankFlowDir: canalWater.flowDir,
                        mirrorFar: 60,
                        bakeEmissiveGain: 6,
                        // 河面整块镜子：跳过阈值须紧
                        skipPosEps: 1e-4,
                        skipQuatEps: 1e-5,
                } )
                canalWater.attachPlanarReflect( canalReflect.sampleNode, canalReflect.uStrength, canalReflect.uTextureMatrix )
                if ( disposed ) {
                        canalReflect.dispose()
                        canalWater.dispose()
                        planarReflect1.dispose()
                        planarReflect0.dispose()
                        roadWet.dispose()
                        rain.dispose()
                        heightMap.dispose()
                        lightning.dispose()
                        horizon.dispose()
                        return () => {}
                }
                report( '汇流成镜', 0.97 )

                // 城模/点光/湿膜都挂好后再烘阴影；灯位静态，矩阵只更这一次
                tableLights.update()
                tableLights.requestShadowUpdate()

                // —— 自适应性能档（弱 GPU 保险）：2=满、1=中、0=低 ——
                let perfTier = 2
                let perfWindowStart = 0
                let perfFrames = 0
                let perfMsSum = 0
                let perfFirstWindow = true
                let perfLastChange = 0
                let frameIndex = 0

                /** 按档位套像素比并重设尺寸（post 管线跟随 resize）。 */
                const applyPerfTier = (): void => {
                        const dpr = window.devicePixelRatio || 1
                        const capped = Math.min( dpr, PERF_TIER_MAX_DPR[ perfTier ] ?? 2.0 )
                        renderer.setPixelRatio( capped )
                        renderer.setSize( host.clientWidth, Math.max( host.clientHeight, 1 ) )
                        post.resize( host.clientWidth, Math.max( host.clientHeight, 1 ) )
                        console.info( '[rainy-night] 性能档', { tier: perfTier, pixelRatio: capped } )
                }

                const onResize = () => {
                        const w = host.clientWidth
                        const h = Math.max( host.clientHeight, 1 )
                        camera.aspect = w / h
                        camera.updateProjectionMatrix()
                        // 套当前性能档的像素比上限，避免 resize 把降档打回满档
                        const dpr = window.devicePixelRatio || 1
                        renderer!.setPixelRatio( Math.min( dpr, PERF_TIER_MAX_DPR[ perfTier ] ?? 2.0 ) )
                        renderer!.setSize( w, h )
                        post.resize( w, h )
                        canalReflect.forceNextBake()
                        planarReflect0.forceNextBake()
                        planarReflect1.forceNextBake()
                }
                window.addEventListener( 'resize', onResize )
                onResize()

                let lastMs = performance.now()
                const heightHide = [ rain.root, sky.mesh, horizon.root, lightning.root, ...roadWet.reflectOverlays ]
                const reflectHide = [ ...roadWet.reflectOverlays, ...canalWater.reflectMeshes ]
                const hideObjects = [
                        ...roadWet.overlays,
                        ...reflectHide,
                        ...canalWater.meshes,
                        rain.root,
                        horizon.root,
                ]
                const roadVis0 = roadWet.getClusterReflectOverlays( 0 )
                const roadVis1 = roadWet.getClusterReflectOverlays( 1 )
                const roadBakes = [
                        {
                                reflect: planarReflect0,
                                visibilityMeshes: roadVis0,
                        },
                        {
                                reflect: planarReflect1,
                                visibilityMeshes: roadVis1,
                        },
                ] as const
                let roadBakeTurn = 0
                const tour = createSceneTour( {
                        camera,
                        controls,
                        cityRoot: city.root,
                        canalY: canalWater.planeY,
                        onCue: ( name ) => {
                                if ( name === 'lightning' ) {
                                        lightning.strikeNow( camera, performance.now() * 0.001 )
                                }
                        },
                        onPlayingChange: onTourPlayingChange,
                } )

                const tick = () => {
                        frame = requestAnimationFrame( tick )
                        if ( disposed ) return
                        const now = performance.now()
                        const dt = Math.min( 0.05, ( now - lastMs ) / 1000 )
                        const frameMs = now - lastMs
                        lastMs = now
                        renderer!.info.reset()

                        // —— 性能档评估：窗口均值超阈值降档，恢复后冷却升档 ——
                        if ( perfWindowStart === 0 ) {
                                perfWindowStart = now
                                perfLastChange = now
                        }
                        perfFrames += 1
                        perfMsSum += Math.min( frameMs, 2000 )
                        const windowLen = perfFirstWindow ? PERF_FIRST_WINDOW_MS : PERF_WINDOW_MS
                        if ( now - perfWindowStart >= windowLen && perfFrames > 0 ) {
                                const avgMs = perfMsSum / perfFrames
                                const canChange = now - perfLastChange > ( perfFirstWindow ? 0 : 3000 )
                                if ( canChange ) {
                                        if ( avgMs > PERF_DROP_MS && perfTier > 0 ) {
                                                perfTier -= 1
                                                perfLastChange = now
                                                applyPerfTier()
                                                canalReflect.forceNextBake()
                                                planarReflect0.forceNextBake()
                                                planarReflect1.forceNextBake()
                                        } else if (
                                                avgMs < PERF_RAISE_MS &&
                                                perfTier < 2 &&
                                                now - perfLastChange > PERF_RAISE_COOLDOWN_MS
                                        ) {
                                                perfTier += 1
                                                perfLastChange = now
                                                applyPerfTier()
                                                canalReflect.forceNextBake()
                                                planarReflect0.forceNextBake()
                                                planarReflect1.forceNextBake()
                                        }
                                }
                                perfWindowStart = now
                                perfFrames = 0
                                perfMsSum = 0
                                perfFirstWindow = false
                        }
                        frameIndex += 1
                        const bakeEvery = BAKE_EVERY_BY_TIER[ perfTier ] ?? 1

                        if ( tour.playing ) tour.update( dt )
                        else controls?.update()
                        // 微闪须在倒影烤图之前，强度才进镜子
                        lanternFlicker.update( now * 0.001 )
                        const flash = lightning.update( now * 0.001, camera )
                        post.setLightningFill( flash.fill )
                        if ( flash.forceBake ) {
                                canalReflect.forceNextBake()
                        }
                        if ( flash.thunderDelay !== null ) {
                                weatherAudio.playThunderClip( flash.thunderDelay )
                        }
                        weatherAudio.update( now * 0.001 )

                        // 高度图须在雨之前；排除天穹和倒影叠层
                        heightMap.update( {
                                camera,
                                hideObjects: heightHide,
                        } )
                        rain.update( dt, camera )
                        roadWet.update( dt )
                        canalWater.update( dt )
                        // 河面烤图：满档每帧；低档每 2 帧（配合 forceNextBake 补位）
                        // 路面两组错帧轮转；低档下同样按 bakeEvery 节流
                        if ( frameIndex % bakeEvery === 0 || flash.forceBake ) {
                                canalReflect.update( {
                                        renderer: renderer!,
                                        camera,
                                        hideObjects,
                                } )
                        }
                        if ( frameIndex % ( bakeEvery * 2 ) === 0 ) {
                                const roadBake = roadBakes[ roadBakeTurn ]!
                                roadBakeTurn = ( roadBakeTurn + 1 ) % roadBakes.length
                                roadBake.reflect.update( {
                                        renderer: renderer!,
                                        camera,
                                        hideObjects,
                                        visibilityMeshes: roadBake.visibilityMeshes,
                                        visibilityMaxDistance: 35,
                                } )
                        }
                        post.render()
                        onFrame?.( frameMs, renderer!.info.render.drawCalls )
                }
                tourRef.current = tour
                tick()
                report( '雨夜已至', 1 )
                onStatus?.( 'ready' )

                let cleaned = false
                const cleanup = () => {
                        if ( cleaned ) return
                        cleaned = true
                        cancelAnimationFrame( frame )
                        window.removeEventListener( 'resize', onResize )
                        // 业务先拆，后处理后建先拆
                        canalReflect.dispose()
                        canalWater.dispose()
                        planarReflect1.dispose()
                        planarReflect0.dispose()
                        roadWet.dispose()
                        rain.dispose()
                        heightMap.dispose()
                        shopGlow.dispose()
                        windowGlow.dispose()
                        lanternFlicker.dispose()
                        lightning.dispose()
                        tableLights.dispose()
                        lanternGlow.dispose()
                        post.dispose()
                        nightAmbient.dispose()
                        horizon.dispose()
                        sky.dispose()
                        tour.dispose()
                        controls?.dispose()
                        scene.remove( city.root )
                }

                cleanupExtras = cleanup
                return cleanup
        }

        let cleanupInner: () => void = () => {}
        onStatus?.( 'loading' )
        report( '唤醒引擎', 0.01 )
        boot()
                .then( ( fn ) => {
                        cleanupInner = fn
                } )
                .catch( ( err: unknown ) => {
                        console.error( '[rainy-night] 雨夜启动失败', err )
                        onStatus?.( 'error', err instanceof Error ? err.message : String( err ) )
                } )

        return {
                startTour: () => {
                        tourRef.current?.start()
                },
                stopTour: () => {
                        tourRef.current?.stop()
                },
                setAudioMuted: ( muted: boolean ) => weatherAudio.setMuted( muted ),
                getAudioMuted: () => weatherAudio.muted,
                getAudioAudible: () => weatherAudio.audible,
                dispose: () => {
                        disposed = true
                        weatherAudio.dispose()
                        cleanupInner()
                        cleanupExtras()
                        tourRef.current = null
                        if ( renderer ) {
                                renderer.dispose()
                                if ( renderer.domElement.parentNode === host ) {
                                        host.removeChild( renderer.domElement )
                                }
                        }
                },
        }
}
