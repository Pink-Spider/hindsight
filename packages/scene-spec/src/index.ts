// 계약 ② — Scene Spec v1. 스키마의 단일 소스 (ADR-002).
import { z } from "zod";

export const SPEC_VERSION = 1;

export const seriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  values: z.array(z.number()).min(2),
});

export const sceneSpecSchema = z
  .object({
    specVersion: z.literal(1),
    // v1은 line-race 1종. P3에서 union으로 확장
    template: z.literal("line-race"),
    targetFps: z.number().int().min(24).max(60),
    maxPoints: z.number().int().min(50).max(5000),
    timeline: z.object({
      hookSec: z.number().nonnegative(),
      raceSec: z.number().positive(),
      endSec: z.number().nonnegative(),
      warp: z.number().min(0).max(1),
    }),
    meta: z.object({
      title: z.string().min(1),
      // Inauthentic Content 대응 "맥락 한 줄"을 계약 수준에서 강제
      contextLine: z.string().min(1),
      returnType: z.enum(["price", "total"]),
      seedKrw: z.number().positive().optional(),
      dataSource: z.string().min(1),
    }),
    // BGM (선택) — track은 assets/bgm/ 안의 파일명. optional 추가라 specVersion 유지 (ADR-002 결정 3)
    bgm: z
      .object({
        track: z.string().min(1),
        gainDb: z.number().min(-30).max(6).optional(),
      })
      .optional(),
    axis: z.object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(2),
    }),
    series: z.array(seriesSchema).min(1).max(15),
  })
  .superRefine((spec, ctx) => {
    const n = spec.axis.time.length;
    if (n > spec.maxPoints) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `axis.time 길이(${n})가 maxPoints(${spec.maxPoints})를 초과 — 다운샘플링은 Spec 생성 단계 책임`,
      });
    }
    for (const s of spec.series) {
      if (s.values.length !== n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `series "${s.id}" values 길이(${s.values.length}) ≠ axis.time 길이(${n}) — 모든 시리즈는 공유 time 배열과 정렬돼야 함`,
        });
      }
    }
  });

export type SceneSpec = z.infer<typeof sceneSpecSchema>;
export type SeriesSpec = z.infer<typeof seriesSchema>;

export function validateSceneSpec(input: unknown): SceneSpec {
  return sceneSpecSchema.parse(input);
}
