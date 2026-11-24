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
  /**
   * False leaves the control as it is, inside the same wrapper, so a control that becomes unavailable
   * later (成就's 导出成就) is not remounted, and does not lose focus, when that changes.
   */
  active?: boolean;
}

export function UnavailableTooltip({ children, message = unavailableTooltipMessage, active = true }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const unavailableChild = !active ? children : cloneElement(children, {
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
      {active && isVisible ? (
        <span className="unavailable-tooltip-bubble" id={tooltipId} role="tooltip">
          {message}
        </span>
      ) : null}
    </span>
  );
}
