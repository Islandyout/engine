// Paints the UI component kinds on the HUD canvas (0.77.0, out of main.ts):
// Text (wrapped, outlined), Button and Panel, Image, Bar and Slider, Toggle.
import type { UIComponent, Vec3 } from "../scene/Components";
import type { UIRect } from "./uiLayout";

const css = (c: Vec3, alpha: number) => `rgba(${Math.round(c.x * 255)}, ${Math.round(c.y * 255)}, ${Math.round(c.z * 255)}, ${alpha})`;

export class UIPainter {
  private readonly images = new Map<string, HTMLImageElement>();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    // An Image element's URL as the browser can load it (imported assets).
    private readonly resolve: (url: string) => string | undefined,
  ) {}

  private image(url: string) {
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      image.src = url;
      this.images.set(url, image);
    }
    return image;
  }
  // Paints one UI element in its box. Text and Button look exactly as they
  // did before layout options existed when those options are left default.
  // A Text element's lines: "\n" breaks, then word wrap within `width` (0: none).
  // A Text element's lines: "\n" breaks, then word wrap within `width` (0: none).
  lines(text: string, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (!(width > 0) || this.ctx.measureText(paragraph).width <= width) {
        out.push(paragraph);
        continue;
      }
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.ctx.measureText(next).width > width) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  draw(ui: UIComponent, rect: UIRect, value: number) {
    const { left, top, width, height } = rect;
    const label = (x: number, y: number, align: CanvasTextAlign) => {
      this.ctx.textAlign = align;
      this.ctx.textBaseline = "middle";
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = "rgba(10, 16, 24, 0.85)";
      this.ctx.strokeText(ui.text, x, y);
      this.ctx.fillStyle = "#eaf6ff";
      this.ctx.fillText(ui.text, x, y);
    };
    switch (ui.kind) {
      case "Text": {
        // A stroke outline instead of a backdrop -- legible over any scene.
        // Lines break at "\n" and wrap to the authored width (0.73.0); the
        // authored colour is used unless it's the dark default.
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = "rgba(10, 16, 24, 0.85)";
        const dark = ui.color.x === 0.118 && ui.color.y === 0.165 && ui.color.z === 0.22;
        this.ctx.fillStyle = dark ? "#eaf6ff" : css(ui.color, Math.max(ui.opacity, 0.35));
        const lineHeight = Math.round(ui.fontSize * 1.3);
        this.lines(ui.text, ui.width).forEach((line, i) => {
          this.ctx.strokeText(line, left, top + i * lineHeight);
          this.ctx.fillText(line, left, top + i * lineHeight);
        });
        return;
      }
      case "Button":
      case "Panel":
        this.ctx.fillStyle = css(ui.color, ui.opacity);
        this.ctx.fillRect(left, top, width, height);
        this.ctx.strokeStyle = "rgba(140, 190, 220, 0.6)";
        this.ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        if (ui.text) {
          // A Button's label is centered; a Panel's is its title.
          this.ctx.fillStyle = "#eaf6ff";
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "middle";
          this.ctx.fillText(ui.text, left + width / 2, ui.kind === "Button" ? top + height / 2 : top + 8 + ui.fontSize / 2);
        }
        return;
      case "Image": {
        const imageUrl = this.resolve(ui.image);
        const image = imageUrl ? this.image(imageUrl) : undefined;
        this.ctx.globalAlpha = ui.opacity;
        if (image?.complete && image.naturalWidth > 0) this.ctx.drawImage(image, left, top, width, height);
        else {
          this.ctx.fillStyle = css(ui.color, 1);
          this.ctx.fillRect(left, top, width, height);
        }
        this.ctx.globalAlpha = 1;
        if (ui.text) label(left + width / 2, top + height / 2, "center");
        return;
      }
      case "Bar":
      case "Slider": {
        this.ctx.fillStyle = "rgba(10, 16, 24, 0.75)";
        this.ctx.fillRect(left, top, width, height);
        this.ctx.fillStyle = css(ui.kind === "Bar" && ui.color.x === 0.118 ? { x: 0.3, y: 0.69, z: 0.31 } : ui.color, 1);
        this.ctx.fillRect(left, top, width * value, height);
        if (ui.kind === "Slider") {
          this.ctx.fillStyle = "#eaf6ff";
          this.ctx.fillRect(left + width * value - 3, top - 2, 6, height + 4);
        }
        if (ui.text) label(left + width / 2, top + height / 2, "center");
        return;
      }
      case "Toggle": {
        const box = Math.min(height, ui.fontSize + 8);
        this.ctx.fillStyle = css(ui.color, ui.opacity);
        this.ctx.fillRect(left, top, box, box);
        this.ctx.strokeStyle = "rgba(140, 190, 220, 0.8)";
        this.ctx.strokeRect(left + 0.5, top + 0.5, box - 1, box - 1);
        if (value >= 0.5) {
          this.ctx.fillStyle = "#7fd4ff";
          this.ctx.fillRect(left + 4, top + 4, box - 8, box - 8);
        }
        if (ui.text) label(left + box + 8, top + box / 2, "left");
        return;
      }
    }
  }
}
