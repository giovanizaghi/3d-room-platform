"""
render_from_glb.py — Room Scene Renderer
=========================================
Runs inside Blender's embedded Python. Imports a GLTF/GLB scene exported from
the Three.js room editor and renders it with EEVEE Next at low resolution,
producing a fast lighting reference image for AI enhancement.

Usage (called by the renderer service):
  blender -b -P render_from_glb.py -- \
    --glb /path/to/scene.glb \
    --metadata /path/to/metadata.json \
    --output /path/to/render.png \
    [--ai-enhance]

Status lines emitted on stdout (parsed by server.py):
  RENDER_SCENE_STATUS:{"status":"enhancing"}
  RENDER_SCENE_STATUS:{"status":"done"}
"""

import bpy
import sys
import os
import json
import math
import argparse

# ---------------------------------------------------------------------------
# Parse arguments (everything after "--" is ours)
# ---------------------------------------------------------------------------
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

parser = argparse.ArgumentParser()
parser.add_argument("--glb",      required=True, help="Path to the exported GLB file")
parser.add_argument("--metadata", required=True, help="Path to the JSON metadata file")
parser.add_argument("--output",   required=True, help="Output PNG path")
parser.add_argument("--ai-enhance", action="store_true", dest="ai_enhance",
                    help="Run AI enhancement after Blender render")
args = parser.parse_args(argv)

# ---------------------------------------------------------------------------
# Load metadata
# ---------------------------------------------------------------------------
with open(args.metadata, "r") as f:
    meta = json.load(f)

camera_meta   = meta["camera"]       # {position, target, fov}
lights_meta   = meta["lights"]       # [{type, position, intensity, distance, colorTemp, castShadow, ...}]
room_dims     = meta["roomDimensions"]  # {width, depth}
hidden_walls  = set(meta.get("hiddenWalls", []))   # e.g. {"front", "right"}
ceiling_h     = float(meta.get("ceilingHeight", 2.7))

# ---------------------------------------------------------------------------
# Clear the default Blender scene
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4              # ultra-low — AI lighting reference only
scene.cycles.use_denoising = True
scene.render.resolution_x = 320
scene.render.resolution_y = 240
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = args.output

# Force standard color management to avoid missing ICC profile issues
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

# ---------------------------------------------------------------------------
# Import the GLB
# ---------------------------------------------------------------------------
bpy.ops.import_scene.gltf(filepath=args.glb)

# ---------------------------------------------------------------------------
# Re-create Camera from metadata
# ---------------------------------------------------------------------------

def _make_target_empty(target):
    """Create an empty object at the camera target position."""
    bpy.ops.object.empty_add(location=(target["x"], -target["z"], target["y"]))
    empty = bpy.context.active_object
    empty.name = "CameraTarget"
    return empty


cam_data = bpy.data.cameras.new("RoomCamera")
cam_obj  = bpy.data.objects.new("RoomCamera", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

cp = camera_meta["position"]
ct = camera_meta["target"]

cam_obj.location = (cp["x"], -cp["z"], cp["y"])  # Three.js → Blender axes (Y-up → Z-up)

# Create target empty and point camera at it via "Track To" constraint
target_empty = _make_target_empty(ct)
track = cam_obj.constraints.new(type="TRACK_TO")
track.target = target_empty
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis    = "UP_Y"

# FOV → lens (focal length in mm for 36 mm sensor)
fov_rad = math.radians(camera_meta["fov"])
cam_data.lens = 36.0 / (2.0 * math.tan(fov_rad / 2.0))

# ---------------------------------------------------------------------------
# Re-create Lights from metadata
# (Three.js lights are included as proxy meshes in the GLB, but we recreate
# them as proper Blender lights for accurate rendering.)
# ---------------------------------------------------------------------------

def kelvin_to_rgb(kelvin):
    """Convert a colour temperature in Kelvin to a linear RGB triplet."""
    temp = max(1000, min(40000, kelvin)) / 100.0
    if temp <= 66:
        r = 1.0
        g = max(0.0, min(1.0, (99.4708025861 * math.log(temp) - 161.1195681661) / 255.0))
        b = 0.0 if temp <= 19 else max(0.0, min(1.0, (138.5177312231 * math.log(temp - 10) - 305.0447927307) / 255.0))
    else:
        r = max(0.0, min(1.0, (329.698727446 * ((temp - 60) ** -0.1332047592)) / 255.0))
        g = max(0.0, min(1.0, (288.1221695283 * ((temp - 60) ** -0.0755148492)) / 255.0))
        b = 1.0
    return (r, g, b)


def three_to_blender(v):
    """Convert a Three.js world-space position {x, y, z} to Blender (Y-up → Z-up)."""
    return (v["x"], -v["z"], v["y"])


for i, lm in enumerate(lights_meta):
    pos = three_to_blender(lm["position"])
    color_rgb = kelvin_to_rgb(lm.get("colorTemp", 3000))

    if lm["type"] == "pointLight":
        light_data = bpy.data.lights.new(f"PointLight_{i}", type="POINT")
        light_data.color = color_rgb
        light_data.energy = lm["intensity"] * 100       # Three.js intensity → Blender watts (approximate)
        light_data.shadow_soft_size = 0.1
        if lm.get("castShadow"):
            light_data.use_shadow = True
    else:
        # spotLight
        light_data = bpy.data.lights.new(f"SpotLight_{i}", type="SPOT")
        light_data.color = color_rgb
        light_data.energy = lm["intensity"] * 100
        angle = lm.get("angle", math.pi / 6)
        light_data.spot_size = angle * 2            # Three.js angle is half-angle
        light_data.spot_blend = lm.get("penumbra", 0.2)
        if lm.get("castShadow"):
            light_data.use_shadow = True

    light_obj = bpy.data.objects.new(f"Light_{i}", light_data)
    light_obj.location = pos
    # Spot lights point downward by default in Blender — rotate to face down
    if lm["type"] == "spotLight":
        light_obj.rotation_euler = (math.pi, 0, 0)
    scene.collection.objects.link(light_obj)

# ---------------------------------------------------------------------------
# Shadow ceiling — invisible plane that casts shadows (Cycles shadow catcher)
# ---------------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(
    size=1,
    location=(0, 0, ceiling_h),
)
ceiling_obj = bpy.context.active_object
ceiling_obj.name = "ShadowCeiling"
ceiling_obj.scale = (room_dims["width"] / 2 + 0.15, room_dims["depth"] / 2 + 0.15, 1)
bpy.ops.object.transform_apply(scale=True)

# In Cycles, is_shadow_catcher makes the plane invisible but catches shadows
ceiling_obj.is_shadow_catcher = True

# ---------------------------------------------------------------------------
# Sims-style hidden walls — invisible to camera, but cast shadows
# ---------------------------------------------------------------------------
WALL_NAME_MAP = {
    "front": "wall_front",
    "back":  "wall_back",
    "left":  "wall_left",
    "right": "wall_right",
}

for wall_id in hidden_walls:
    mesh_name = WALL_NAME_MAP.get(wall_id)
    if not mesh_name:
        continue
    wall_obj = bpy.data.objects.get(mesh_name)
    if wall_obj:
        # visible_camera is the standard API from Blender 4.0+
        # (cycles_visibility.camera was removed in Blender 4.0)
        wall_obj.visible_camera = False

# ---------------------------------------------------------------------------
# Add ambient world light so the scene isn't pitch-black
# ---------------------------------------------------------------------------
world = bpy.data.worlds.new("World")
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs["Color"].default_value = (0.05, 0.06, 0.09, 1)
    bg_node.inputs["Strength"].default_value = 0.4
scene.world = world

# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------
print("PROGRESS:{\"stage\": \"rendering\", \"progress\": 10}")
bpy.ops.render.render(write_still=True)
print("PROGRESS:{\"stage\": \"render_done\", \"progress\": 80}")

# ---------------------------------------------------------------------------
# Optional AI enhancement
# ---------------------------------------------------------------------------
if args.ai_enhance:
    print("RENDER_SCENE_STATUS:{\"status\":\"enhancing\"}")
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, script_dir)
        from ai_enhance import enhance_image  # type: ignore[import]
        enhance_image(args.output)
        print("PROGRESS:{\"stage\": \"ai_done\", \"progress\": 100}")
    except Exception as e:
        print(f"AI enhancement skipped: {e}")

print("RENDER_SCENE_STATUS:{\"status\":\"done\"}")
print("PROGRESS:{\"stage\": \"complete\", \"progress\": 100}")
