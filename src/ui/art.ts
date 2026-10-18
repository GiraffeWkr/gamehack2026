export function artUrl(name: string): string {
  return `${import.meta.env.BASE_URL}art/${name}.webp`;
}

export const ART_CREDITS =
  '场景、阵营与首领肖像由 gpt-image-2.5 通过统一 curl 管线生成；战斗中的角色、异形与特效为程序化像素绘制。';
