// 零件「取函数」适配器表（golden-run 与 mutation-probe 共用，T-R02 第 3 批）。
//
// 为什么必须共用一张表（不是代码洁癖，是防伪）：
//   黄金值验的是「函数 A 的输出 == 手算值」，死参数探针验的是「函数 B 的参数敏感」。
//   如果两处各自加载一份实现，就可能出现 **黄金值验 A、探针探 B** —— 两个门都绿，
//   但「我们声称移植的那个函数」其实一次都没被验过。共用适配器 = 两条门锁定同一个模块实例来源。
//
// 为什么适配器不写进 golden JSON：
//   JSON 是**期望值清单**，不该承载加载逻辑；加载方式随 T-R03 落地而变化，期望值不能跟着变。
//   适配器表放在代码里，改适配器时 cases/expect 一字不动 —— 这正是「期望值独立于实现」的载体。
//
// 适配器演进路径（T-R03 落地后）：
//   'koi-original-profile' 从「AST 抽原件纯函数」改为 `loadTsModule(coreEntry('koi'))`，
//   届时 golden/koi.json 的 cases/expect/derivation 全部不变 —— 若变了，说明移植改了口径。
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import { loadTsModule, loadTsSource, REPO_ROOT } from './load-ts.mjs';

/** 零件库根目录。 */
export const LIB = path.join(REPO_ROOT, 'shared', 'parts-library');

/**
 * 取一个顶层语句声明的名字（函数声明 / 变量声明）。
 * @param {ts.Statement} statement 顶层语句
 * @returns {string[]} 该语句声明的名字
 */
function declaredNames(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.name) return [statement.name.text];
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : null))
      .filter((name) => typeof name === 'string');
  }
  return [];
}

/**
 * 从原件里按名字抽出顶层声明源码（去掉 `export` 前缀，便于拼装后再统一导出）。
 *
 * 为什么按 AST 抽而不是正则：原件里有同名出现在字符串/注释里的情况（如 `'halfWidth'` 出现在
 * 着色器模板串中），正则会抽错；AST 只认真正的声明语句。
 *
 * @param {string} filePath 源文件绝对路径
 * @param {readonly string[]} names 需要抽取的声明名
 * @returns {{source: string, found: string[], missing: string[]}} 抽取结果
 */
export function extractDeclarations(filePath, names) {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const chunks = [];
  const found = [];
  for (const statement of sf.statements) {
    const declared = declaredNames(statement);
    const hit = declared.find((name) => names.includes(name));
    if (!hit) continue;
    const text = source.slice(statement.getStart(sf), statement.getEnd()).replace(/^export\s+/, '');
    chunks.push(text);
    found.push(hit);
  }
  return {
    source: chunks.join('\n'),
    found,
    missing: names.filter((name) => !found.includes(name)),
  };
}

/**
 * 零件算法核的规范入口（AD-1：`core/` 与 `render/` 强制分离）。
 * @param {string} partId 零件 id
 * @returns {string} `shared/parts-library/<id>/core/index.ts` 的绝对路径
 */
export function coreEntry(partId) {
  return path.join(LIB, partId, 'core', 'index.ts');
}

/**
 * 从 `portedTo` 里解析出落点文件（形如 `shared/parts-library/dandelion/core/meadow.ts: buildSeedField()`）。
 *
 * 为什么优先用 portedTo 而不是硬编码 `core/index.ts`：portedTo 是 manifest 对 QA 的承诺
 * （「这个符号落在哪个文件」）。探针去那个文件里找符号，等于顺带验了这条承诺；
 * 若符号不在它声称的文件里，探针报红 —— 这是免费的溯源一致性检查。
 *
 * @param {string} partId 零件 id
 * @param {string|undefined} portedTo manifest 里的落点描述
 * @returns {{absPath: string, fromPortedTo: boolean}} 待加载的文件
 */
export function resolveSymbolModule(partId, portedTo) {
  if (typeof portedTo === 'string' && portedTo.trim() !== '') {
    // 只认「路径: 落点」或纯路径两种写法；`: ` 之后是函数名/表达式，不是路径的一部分
    const rawPath = portedTo.split(':')[0].trim();
    if (rawPath.endsWith('.ts') || rawPath.endsWith('.js') || rawPath.endsWith('.mjs')) {
      const absPath = path.isAbsolute(rawPath) ? rawPath : path.join(REPO_ROOT, rawPath);
      if (existsSync(absPath)) return { absPath, fromPortedTo: true };
    }
  }
  return { absPath: coreEntry(partId), fromPortedTo: false };
}

/** 适配器表：名字 → 如何拿到可调用命名空间。 */
export const ADAPTERS = {
  /**
   * D4：原件 lib/kit.js 是纯 ESM 无依赖，直接加载。
   * @returns {Promise<Record<string, Function>>} 导出命名空间
   */
  'ascii-kit-kit': async () => loadTsModule(path.join(LIB, 'ascii-kit', 'lib', 'kit.js')),

  /**
   * K1 体形剖面：从原件 koi.js **按 AST 抽出**纯函数声明后执行。
   *
   * 为什么不能直接 `loadTsModule('koi/koi.js')`：该文件 `import * as THREE from 'three'`、
   * 还 import 了 `./glsl.js`，在 Node 里加载会连带整棵 three 依赖树（且顶层就碰 GPU 相关代码）。
   * 抽取最小闭包是本文件唯一「绕过依赖」的手段，且抽取清单是**白名单**：少抽一个就 missing 报错。
   *
   * @returns {Promise<Record<string, Function>>} 导出命名空间
   */
  'koi-original-profile': async () => {
    const needed = ['S_END', 'sm', 'clamp', 'close', 'halfWidth', 'topH', 'botH', 'wobble'];
    const { source, found, missing } = extractDeclarations(path.join(LIB, 'koi', 'koi.js'), needed);
    if (missing.length > 0) {
      throw new Error(`koi.js 里抽不到这些声明：${missing.join(', ')}（原件被改动？抽取清单需重新核对）`);
    }
    const combined = `${source}\nexport { ${found.join(', ')} };\n`;
    return loadTsSource(combined);
  },

  /**
   * D3 蒲公英：直接加载 `dandelion/core/meadow.ts`（纯函数、零依赖、Node 可 import）。
   *
   * golden-run 只认「可调用函数」（`typeof fn === 'function'`），而 golden 清单里有一批
   * **常量**与**写 into 参数的函数**要验。因此这里补一组最薄的读取器：
   *   - `constant(name)`：按名字读顶层导出，名字不存在就抛 —— 常量被改名/删除立即红；
   *   - `drift(...)` / `basisRight(...)`：把「写进 out 对象」的 API 转成返回数组，便于 JSON 比较；
   *   - `plantLayoutSeedSum()`：**独立**逐株求和，作为 1335 的第二见证（绝不是回读 SEED_COUNT）；
   *   - 几何快照（segments/endpoints/shade/point）在适配器加载时取一次。
   * 期望值一律写在 tests/golden/dandelion.json，本文件不产生任何期望值。
   *
   * @returns {Promise<Record<string, Function|unknown>>} 导出命名空间 + 读取器
   */
  'dandelion-core': async () => {
    const core = await loadTsModule(path.join(LIB, 'dandelion', 'core', 'meadow.ts'));
    const geometry = core.createSeedGeometry();
    const vec = (o) => [o.x, o.y, o.z];
    const basisOf = (x, y, z) => {
      const out = { right: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 0 }, degenerate: false };
      core.seedBasisInto({ x, y, z }, out);
      return { out, degenerate: out.degenerate };
    };
    return {
      ...core,
      constant: (name) => {
        if (!Object.hasOwn(core, name)) throw new Error(`meadow.ts 未导出 ${name}（常量被改名或删除？）`);
        const value = core[name];
        if (typeof value === 'function') throw new Error(`${name} 是函数，不是常量`);
        return value;
      },
      plantLayoutSeedSum: () => core.PLANT_LAYOUT.reduce((sum, plant) => sum + plant.seeds, 0),
      plantLayoutSize: () => core.PLANT_LAYOUT.length,
      geometrySegments: () => geometry.segments,
      geometryEndpoints: () => geometry.endpoints,
      geometryShade: (index) => geometry.shades[index],
      geometryPoint: (index) => [geometry.points[index * 3], geometry.points[index * 3 + 1], geometry.points[index * 3 + 2]],
      drift: (aRandom, travel, wind, heightScale = 1) => {
        const out = { x: 0, y: 0, z: 0 };
        core.driftInto(aRandom, travel, wind, out, heightScale);
        return vec(out);
      },
      basisDegenerate: (x, y, z) => (basisOf(x, y, z).degenerate ? 1 : 0),
      basisRight: (x, y, z) => vec(basisOf(x, y, z).out.right),
      basisForward: (x, y, z) => vec(basisOf(x, y, z).out.forward),
      /** 固定随机源建场后取第 index 颗的径向轴（固定值让抖动归零，可手算） */
      seedAxisAt: (fixedRandom, index) => {
        const field = core.buildSeedField(() => fixedRandom);
        return [field.aAxis[index * 3], field.aAxis[index * 3 + 1], field.aAxis[index * 3 + 2]];
      },
      /** 第 index 颗的起点到所属花球中心的距离（= 花球半径 − 细柄长度 × 尺寸） */
      seedHomeRadius: (fixedRandom, index) => {
        const field = core.buildSeedField(() => fixedRandom);
        const plant = core.PLANT_LAYOUT[field.aPlant[index]];
        return Math.hypot(
          field.aHome[index * 3] - plant.x,
          field.aHome[index * 3 + 1] - plant.y,
          field.aHome[index * 3 + 2] - plant.z,
        );
      },
    };
  },

  /**
   * D3 吹气：直接加载 `blow-input/core/detector.ts`（纯函数 + 一个无副作用状态机类）。
   *
   * 补三个把「数组参数」转成 JSON 可表达形式的读取器：
   *   - `rmsFlat(value, count)`：长度为 count、全为 value 的波形 RMS；
   *   - `bandUniform(level, sampleRate)`：长度 1024、逐 bin 全为 level 的频谱，返回 [low, high]；
   *   - `constant(name)`：同 dandelion，按名字读顶层常量。
   *
   * @returns {Promise<Record<string, Function|unknown>>} 导出命名空间 + 读取器
   */
  'blow-input-core': async () => {
    const core = await loadTsModule(path.join(LIB, 'blow-input', 'core', 'detector.ts'));
    return {
      ...core,
      constant: (name) => {
        if (!Object.hasOwn(core, name)) throw new Error(`detector.ts 未导出 ${name}（常量被改名或删除？）`);
        const value = core[name];
        if (typeof value === 'function') throw new Error(`${name} 是函数，不是常量`);
        return value;
      },
      rmsFlat: (value, count) => core.rmsOfWave(new Uint8Array(count).fill(value)),
      bandUniform: (level, sampleRate) => {
        const spectrum = new Uint8Array(1024).fill(level);
        const bands = core.bandEnergy(spectrum, sampleRate);
        return [bands.low, bands.high];
      },
    };
  },
};

/**
 * 按名字取适配器并加载。
 * @param {string} adapterName 适配器名
 * @returns {Promise<Record<string, Function>>} 导出命名空间
 */
export async function loadAdapter(adapterName) {
  const adapter = ADAPTERS[adapterName];
  if (!adapter) {
    throw new Error(`适配器未注册：${adapterName || '(空)'}（已注册：${Object.keys(ADAPTERS).join(', ')}）`);
  }
  return adapter();
}
