import { forwardRef } from "react";
import type { AchievementPosterModel, PosterTheme } from "./models";
import { Abs, FitName, HeroNumber, PosterFrame, PosterIcon, Signature, Unit } from "./PosterParts";

interface Props {
  model: AchievementPosterModel;
  theme: PosterTheme;
}

/** 成就海报, layout A3 「里程碑」: one software's highest focus milestone (spec v0.4.3 B). */
export const AchievementPoster = forwardRef<HTMLDivElement, Props>(function AchievementPoster({ model, theme }, ref) {
  return (
    <PosterFrame ref={ref} theme={theme} label={`成就海报 ${model.name} 专注里程碑 ${model.tier} 小时`}>
      <div className="poster-glass poster-card" />

      <Abs x={92} bl={159} size={17} className="poster-cjk poster-w4 poster-label">
        成就
      </Abs>
      <Abs right={448} bl={159} size={17} className="poster-cjk poster-w4 poster-label">
        {model.dateText}
      </Abs>

      <PosterIcon src={model.icon} name={model.name} left={92} top={198} size={44} />
      <Abs x={150} cy={220}>
        <FitName maxWidth={295} lines={2} size={19} className="poster-w5 poster-ink" style={{ letterSpacing: "-0.01em" }}>
          {model.name}
        </FitName>
      </Abs>

      {/* Figure tops fixed at 339 on every tier, so 2-, 3- and 4-digit heroes line up. */}
      <Abs x={93} bl={307} size={15} className="poster-cjk poster-w4 poster-label">
        专注里程碑
      </Abs>
      <Abs x={86} capTop={339} fit={362} size={150}>
        <HeroNumber value={model.tier} />
        <Unit thin>小时</Unit>
      </Abs>

      <div className="poster-rule" />

      <Abs x={93} bl={526} size={15} className="poster-cjk poster-w4 poster-label">
        使用
      </Abs>
      <Abs right={448} bl={526} size={24}>
        <span className="poster-num poster-w5">{model.days}</span>
        <Unit>天</Unit>
      </Abs>
      <Abs x={93} bl={567} size={15} className="poster-cjk poster-w4 poster-label">
        累计专注
      </Abs>
      <Abs right={448} bl={567} size={24}>
        <span className="poster-num poster-w5">{model.focus}</span>
        <Unit>小时</Unit>
      </Abs>

      <Signature />
    </PosterFrame>
  );
});
