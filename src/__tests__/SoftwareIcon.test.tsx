import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SoftwareIcon } from "../components/SoftwareIcon";

describe("SoftwareIcon", () => {
  it("shows the initial until the icon has loaded", () => {
    const { container } = render(
      <SoftwareIcon app={{ display_name: "code", icon_url: "http://gsticon.localhost/a.png" }} />,
    );
    const image = container.querySelector("img")!;
    expect(image).not.toBeVisible();
    expect(screen.getByText("C")).toBeInTheDocument();

    fireEvent.load(image);

    expect(image).toBeVisible();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("keeps the initial when the software has no icon", () => {
    const { container } = render(
      <SoftwareIcon app={{ display_name: "plain", icon_url: "http://gsticon.localhost/b.png" }} />,
    );
    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).not.toBeVisible();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("does not flash the initial for an icon it has already shown", () => {
    const app = { display_name: "steam", icon_url: "http://gsticon.localhost/c.png" };
    const first = render(<SoftwareIcon app={app} />);
    fireEvent.load(first.container.querySelector("img")!);
    first.unmount();

    const { container } = render(<SoftwareIcon app={app} />);
    expect(container.querySelector("img")).toBeVisible();
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });

  it("shows only the initial without an icon URL", () => {
    const { container } = render(<SoftwareIcon app={{ display_name: "微信", icon_url: null }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("微")).toBeInTheDocument();
  });
});
