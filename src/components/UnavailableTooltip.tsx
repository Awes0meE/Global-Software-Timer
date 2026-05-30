import {
  cloneElement,
  useId,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";

export const unavailableTooltipMessage = "该功能暂未完成";

interface UnavailableControlProps {
  "aria-describedby"?: string;
  "aria-disabled"?: boolean | "true" | "false";
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

interface Props {
  children: ReactElement<UnavailableControlProps>;
  message?: string;
}

export function UnavailableTooltip({ children, message = unavailableTooltipMessage }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const unavailableChild = cloneElement(children, {
    "aria-describedby": isVisible ? tooltipId : undefined,
    "aria-disabled": true,
    disabled: false,
    onClick: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      children.props.onKeyDown?.(event);
    },
  });

  return (
    <span
      className="unavailable-tooltip"
      data-tooltip={message}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {unavailableChild}
      {isVisible ? (
        <span className="unavailable-tooltip-bubble" id={tooltipId} role="tooltip">
          {message}
        </span>
      ) : null}
    </span>
  );
}
