import math
from PIL import Image, ImageDraw

def create_icon(size):
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = size / 2
    cy = size / 2
    
    # Scale R and width based on size
    R = size * 0.34
    width = max(2, int(size * 0.15))
    
    def draw_rounded_spoke(angle_deg, color):
        angle_rad = math.radians(angle_deg)
        x2 = cx + R * math.cos(angle_rad)
        y2 = cy + R * math.sin(angle_rad)
        
        # Draw line
        draw.line([(cx, cy), (x2, y2)], fill=color, width=width)
        
        # Draw outer circle
        r = width / 2
        draw.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=color)
        
        # Draw inner circle to smooth the center
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

    # Drawing order: Green, Yellow, Red, Blue
    # Left: Green (180 deg)
    draw_rounded_spoke(180, (52, 168, 83, 255)) # Green #34a853
    
    # Top-Left: Yellow (240 deg)
    draw_rounded_spoke(240, (251, 188, 5, 255)) # Yellow #fbbc05
    
    # Bottom-Left: Red (120 deg)
    draw_rounded_spoke(120, (234, 67, 53, 255)) # Red #ea4335
    
    # Bottom-Right: Red (60 deg)
    draw_rounded_spoke(60, (234, 67, 53, 255)) # Red #ea4335
    
    # Right: Blue (0 deg)
    draw_rounded_spoke(0, (26, 115, 232, 255)) # Blue #1a73e8
    
    # Top-Right: Blue (300 deg)
    draw_rounded_spoke(300, (26, 115, 232, 255)) # Blue #1a73e8

    # Smooth overlap in the center with a blue circle
    r_center = width / 2
    draw.ellipse([cx - r_center, cy - r_center, cx + r_center, cy + r_center], fill=(26, 115, 232, 255))

    return img

# Save 16x16
img16 = create_icon(16)
img16.save("icons/icon16.png")

# Save 32x32
img32 = create_icon(32)
img32.save("icons/icon32.png")

# Save 48x48
img48 = create_icon(48)
img48.save("icons/icon48.png")

# Save 128x128
img128 = create_icon(128)
img128.save("icons/icon128.png")

print("Icons successfully generated!")
