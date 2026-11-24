"""
生成 CasaOS 移动端的 Android 启动图标。

源图标：UI/public/img/icon/android-chrome-512x512.png
  三个交叠的圆（深蓝 / 天蓝 / 青），底色为白色圆角方块。

产出：
  mipmap-<density>/ic_launcher.png            传统方形图标（保留原始白底圆角）
  mipmap-<density>/ic_launcher_round.png      圆形图标
  mipmap-<density>/ic_launcher_foreground.png 自适应图标前景（仅 logo，透明底，
                                                缩放到 108dp 画布的安全区内）
  values/ic_launcher_background.xml            自适应图标背景色（CasaOS 深蓝）
"""
import os
from PIL import Image, ImageDraw

SRC = r"H:\project_self\CasaOS\UI\public\img\icon\android-chrome-512x512.png"
RES = r"H:\project_self\CasaOS\mobile\android\app\src\main\res"

# 传统图标尺寸 与 自适应前景画布尺寸
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# 自适应图标：logo 最多占画布的 66/108，保证不被各种形状裁切
SAFE_RATIO = 0.60


def load_source():
    img = Image.open(SRC).convert("RGBA")
    return img


def extract_logo(img):
    """把近白色（图标底色）抠成透明，只保留三个彩色圆。"""
    px = img.load()
    w, h = img.size
    out = img.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 232 and g > 232 and b > 232:
                op[x, y] = (r, g, b, 0)
    return out


def sample_background(img):
    """取中间深蓝圆的颜色作为自适应图标背景色。"""
    return img.getpixel((img.width // 2, int(img.height * 0.42)))[:3]


def make_foreground(logo, canvas_size):
    """生成自适应图标前景：logo 居中缩放在安全区内。"""
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    target = int(canvas_size * SAFE_RATIO)
    resized = logo.resize((target, target), Image.LANCZOS)
    offset = (canvas_size - target) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def make_round(img, size):
    """圆形图标：裁成圆形，圆外透明。"""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out.paste(img.resize((size, size), Image.LANCZOS), (0, 0), mask)
    return out


def main():
    src = load_source()
    logo = extract_logo(src)
    bg = sample_background(src)
    print(f"source={src.size}  background color={bg}")

    for density, (launcher_size, canvas_size) in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)

        # 传统方形图标：保留原始白底圆角
        src.resize((launcher_size, launcher_size), Image.LANCZOS).save(
            os.path.join(folder, "ic_launcher.png")
        )
        # 圆形图标
        make_round(src, launcher_size).save(os.path.join(folder, "ic_launcher_round.png"))
        # 自适应前景
        make_foreground(logo, canvas_size).save(
            os.path.join(folder, "ic_launcher_foreground.png")
        )
        print(f"  mipmap-{density}: launcher={launcher_size} foreground={canvas_size}")

    # 背景色
    colors = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(colors, "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            f'    <color name="ic_launcher_background">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color>\n'
            "</resources>\n"
        )
    print(f"wrote {colors}")


if __name__ == "__main__":
    main()
