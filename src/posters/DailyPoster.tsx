import { forwardRef, Fragment } from "react";
import type { DailyPosterModel, PosterTheme } from "./models";
import { Abs, FitName, HeroNumber, PosterFrame, PosterIcon, Signature, Unit } from "./PosterParts";

/** Column centres in the tray for 1, 2 or 3 software (140 px apart, centred on the poster). */
export function trayColumnCentres(count: number): number[] {
  const first = 270 - ((count - 1) * 140) / 2;
  return Array.from({ length: count }, (_, index) => first + index * 140);
}

interface Props {
  model: DailyPosterModel;
  theme: PosterTheme;
}

/** 日报海报, layout D2 「屏幕时间」 (spec v0.4.3 A). */
export const DailyPoster = forwardRef<HTMLDivElement, Props>(function DailyPoster({ model, theme }, ref) {
  const centres = trayColumnCentres(model.columns.length);

  return (
    <PosterFrame ref={ref} theme={theme} label={`日报海报 ${model.dateText} ${model.label} ${model.hero} 小时`}>
      {/* The mock centred this line at y 66; its rendered baseline (73) is the steadier anchor. */}
      <Abs x={60} bl={73} size={17} className="poster-cjk poster-w4 poster-label">
        {model.dateText}
      </Abs>

      <Abs x={62} bl={206} size={17} className="poster-cjk poster-w4 poster-label">
        {model.label}
      </Abs>
      <Abs x={52} bl={382} fit={428} size={200}>
        <HeroNumber value={model.hero} />
        <Unit thin>小时</Unit>
      </Abs>

      <div className="poster-bar">
        <i style={{ width: `${model.share * 100}%` }} />
      </div>
      <Abs right={480} bl={459} size={24}>
        <span className="poster-cjk poster-w4 poster-label" style={{ fontSize: 14, marginRight: 7 }}>
          记录
        </span>
        <span className="poster-num poster-w5 poster-ink2">{model.recorded}</span>
        <Unit>小时</Unit>
      </Abs>

      {model.columns.length > 0 && <div className="poster-glass poster-tray" />}
      {model.columns.map((column, index) => {
        const cx = centres[index];
        return (
          <Fragment key={column.key}>
            <PosterIcon src={column.icon} name={column.name} left={cx - 20} top={506} size={40} />
            <Abs cx={cx} cy={565}>
              <FitName maxWidth={125} size={12} className="poster-w5 poster-ink2">
                {column.name}
              </FitName>
            </Abs>
            <Abs cx={cx} bl={603} size={24}>
              <span className="poster-num poster-w6">{column.hours}</span>
              <Unit>小时</Unit>
            </Abs>
          </Fragment>
        );
      })}

      <Signature />
    </PosterFrame>
  );
});
