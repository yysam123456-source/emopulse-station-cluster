import type * as THREE from 'three';

/** 一个可独立装配、关闭、调序的星系零件。 */
export interface NebulaModule {
  readonly id: string;
  readonly label: string;
  readonly group: THREE.Group;
  /** 本模块自己的材质，dispose 时逐个释放。 */
  readonly materials: THREE.Material[];
  /** 每帧更新；只拿到归一化时间和脉冲，不读全局状态。 */
  update?(time: number, pulse: number): void;
  dispose?(): void;
}
