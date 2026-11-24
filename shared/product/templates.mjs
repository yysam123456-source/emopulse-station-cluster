// 模板注册表（产品化第一层）。
//
// 这层只做三件事：给模板一个稳定 id、绑定一个 `build.mjs` preset、声明可调参数。
// 它不碰零件实现、不碰构建细节、不碰页面壳；这样 Studio、构建门、未来站点可以共用一份真源。
//
// `preset` 必须在 `shared/stage/preview/build.mjs` 的 PRESETS 里存在；`build-templates.mjs`
// 会用 buildPreview 真实解析一次，解析不到就报错，不会让模板悄悄指向一个不存在的 composition。
export const TEMPLATES = [
  {
    id: 'deepsea',
    name: '深海信标',
    summary: 'L0 海沟光柱 + L2 气泡 + L3 沉水 + L4 后处理；无 GL，适合做低配兜底模板。',
    preset: 'a2-deepsea',
    biome: 'tide',
    status: 'ready',
    parts: ['abyss', 'bubbles', 'still-sink', 'pixel-post'],
    params: [
      { key: 'palette', label: '色板', type: 'enum', default: 'abyss', values: ['abyss', 'tide', 'ink'] },
      { key: 'density', label: '微粒密度', type: 'number', default: 1, min: 0.4, max: 1.6, step: 0.05 },
      { key: 'rays', label: '光柱', type: 'number', default: 0.55, min: 0, max: 1, step: 0.05 },
      { key: 'caustics', label: '焦散', type: 'number', default: 0.35, min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'nebula',
    name: '星海旋臂',
    summary: 'L0 深海 + L1 四旋臂星系 + L4 后处理；单 GL，展示“零件叠加”而不是单页特效。',
    preset: 'a2-nebula',
    biome: 'tide',
    status: 'ready',
    parts: ['abyss', 'nebula', 'pixel-post'],
    params: [
      { key: 'palette', label: '色板', type: 'enum', default: 'abyss', values: ['violet', 'abyss', 'ember', 'aurora'] },
      { key: 'density', label: '粒子密度', type: 'number', default: 1, min: 0.45, max: 1.35, step: 0.05 },
      { key: 'scale', label: '星系半径', type: 'number', default: 1, min: 0.6, max: 1.6, step: 0.05 },
      { key: 'speed', label: '自转速度', type: 'number', default: 0.85, min: 0.2, max: 2, step: 0.05 },
      { key: 'pulse', label: '指针脉冲', type: 'number', default: 0.55, min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'temple',
    name: '晨光山门与主殿',
    summary: '写实模块装配：天空/苔庭/碎石路/主殿/鸟居/石灯/松林由同一套 MaterialLab + SceneModule 组合；换 scene 即可从晨光切到雪霁/暮色。',
    preset: 'a2-temple',
    biome: 'room',
    status: 'ready',
    parts: ['temple'],
    params: [
      { key: 'scene', label: '方案', type: 'enum', default: 'dawn', values: ['dawn', 'snow', 'dusk', 'gate'] },
      { key: 'fog', label: '雾', type: 'number', default: 1, min: 0, max: 1.4, step: 0.05 },
      { key: 'lanterns', label: '石灯', type: 'number', default: 0.82, min: 0, max: 1, step: 0.05 },
      { key: 'orbit', label: '镜头环绕', type: 'number', default: 0.7, min: 0, max: 1, step: 0.05 },
      { key: 'torii', label: '鸟居', type: 'boolean', default: true },
      { key: 'pines', label: '松林', type: 'boolean', default: true },
      { key: 'hall', label: '主殿', type: 'boolean', default: true },
    ],
  },
  {
    id: 'gate',
    name: '独立山门',
    summary: '不是新模型：同一个 temple 零件，关掉主殿、换一套山门计划，直接重装出另一处场景。',
    preset: 'a2-gate',
    biome: 'room',
    status: 'ready',
    parts: ['temple'],
    params: [
      { key: 'scene', label: '方案', type: 'enum', default: 'gate', values: ['gate', 'dawn'] },
      { key: 'fog', label: '雾', type: 'number', default: 1, min: 0, max: 1.4, step: 0.05 },
      { key: 'lanterns', label: '石灯', type: 'number', default: 0.9, min: 0, max: 1, step: 0.05 },
      { key: 'hall', label: '主殿', type: 'boolean', default: false },
    ],
  },
  {
    id: 'koi',
    name: '锦鲤池',
    summary: '鱼群 / 浮萍生态 / 镜头轨道已拆成独立模块；水面、水彩、水墨仍沿用上游 pass，可切 ink/paint/real 三风格。',
    preset: 'koi',
    biome: 'ink',
    status: 'ready',
    parts: ['paper-ink', 'koi-pond'],
    params: [
      { key: 'style', label: '风格', type: 'enum', default: 'ink', values: ['ink', 'paint', 'real'] },
      { key: 'cam', label: '镜头', type: 'enum', default: 'top', values: ['top', 'angle', 'orbit'] },
      { key: 'floor', label: '池底', type: 'enum', default: 'pebble', values: ['pebble', 'sky', 'dark'] },
      { key: 'rain', label: '雨', type: 'enum', default: 'dry', values: ['dry', 'drizzle', 'rain'] },
      { key: 'seed', label: '种子', type: 'number', default: 20260312, min: 0, max: 999999, step: 1 },
    ],
  },
];

/** 按 id 取模板；找不到返回 undefined。 */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}
