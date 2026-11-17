/**
 * 雨夜后处理管线：
 * 场景 pass → 雨层相加 → 泛光 → 高度雾 → 闪电 → ACES 色调映射 → 抖动。
 *
 * 雨丝/水花与闪电是 Additive 粒子/管子，与场景同 pass 会把黑底写进成色，
 * 故各自单独 pass（与场景 pass 共用深度）后再相加叠回。
 * 雾色与天穹地平同一套冷青灰，把小岛城边化进雨雾。
 *
 * 移植自 yisky/rainy-night-webgpu（CC 技术参考）。
 */

import {
	ACESFilmicToneMapping,
	Color,
	DepthTexture,
	Layers,
	RenderPipeline,
	SRGBColorSpace,
	Vector2,
	Vector3,
	type Camera,
	type Node,
	type Scene,
	type TextureNode,
	type WebGPURenderer,
} from 'three/webgpu'
import {
	add,
	float,
	Fn,
	int,
	mul,
	pass,
	renderOutput,
	textureSize,
	uniform,
	uv,
	vec2,
	vec3,
	vec4,
} from 'three/tsl'
import { SceneBloom } from './bloom'
import { Dither } from './dither'
import { SSF } from './ssf'
import { LIGHTNING_LAYER } from '../lightning/lightning'
import { RAIN_LAYER } from '../rain/rain'

/** 雨夜 SSF 默认参数（按模组高度标定）。 */
export const RAINY_SSF_FOG_DEFAULTS = {
	enabled: true,
	/** 与天穹地平同一套冷青灰。 */
	fogColor: '#172a3c',
	/** 远景几乎化进雾，藏住 48 单位小岛的硬边。 */
	fogMaxOpacity: 0.82,
	fogDensity: 0.14,
	/** 雾层顶面世界 Y。 */
	fogHeight: 10,
	fogHeightFalloff: 0.16,
	/** 巷内约 10 米内不起雾。 */
	fogStartDistance: 10,
	noiseStrength: 1.6,
	noiseScale: 0.035,
	noiseSpeedX: 0.18,
	noiseSpeedZ: 0.06,
	inscatteringColor: '#1c3648',
	inscatteringIntensity: 0.26,
	inscatteringExponent: 4,
	inscatteringStart: 18,
	azimuthDeg: 20,
	elevationDeg: 55,
} as const

/** 泛光默认强度：压到 0.05，避免暖灯晕把邻墙染黄。 */
export const RAINY_BLOOM_STRENGTH = 0.05

export interface PostPipelineOptions {
	renderer: WebGPURenderer
	scene: Scene
	camera: Camera
}

export interface PostPipelineHandle {
	fog: SSF
	bloom: SceneBloom
	scenePass: ReturnType< typeof pass >
	rainPass: ReturnType< typeof pass >
	lightningPass: ReturnType< typeof pass >
	pipeline: RenderPipeline
	dither: Dither
	/** 闪电片闪量（0~1），乘在雾色上。 */
	setLightningFill: ( amount: number ) => void
	render: () => void
	resize: ( width?: number, height?: number ) => void
	dispose: () => void
}

/** 方位角/仰角 → 入射光方向（Y 负为光从上方来）。 */
function lightDirectionFromAzEl( azimuthDeg: number, elevationDeg: number ): Vector3 {
	const az = ( azimuthDeg * Math.PI ) / 180
	const el = ( elevationDeg * Math.PI ) / 180
	const horizontal = Math.cos( el )
	return new Vector3(
		Math.sin( az ) * horizontal,
		-Math.sin( el ),
		Math.cos( az ) * horizontal,
	)
}

/**
 * 闪电 pass 锐芯 + 无 Karis 色差软晕：中圈电青、外圈品红。
 */
function composeLightningGlow( bolt: TextureNode ) {
	return Fn( () => {
		const texel = vec2( 1, 1 ).div( textureSize( bolt, int( 0 ) ) as never )
		const uv0 = uv()
		const tap = ( dx: number, dy: number, px: number ) => {
			const sampled = bolt.sample( uv0.add( texel.mul( vec2( dx, dy ) ).mul( px ) ) ) as Node< 'vec4' >
			return sampled.rgb
		}

		const sharp = tap( 0, 0, 0 )
		const mid = tap( 0, 0, 3 )
			.add( tap( 1, 0, 3 ) )
			.add( tap( -1, 0, 3 ) )
			.add( tap( 0, 1, 3 ) )
			.add( tap( 0, -1, 3 ) )
			.add( tap( 1, 1, 2 ) )
			.add( tap( -1, 1, 2 ) )
			.add( tap( 1, -1, 2 ) )
			.add( tap( -1, -1, 2 ) )
			.mul( 1 / 9 )
		const wide = tap( 1, 0, 8 )
			.add( tap( -1, 0, 8 ) )
			.add( tap( 0, 1, 8 ) )
			.add( tap( 0, -1, 8 ) )
			.add( tap( 1, 1, 6 ) )
			.add( tap( -1, -1, 6 ) )
			.mul( 1 / 6 )
		const cyan = mid.mul( vec3( 0.55, 0.9, 1.45 ) )
		const purple = wide.mul( vec3( 1.15, 0.42, 1.4 ) )
		return vec4( sharp.mul( 1.15 ).add( cyan.mul( 0.9 ) ).add( purple.mul( 0.7 ) ), 1 )
	} )()
}

/** Additive pass 清成黑底再画，叠回时黑底 +0。 */
function bindAdditiveBlackClear( passNode: ReturnType< typeof pass > ): void {
	const inner = passNode.updateBefore.bind( passNode )
	passNode.updateBefore = ( frame ): boolean | undefined => {
		const r = frame.renderer
		if ( !r ) {
			return inner( frame ) as boolean | undefined
		}
		const prevColor = new Color()
		r.getClearColor( prevColor )
		const prevAlpha = r.getClearAlpha()
		r.setClearColor( 0x000000, 0 )
		const result = inner( frame )
		r.setClearColor( prevColor, prevAlpha )
		return result as boolean | undefined
	}
}

/**
 * 搭建雨夜后处理管线。
 */
export function createPostPipeline( options: PostPipelineOptions ): PostPipelineHandle {
	const { renderer, scene, camera } = options
	const d = RAINY_SSF_FOG_DEFAULTS

	// 关场景雾；成色只走 SSF
	scene.fog = null

	const scenePass = pass( scene, camera, { samples: 0 } )
	scenePass.transparent = true
	scenePass.opaque = true
	// 场景 pass 去掉雨层与闪电层（Additive 黑底问题），另开 pass 共用深度
	const sceneLayers = new Layers()
	sceneLayers.enableAll()
	sceneLayers.disable( RAIN_LAYER )
	sceneLayers.disable( LIGHTNING_LAYER )
	scenePass.setLayers( sceneLayers )

	const rainLayers = new Layers()
	rainLayers.disableAll()
	rainLayers.enable( RAIN_LAYER )
	const rainPass = pass( scene, camera, {
		samples: 0,
		depthTexture: scenePass.getTexture( 'depth' ) as DepthTexture,
	} )
	rainPass.opaque = false
	rainPass.transparent = true
	rainPass.autoClearDepth = false
	rainPass.autoClearColor = true
	rainPass.setLayers( rainLayers )
	bindAdditiveBlackClear( rainPass )

	const lightningLayers = new Layers()
	lightningLayers.disableAll()
	lightningLayers.enable( LIGHTNING_LAYER )
	const lightningPass = pass( scene, camera, {
		samples: 0,
		depthTexture: scenePass.getTexture( 'depth' ) as DepthTexture,
	} )
	lightningPass.opaque = false
	lightningPass.transparent = true
	lightningPass.autoClearDepth = false
	lightningPass.autoClearColor = true
	lightningPass.setLayers( lightningLayers )
	bindAdditiveBlackClear( lightningPass )

	const rainColor = rainPass.getTextureNode( 'output' )
	const color = scenePass.getTextureNode( 'output' )
	const depth = scenePass.getTextureNode( 'depth' )

	// beauty = 场景色 + 雨层
	const beauty = color.add( rainColor )

	// 泛光首级要纹素邻域采样（Karis），从场景色抽高光；
	// 成片串序仍是 beauty.add(bloom) → 雾
	const bloom = new SceneBloom( color )
	bloom.bloom.value = RAINY_BLOOM_STRENGTH

	// 雾吃「场景色+雨+泛光」
	const fog = new SSF( {
		color: beauty.add( bloom as never ),
		depth,
		camera,
		enabled: d.enabled,
		fogColor: d.fogColor,
		fogMaxOpacity: d.fogMaxOpacity,
		fogDensity: d.fogDensity,
		fogHeight: d.fogHeight,
		fogHeightFalloff: d.fogHeightFalloff,
		fogStartDistance: d.fogStartDistance,
		noiseStrength: d.noiseStrength,
		noiseScale: d.noiseScale,
		noiseSpeed: new Vector2( d.noiseSpeedX, d.noiseSpeedZ ),
		inscatteringLightDirection: lightDirectionFromAzEl( d.azimuthDeg, d.elevationDeg ),
		directionalInscatteringColor: new Color( d.inscatteringColor ).multiplyScalar( d.inscatteringIntensity ),
		directionalInscatteringExponent: d.inscatteringExponent,
		directionalInscatteringStartDistance: d.inscatteringStart,
	} )

	const uLightningFill = uniform( 0 )
	const lightningColor = lightningPass.getTextureNode( 'output' )
	const lightningGlow = composeLightningGlow( lightningColor )
	const pipeline = new RenderPipeline( renderer )
	// 关管线自带输出变换，改由 renderOutput 显式 ACES+sRGB 再接抖动；
	// 渲染器保持 NoToneMapping，倒影烤图才不会被压两遍
	pipeline.outputColorTransform = false
	// 闪电折线加在雾后，不被远景深度洗淡
	const graded = add(
		mul( fog as never, float( 1 ).add( uLightningFill.mul( 0.5 ) ) ),
		lightningGlow as never,
	)
	const mapped = renderOutput( graded, ACESFilmicToneMapping, SRGBColorSpace )
	const dither = new Dither( { input: mapped } )
	pipeline.outputNode = dither

	const resize = ( width?: number, height?: number ) => {
		const w = Math.max( 1, width ?? renderer.domElement.width )
		const h = Math.max( 1, height ?? renderer.domElement.height )
		scenePass.setSize( w, h )
		rainPass.setSize( w, h )
		lightningPass.setSize( w, h )
	}

	return {
		fog,
		bloom,
		scenePass,
		rainPass,
		lightningPass,
		dither,
		pipeline,
		setLightningFill: ( amount: number ) => {
			uLightningFill.value = Math.max( 0, Math.min( 1, amount ) )
		},
		render: () => {
			pipeline.render()
		},
		resize,
		dispose: () => {
			fog.dispose()
			bloom.dispose()
			lightningPass.dispose()
			rainPass.dispose()
			scenePass.dispose()
			pipeline.dispose()
		},
	}
}
