# Builds the BEACON lighthouse scene for the /about page hero: a navy-and-white banded
# lighthouse (SLU's blue and white) with its keeper's cottage on a Benguet-pine ridge
# above Baguio's sea of clouds, Cordillera ranges in the haze, an SLU flag, a real sky
# (day) or starry sky with a turning beam (night), and a
# single continuous camera take over frames 1..FRAMES that the page scrubs by scroll:
# out at sea (hero) -> low to the door (checklist) -> up the bands (weekly reports) ->
# round the gallery (hours) -> the lantern, whose dome lifts off the lit lens (final report).
#
# Textures and skies are CC0 from Poly Haven, read from .blender/textures/ (not committed):
#   aerial_rocks_02 (2k), rocky_terrain_02 (2k),
#   rustig_koppie_puresky (4k, day), kloppenheim_02_puresky (4k, night)
#   pine_tree_01 twig atlas (pine_tree_01_twig_diff_1k.png, _alpha_1k.png) for the needles;
#   optional .blender/assets/pines.blend (the full pine_tree_01 model) replaces the coded pines
#
#   Live:     exec this file in Blender (Scripting tab or the MCP add-on), --theme via sys.argv
#   Headless: blender -b -P scripts/blender/build-beacon.py -- --theme night --render <dir>
import math
import os
import sys

import bpy

FRAMES = 300  # 12.5 s at 24 fps: one continuous take, scrubbed by the page
NAVY = (0.012, 0.075, 0.18, 1)  # #1f4e79, linear
WHITE = (0.80, 0.82, 0.83, 1)  # painted white, a touch weathered
LAMP = (1.0, 0.82, 0.5, 1)
HERE = os.path.dirname(os.path.abspath(bpy.data.filepath or __file__)) if "__file__" in globals() else ""
TEX = os.environ.get("BEACON_TEX", r"C:\CRACK\IDSMS-V2\.blender\textures")
SKY = {
    "day": ("rustig_koppie_puresky_4k.hdr", 1.0),  # clear spring sky, soft clouds, real sun
    "night": ("kloppenheim_02_puresky_4k.hdr", 0.35),  # crisp stars, moon glow on calm water  # dimmed: moonlight, not noon
}


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


THEME = arg("--theme", "day")
RENDER_DIR = arg("--render")
PORTRAIT = "--portrait" in sys.argv  # the phone film: native 9:16, not a crop
# The page crossfades six stills, one per stop (council verdict: ~150 KB a cut, not a 6 MB
# film): the headland, the door, the bands, the gallery, the dome lifting, the diploma.
STILLS = (1, 70, 140, 210, 246, 292)  # 246: the dome just cracks open, light pours out


def reset():
    # Clear data, not preferences: a factory reset would also unload add-ons in a live session.
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.textures, bpy.data.actions,
                 bpy.data.images, bpy.data.node_groups):
        for block in list(coll):
            if getattr(block, "name", "") not in ("Render Result", "Viewer Node"):
                coll.remove(block)


def image(name, colour=True):
    img = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return img


# ---------------------------------------------------------------- materials
class Tree:
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.nt.nodes.clear()
        self.out = self.node("ShaderNodeOutputMaterial")

    def node(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            n.inputs[k].default_value = v
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def principled(self, colour, rough=0.5, **kw):
        p = self.node("ShaderNodeBsdfPrincipled", **{"Base Color": colour, "Roughness": rough, **kw})
        self.link(p.outputs[0], self.out.inputs["Surface"])
        return p


def flat(name, colour, rough=0.5, **kw):
    t = Tree(name)
    t.principled(colour, rough, **kw)
    return t.mat


def tower_material():
    # Bands follow the object's own height; grime gathers towards the base.
    t = Tree("Tower")
    p = t.principled(WHITE, 0.55)
    tc = t.node("ShaderNodeTexCoord")
    sep = t.node("ShaderNodeSeparateXYZ")
    band = t.nt.nodes.new("ShaderNodeMath")
    band.operation = "PINGPONG"
    band.inputs[1].default_value = 2.3
    ramp = t.nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = WHITE
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = NAVY
    grime = t.node("ShaderNodeTexNoise", Scale=9.0, Detail=10.0)
    height = t.nt.nodes.new("ShaderNodeMapRange")
    height.inputs["From Min"].default_value = 0
    height.inputs["From Max"].default_value = 5
    height.inputs["To Min"].default_value = 0.55
    height.inputs["To Max"].default_value = 1.0
    dirt = t.nt.nodes.new("ShaderNodeMix")
    dirt.data_type = "RGBA"
    dirt.blend_type = "MULTIPLY"
    t.link(tc.outputs["Object"], sep.inputs[0])
    t.link(sep.outputs["Z"], band.inputs[0])
    t.link(band.outputs[0], ramp.inputs[0])
    t.link(sep.outputs["Z"], height.inputs["Value"])
    t.link(height.outputs[0], dirt.inputs["Factor"])
    t.link(ramp.outputs[0], dirt.inputs[6])
    t.link(grime.outputs["Color"], dirt.inputs[7])
    # Factor 1 = clean paint high up; near the base the grime multiplies in.
    inv = t.nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    t.link(height.outputs[0], inv.inputs[1])
    mixf = t.nt.nodes.new("ShaderNodeMath")
    mixf.operation = "MULTIPLY"
    mixf.inputs[1].default_value = 0.9
    t.link(inv.outputs[0], mixf.inputs[0])
    t.link(mixf.outputs[0], dirt.inputs["Factor"])
    t.link(dirt.outputs[2], p.inputs["Base Color"])
    bump = t.node("ShaderNodeBump", Strength=0.08)
    t.link(grime.outputs["Fac"], bump.inputs["Height"])
    t.link(bump.outputs[0], p.inputs["Normal"])
    return t.mat


def land_material():
    # Photographed rock on steep faces, photographed grass where the ground is level;
    # object-space box projection keeps both at real size and unstretched.
    t = Tree("Land")
    p = t.principled((0.2, 0.2, 0.2, 1), 0.8)
    tc = t.node("ShaderNodeTexCoord")

    def tex(name, colour, scale):
        m = t.nt.nodes.new("ShaderNodeMapping")
        m.inputs["Scale"].default_value = (scale,) * 3
        t.link(tc.outputs["Object"], m.inputs["Vector"])
        i = t.nt.nodes.new("ShaderNodeTexImage")
        i.image = image(name, colour)
        i.projection = "BOX"
        i.projection_blend = 0.3
        t.link(m.outputs[0], i.inputs[0])
        return i

    rock_c = tex("aerial_rocks_02_Diffuse_2k.jpg", True, 1 / 18)
    rock_r = tex("aerial_rocks_02_Rough_2k.jpg", False, 1 / 18)
    rock_n = tex("aerial_rocks_02_nor_gl_2k.jpg", False, 1 / 18)
    grass_c = tex("rocky_terrain_02_Diffuse_2k.jpg", True, 1 / 30)
    grass_r = tex("rocky_terrain_02_Rough_2k.jpg", False, 1 / 30)
    geo = t.nt.nodes.new("ShaderNodeNewGeometry")
    sep = t.nt.nodes.new("ShaderNodeSeparateXYZ")
    mask = t.nt.nodes.new("ShaderNodeValToRGB")
    mask.color_ramp.elements[0].position = 0.74
    mask.color_ramp.elements[1].position = 0.86
    t.link(geo.outputs["Normal"], sep.inputs[0])
    t.link(sep.outputs["Z"], mask.inputs[0])
    col = t.nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    t.link(mask.outputs[0], col.inputs["Factor"])
    t.link(rock_c.outputs[0], col.inputs[6])
    t.link(grass_c.outputs[0], col.inputs[7])
    t.link(col.outputs[2], p.inputs["Base Color"])
    rough = t.nt.nodes.new("ShaderNodeMix")
    t.link(mask.outputs[0], rough.inputs["Factor"])
    t.link(rock_r.outputs[0], rough.inputs[2])
    t.link(grass_r.outputs[0], rough.inputs[3])
    t.link(rough.outputs[0], p.inputs["Roughness"])
    nmap = t.node("ShaderNodeNormalMap", Strength=1.2)
    t.link(rock_n.outputs[0], nmap.inputs["Color"])
    t.link(nmap.outputs[0], p.inputs["Normal"])
    return t.mat


def emission(name, colour, strength):
    t = Tree(name)
    e = t.node("ShaderNodeEmission", Color=colour, Strength=strength)
    t.link(e.outputs[0], t.out.inputs["Surface"])
    return t.mat


def fresnel_lens():
    # Glowing glass with horizontal prism rings, like a real Fresnel lens.
    t = Tree("Lens")
    tc = t.node("ShaderNodeTexCoord")
    wave = t.node("ShaderNodeTexWave", Scale=9.0, Distortion=0.0)
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    t.link(tc.outputs["Object"], wave.inputs["Vector"])
    ramp = t.nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.12, 0.08, 0.03, 1)  # the dark gaps between prisms
    ramp.color_ramp.elements[1].color = LAMP
    t.link(wave.outputs["Color"], ramp.inputs[0])
    e = t.node("ShaderNodeEmission", Strength=22.0 if THEME == "night" else 3.5)
    t.link(ramp.outputs[0], e.inputs["Color"])
    t.link(e.outputs[0], t.out.inputs["Surface"])
    return t.mat


def clear_glass():
    # See-through panes with a sky reflection at grazing angles (cheap, and clear in Eevee).
    t = Tree("Glass")
    lw = t.node("ShaderNodeLayerWeight", Blend=0.35)
    tr = t.node("ShaderNodeBsdfTransparent")
    gl = t.node("ShaderNodeBsdfGlossy", Roughness=0.02)
    mix = t.node("ShaderNodeMixShader")
    t.link(lw.outputs["Fresnel"], mix.inputs[0])
    t.link(tr.outputs[0], mix.inputs[1])
    t.link(gl.outputs[0], mix.inputs[2])
    t.link(mix.outputs[0], t.out.inputs["Surface"])
    t.mat.surface_render_method = "BLENDED"
    return t.mat


def dome(trim, z):
    # A hemispherical lantern roof (the lower half of a sphere removed).
    import bmesh

    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=24, radius=1.3, location=(0, 0, z))
    obj = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.scale.z = 0.8
    return finish(obj, trim)


def shaft_material():
    t = Tree("Shaft")
    tc = t.node("ShaderNodeTexCoord")
    sep = t.node("ShaderNodeSeparateXYZ")
    fade = t.nt.nodes.new("ShaderNodeValToRGB")  # Generated Z: 0 at the lamp, 1 far out
    fade.color_ramp.elements[0].color = (1, 1, 1, 1)
    fade.color_ramp.elements[1].color = (0, 0, 0, 1)
    fade.color_ramp.interpolation = "EASE"
    strength = t.node("ShaderNodeMath", **{})
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 0.22
    v = t.node("ShaderNodeVolumePrincipled", Density=0.0, **{"Emission Color": LAMP})
    t.link(tc.outputs["Generated"], sep.inputs[0])
    t.link(sep.outputs["Z"], fade.inputs[0])
    t.link(fade.outputs[0], strength.inputs[0])
    t.link(strength.outputs[0], v.inputs["Emission Strength"])
    t.link(v.outputs[0], t.out.inputs["Volume"])
    return t.mat


def haze_material(density):
    t = Tree("Haze")
    v = t.node("ShaderNodeVolumePrincipled", Density=density, Color=(0.75, 0.82, 0.95, 1))
    t.link(v.outputs[0], t.out.inputs["Volume"])
    return t.mat


# ---------------------------------------------------------------- geometry
def finish(obj, material=None, smooth=True):
    if material:
        obj.data.materials.append(material)
    if smooth and obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def mesh(op, material=None, smooth=True, **kw):
    op(**kw)
    return finish(bpy.context.object, material, smooth)


def roughen(obj, crags=1.6, grain=0.35, voxel=0.45):
    # Voxel remesh gives steep faces real geometry; two layers of 3D noise make them rock.
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel
    for name, size, strength in (("crags", 3.5, crags), ("grain", 0.7, grain)):
        tex = bpy.data.textures.new(f"{obj.name}_{name}", "CLOUDS")
        tex.noise_scale = size
        tex.noise_depth = 4
        disp = obj.modifiers.new(name, "DISPLACE")
        disp.texture = tex
        disp.texture_coords = "GLOBAL"
        disp.strength = strength


def ridge(land):
    # A Baguio ridge (Maryheights is a hill campus): a pine summit ~18 m above a sea of
    # clouds, its long spine running east-west and its slopes falling away into the cloud.
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=150, y_subdivisions=110, size=260)
    obj = bpy.context.object
    obj.name = "Ridge"
    obj.scale.y = 0.65
    bpy.ops.object.transform_apply(scale=True)
    for v in obj.data.vertices:
        x, y = v.co.x, v.co.y
        r = math.hypot(x * 0.42, y)
        n = math.sin(x * 0.07) * math.cos(y * 0.09) + 0.5 * math.sin(x * 0.19 + y * 0.13)
        summit = 18 + n * 0.6
        fall = max(0.0, r - 12)
        v.co.z = summit - 0.62 * fall - 0.004 * fall * fall + n * min(1.0, fall / 10) * 2.5
    obj.data.update()
    obj.modifiers.new("solid", "SOLIDIFY").thickness = 6
    roughen(obj, crags=1.1, grain=0.3, voxel=1.0)
    return finish(obj, land)


def cordillera(night):
    # Layered Cordillera ridgelines, each a real 3D mass, fading towards the sky with
    # distance (aerial perspective) the way Baguio's ranges recede in the haze.
    far_tone = (0.05, 0.07, 0.11) if night else (0.42, 0.55, 0.72)
    near_tone = (0.008, 0.02, 0.025) if night else (0.025, 0.06, 0.05)
    for i, (x, y, size, height) in enumerate(
        ((-300, 380, 520, 70), (260, 500, 640, 105), (-560, 760, 900, 150), (520, 900, 900, 140), (0, 1300, 1500, 230))
    ):
        k = min(1.0, (math.hypot(x, y) - 350) / 1100)
        tone = tuple(n + (f - n) * k for n, f in zip(near_tone, far_tone)) + (1,)
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=120, y_subdivisions=50, size=size, location=(x, y, -40))
        obj = bpy.context.object
        obj.name = f"Range{i}"
        obj.scale.y = 0.4
        bpy.ops.object.transform_apply(scale=True)
        for v in obj.data.vertices:
            u, w = v.co.x / size * 2, v.co.y / (size * 0.4) * 2
            spine = max(0.0, 1 - abs(u) ** 1.5) * max(0.0, 1 - abs(w) ** 2)
            jag = 0.16 * math.sin(v.co.x * 0.09 + i * 3) + 0.08 * math.sin(v.co.x * 0.31 + v.co.y * 0.2 + i)
            v.co.z = height * spine * (0.8 + jag)
        obj.data.update()
        rough = obj.modifiers.new("rough", "DISPLACE")
        tex = bpy.data.textures.new(f"range{i}", "CLOUDS")
        tex.noise_scale = 18
        rough.texture = tex
        rough.texture_coords = "GLOBAL"
        rough.strength = 6
        t = Tree(f"Range{i}")
        p = t.principled(tone, 0.95)
        noise = t.node("ShaderNodeTexNoise", Scale=0.05, Detail=4.0)
        bump = t.node("ShaderNodeBump", Strength=0.4)
        t.link(noise.outputs["Fac"], bump.inputs["Height"])
        t.link(bump.outputs[0], p.inputs["Normal"])
        finish(obj, t.mat)


def cloud_sea(night):
    # The sea of clouds Baguio wakes to: hundreds of metaball puffs that fuse into
    # billowing cloud-tops, glowing at their edges (subsurface), drifting slowly.
    import random

    rnd = random.Random(3)
    mb = bpy.data.metaballs.new("Clouds")
    mb.resolution = 4.0
    mb.render_resolution = 4.5
    mb.threshold = 0.6
    for _ in range(700):
        r = rnd.uniform(400, 1400) ** 0.5 * rnd.uniform(0.9, 1.1)  # bigger puffs further out
        e = mb.elements.new()
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(30, 1100)
        e.co = (d * math.cos(a), d * math.sin(a) + 250, rnd.uniform(-30, -22))
        e.radius = r * rnd.uniform(0.9, 1.5)
        e.type = "ELLIPSOID"
        e.size_x = rnd.uniform(1.4, 2.4)
        e.size_y = rnd.uniform(1.4, 2.4)
        e.size_z = rnd.uniform(0.45, 0.65)  # tops stay below the camera's opening height
    obj = bpy.data.objects.new("CloudSea", mb)
    bpy.context.collection.objects.link(obj)
    body = (0.95, 0.96, 0.98, 1) if not night else (0.5, 0.56, 0.68, 1)
    t = Tree("Cloud")
    t.principled(body, 1.0, **{"Subsurface Weight": 1.0, "Subsurface Radius": (6.0, 6.0, 7.0), "Subsurface Scale": 2.0})
    mb.materials.append(t.mat)
    obj.keyframe_insert("location", frame=1)
    obj.location.x += 30  # a slow drift across the take
    obj.keyframe_insert("location", frame=FRAMES)
    for fc in obj.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    # a thin veil over the tops softens their edges
    veil = mesh(bpy.ops.mesh.primitive_cube_add, haze_material(0.004 if not night else 0.002), False, size=1, location=(0, 300, -4))
    veil.name = "CloudVeil"
    veil.scale = (2600, 2600, 10)
    return obj


def benguet_pine(name, seed):
    # Pinus kesiya, the Baguio pine: a tall, straight, bare trunk; branches reaching out
    # in the upper half, each ending in a flat, ragged clump of needles. Many small
    # broken-edged clumps (not a few smooth blobs) are what make it read as a tree.
    import random

    rnd = random.Random(seed)
    bark = flat("Bark", (0.06, 0.04, 0.028, 1), 0.9)
    needles = twig_material()
    height = rnd.uniform(15, 20)
    parts = [mesh(bpy.ops.mesh.primitive_cone_add, bark, vertices=12, radius1=0.34, radius2=0.06, depth=height, location=(0, 0, height / 2))]
    for _ in range(rnd.randint(26, 38)):
        z = height * rnd.uniform(0.5, 0.98)
        reach = (1.0 - (z / height - 0.5) / 0.5) * 3.2 + 0.5
        a = rnd.uniform(0, math.tau)
        d = reach * rnd.uniform(0.45, 1.0)
        tip = (d * math.cos(a), d * math.sin(a), z + rnd.uniform(0.0, 0.6))
        # the branch: a thin rod from the trunk out to its clump
        mid = (tip[0] / 2, tip[1] / 2, (z + tip[2]) / 2 - 0.15)
        rod = mesh(bpy.ops.mesh.primitive_cylinder_add, bark, False, vertices=5, radius=0.045, depth=max(0.3, d), location=mid)
        rod.rotation_euler = (0, math.radians(84), a)
        parts.append(rod)
        size = rnd.uniform(0.8, 1.3) * (0.7 + reach / 4)
        # A rosette of photographed sprigs fanned out from the branch tip.
        for j in range(10):
            card = twig_card(needles, size)
            card.location = tip
            card.rotation_euler = (rnd.uniform(1.0, 1.9), rnd.uniform(-0.3, 0.3), a + j * math.tau / 10 + rnd.uniform(-0.3, 0.3))
            parts.append(card)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts):
        bpy.ops.object.join()
    tree = parts[0]
    tree.name = name
    tex = bpy.data.textures.new(f"{name}_ragged", "CLOUDS")
    tex.noise_scale = 0.45
    rag = tree.modifiers.new("ragged", "DISPLACE")  # breaks every clump's outline
    rag.texture = tex
    rag.texture_coords = "GLOBAL"
    rag.strength = 0.55
    return tree


def twig_material():
    # Poly Haven pine_tree_01 twig atlas (CC0): colour plus alpha, so each card is a real
    # photographed sprig of needles; light shows through (subsurface).
    m = Tree("Needles")
    p = m.principled((0.05, 0.1, 0.04, 1), 0.7, **{"Subsurface Weight": 0.4})
    col = m.nt.nodes.new("ShaderNodeTexImage")
    col.image = image("pine_tree_01_twig_diff_1k.png", True)
    alpha = m.nt.nodes.new("ShaderNodeTexImage")
    alpha.image = image("pine_tree_01_twig_alpha_1k.png", False)
    uv = m.node("ShaderNodeUVMap")
    m.link(uv.outputs[0], col.inputs[0])
    m.link(uv.outputs[0], alpha.inputs[0])
    m.link(col.outputs["Color"], p.inputs["Base Color"])
    m.link(alpha.outputs["Color"], p.inputs["Alpha"])
    m.mat.surface_render_method = "DITHERED"
    m.mat.use_backface_culling = False
    return m.mat


TWIG_UV = (0.02, 0.55, 0.22, 0.98)  # the sprig in the atlas's top-left corner (u0, v0, u1, v1)


def twig_card(material, size):
    bpy.ops.mesh.primitive_plane_add(size=1)
    card = bpy.context.object
    u0, v0, u1, v1 = TWIG_UV
    for loop in card.data.loops:
        co = card.data.vertices[loop.vertex_index].co
        card.data.uv_layers.active.data[loop.index].uv = (u0 + (co.x + 0.5) * (u1 - u0), v0 + (co.y + 0.5) * (v1 - v0))
    for v in card.data.vertices:
        v.co.y += 0.5  # pivot at the sprig's base, so cards fan out from the branch tip
    card.scale = (size * 0.55, size * 1.1, 1)
    card.data.materials.append(material)
    return card


def pine_forest():
    # Scatter pines over the ridge where the ground is gentle and above the clouds,
    # keeping the summit clear around the tower and cottage.
    import random

    variants = []
    # Poly Haven's photographed pine_tree_01 (CC0), saved by the setup step; the coded
    # pines are only a fallback for a machine without the asset file.
    lib = os.path.join(os.path.dirname(TEX), "assets", "pines.blend")
    if os.path.exists(lib):
        with bpy.data.libraries.load(lib) as (src, dst):
            dst.collections = [n for n in src.collections if n.startswith("Pine")]
        variants = list(dst.collections)
    else:
        for i in range(3):
            tree = benguet_pine(f"Pine{i}", i + 11)
            coll = bpy.data.collections.new(f"Pine{i}Set")
            for c in list(tree.users_collection):
                c.objects.unlink(tree)
            coll.objects.link(tree)  # not linked to the scene: only instanced
            variants.append(coll)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rnd = random.Random(7)
    placed = 0
    for _ in range(1400):
        if placed >= 150:
            break
        x, y = rnd.uniform(-125, 125), rnd.uniform(-80, 80)
        if math.hypot(x - 2, y + 1) < 16:
            continue  # the summit stays open around the tower, cottage and flag
        if y < -6 and x < 32:
            continue  # the camera's corridor up the south face stays clear
        hit, loc, normal, *_ = bpy.context.scene.ray_cast(depsgraph, (x, y, 200), (0, 0, -1))
        if not hit or normal.z < 0.7 or loc.z < -3:
            continue
        inst = bpy.data.objects.new(f"PineAt{placed}", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = rnd.choice(variants)
        inst.location = loc
        inst.rotation_euler.z = rnd.uniform(0, math.tau)
        inst.scale = (rnd.uniform(0.75, 1.2),) * 3
        bpy.context.collection.objects.link(inst)
        placed += 1
    return placed


def slu_flag(base):
    # SLU blue and white (colours only, no seal: the page credits SLU, it does not speak for it).
    pole = flat("Pole", (0.7, 0.7, 0.72, 1), 0.3, Metallic=0.9)
    x, y = 9.5, -5.0
    mesh(bpy.ops.mesh.primitive_cylinder_add, pole, vertices=12, radius=0.07, depth=9, location=(x, y, base + 4.5))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=36, y_subdivisions=22, size=1)
    flag = bpy.context.object
    flag.name = "Flag"
    flag.scale = (2.6, 1.6, 1)
    a = math.radians(-35)
    flag.rotation_euler = (math.pi / 2, 0, a)
    flag.location = (x + 1.3 * math.cos(a), y + 1.3 * math.sin(a), base + 8.0)
    t = Tree("FlagCloth")
    p = t.principled((1, 1, 1, 1), 0.8, **{"Sheen Weight": 0.4})
    tc = t.node("ShaderNodeTexCoord")
    sep = t.node("ShaderNodeSeparateXYZ")
    ramp = t.nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (0.85, 0.87, 0.9, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (0.0, 0.04, 0.22, 1)  # SLU blue over white
    t.link(tc.outputs["Generated"], sep.inputs[0])
    t.link(sep.outputs["Y"], ramp.inputs[0])
    t.link(ramp.outputs[0], p.inputs["Base Color"])
    finish(flag, t.mat)
    wave = flag.modifiers.new("ripple", "WAVE")
    wave.use_normal = True
    wave.height = 0.12
    wave.width = 0.6
    wave.narrowness = 1.2
    wave.speed = 0.06
    wave.start_position_x = -0.5


def lighthouse(base):
    trim = flat("Trim", (0.015, 0.02, 0.025, 1), 0.35, Metallic=0.85)
    stone = flat("Stone", (0.32, 0.31, 0.29, 1), 0.85)
    glass = clear_glass()
    dark = flat("Opening", (0.01, 0.012, 0.015, 1), 0.4)
    window = emission("LitWindow", (1.0, 0.62, 0.3, 1), 6) if THEME == "night" else dark
    # Plinth and tower (a gentle taper, like real masonry towers).
    mesh(bpy.ops.mesh.primitive_cylinder_add, stone, vertices=64, radius=2.6, depth=1.4, location=(0, 0, base + 0.5))
    h = 14.0
    mesh(bpy.ops.mesh.primitive_cone_add, tower_material(), vertices=96, radius1=2.15, radius2=1.45, depth=h, location=(0, 0, base + 1.2 + h / 2))
    top = base + 1.2 + h
    # Door facing the cottage, and a spiral of small windows.
    mesh(bpy.ops.mesh.primitive_cube_add, dark, False, size=1, location=(0, -2.12, base + 2.3), scale=(0.9, 0.2, 1.9))
    for i, z in enumerate((5.2, 8.4, 11.4)):
        a = math.radians(-90 + 70 * i)
        r = 2.15 - (z / h) * 0.7 - 0.02
        win = mesh(bpy.ops.mesh.primitive_cube_add, window, False, size=1, location=(r * math.cos(a), r * math.sin(a), base + 1.2 + z), scale=(0.35, 0.18, 0.75))
        win.rotation_euler.z = a + math.pi / 2
    # Gallery: deck on corbels, railing.
    mesh(bpy.ops.mesh.primitive_cylinder_add, trim, vertices=64, radius=2.1, depth=0.28, location=(0, 0, top + 0.14))
    for i in range(16):
        a = i / 16 * math.tau
        c = mesh(bpy.ops.mesh.primitive_cube_add, trim, False, size=1, location=(1.6 * math.cos(a), 1.6 * math.sin(a), top - 0.35), scale=(0.55, 0.14, 0.7))
        c.rotation_euler.z = a
    for z in (0.75, 1.15):
        mesh(bpy.ops.mesh.primitive_torus_add, trim, major_radius=2.02, minor_radius=0.035, location=(0, 0, top + z))
    for i in range(32):
        a = i / 32 * math.tau
        mesh(bpy.ops.mesh.primitive_cylinder_add, trim, vertices=8, radius=0.028, depth=0.9, location=(2.02 * math.cos(a), 2.02 * math.sin(a), top + 0.72))
    # Lantern: low wall, glazing with mullions, the lit lens, a domed roof and vane.
    mesh(bpy.ops.mesh.primitive_cylinder_add, tower_material(), vertices=64, radius=1.25, depth=0.6, location=(0, 0, top + 0.58))
    mesh(bpy.ops.mesh.primitive_cylinder_add, glass, vertices=64, radius=1.15, depth=1.9, location=(0, 0, top + 1.83))
    for i in range(10):
        a = i / 10 * math.tau
        mesh(bpy.ops.mesh.primitive_cylinder_add, trim, vertices=6, radius=0.04, depth=1.9, location=(1.16 * math.cos(a), 1.16 * math.sin(a), top + 1.83))
    lens = mesh(bpy.ops.mesh.primitive_cylinder_add, fresnel_lens(), vertices=48, radius=0.75, depth=1.3, location=(0, 0, top + 1.8))
    lens.name = "Lens"
    roof = [
        mesh(bpy.ops.mesh.primitive_cylinder_add, trim, vertices=64, radius=1.32, depth=0.12, location=(0, 0, top + 2.84)),
        dome(trim, top + 2.88),
        mesh(bpy.ops.mesh.primitive_uv_sphere_add, trim, segments=32, ring_count=16, radius=0.28, location=(0, 0, top + 4.12)),
        mesh(bpy.ops.mesh.primitive_cylinder_add, trim, vertices=12, radius=0.04, depth=0.9, location=(0, 0, top + 4.75)),
    ]
    # The climax (the "final report" stop): the dome lifts away and the lens shows.
    for part in roof:
        part.keyframe_insert("location", frame=FRAMES - 70)
        part.location.z += 3.6  # lifts clear of the frame: the stage is the diploma's
        part.keyframe_insert("location", frame=FRAMES - 15)
    lens.keyframe_insert("scale", frame=FRAMES - 70)
    lens.scale = (1.15, 1.15, 1.15)
    lens.keyframe_insert("scale", frame=FRAMES - 15)
    diploma(top + 1.8)
    return top + 1.8


def diploma(z):
    # The end of the internship, out of the light: a rolled certificate with a green
    # ribbon (the logo's #2f6b4f) and a navy seal rises from the lens as the dome lifts,
    # pops a little past its mark, turns slowly and settles in the beam.
    paper = flat("Paper", (0.78, 0.66, 0.44, 1), 0.7)  # parchment
    wood = flat("Rod", (0.09, 0.05, 0.025, 1), 0.5)
    ribbon = flat("Ribbon", (0.028, 0.147, 0.078, 1), 0.4, **{"Sheen Weight": 0.5})
    seal = flat("Seal", (0.62, 0.42, 0.08, 1), 0.3, Metallic=1.0)  # SLU gold
    rig = bpy.data.objects.new("Diploma", None)
    bpy.context.collection.objects.link(rig)
    parts = [
        mesh(bpy.ops.mesh.primitive_cylinder_add, paper, vertices=48, radius=0.2, depth=1.3, rotation=(0, math.pi / 2, 0)),
        mesh(bpy.ops.mesh.primitive_cylinder_add, wood, vertices=24, radius=0.06, depth=1.6, rotation=(0, math.pi / 2, 0)),
        mesh(bpy.ops.mesh.primitive_uv_sphere_add, wood, radius=0.09, location=(0.8, 0, 0)),
        mesh(bpy.ops.mesh.primitive_uv_sphere_add, wood, radius=0.09, location=(-0.8, 0, 0)),
        mesh(bpy.ops.mesh.primitive_torus_add, ribbon, major_radius=0.215, minor_radius=0.035, rotation=(0, math.pi / 2, 0)),
        mesh(bpy.ops.mesh.primitive_cylinder_add, seal, vertices=32, radius=0.1, depth=0.05, location=(0, -0.25, 0), rotation=(math.pi / 2, 0, 0)),
    ]
    for p in parts:
        p.parent = rig
    start, peak, end = FRAMES - 60, FRAMES - 32, FRAMES - 18
    for frame, height, size, turn in (
        (start, 0.0, 0.3, 0),  # hidden in the lens behind the glass
        (peak, 2.9, 1.85, 150),  # past its mark: the pop
        (end, 2.55, 1.7, 185),  # settled in the light
        (FRAMES, 2.55, 1.7, 200),  # still turning, slowly
    ):
        rig.location = (0, 0, z + height)
        rig.scale = (size,) * 3
        rig.rotation_euler = (0, 0, math.radians(turn))
        for path in ("location", "scale", "rotation_euler"):
            rig.keyframe_insert(path, frame=frame)
    for fc in rig.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "BEZIER"
            k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"


def cottage(base):
    # The keeper's cottage: whitewashed walls, a slate gable roof and a chimney.
    walls = flat("Whitewash", (0.78, 0.78, 0.76, 1), 0.75)
    slate = flat("Slate", (0.03, 0.035, 0.045, 1), 0.55)
    x, y = 5.2, -1.0
    mesh(bpy.ops.mesh.primitive_cube_add, walls, False, size=1, location=(x, y, base + 1.5), scale=(5.0, 3.4, 3.0))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, base + 3.0))
    roof = bpy.context.object
    roof.scale = (5.5, 3.9, 1.0)
    for v in roof.data.vertices:  # pinch the top edge into a ridge
        if v.co.z > 0:
            v.co.y = 0
        else:
            v.co.z = 0
    finish(roof, slate, False)
    for d in (-1, 1):
        pane = emission("CottageLight", (1.0, 0.6, 0.28, 1), 8) if THEME == "night" else flat("Window", (0.02, 0.025, 0.03, 1), 0.2)
        mesh(bpy.ops.mesh.primitive_cube_add, pane, False, size=1, location=(x + d * 1.3, y - 1.71, base + 1.6), scale=(0.7, 0.05, 0.9))
    mesh(bpy.ops.mesh.primitive_cube_add, walls, False, size=1, location=(x + 1.8, y + 0.6, base + 3.6), scale=(0.5, 0.5, 1.4))


def beam(lamp_z):
    # Night only: a narrow spot light turning in a faint haze, so the beam is real light.
    spot_data = bpy.data.lights.new("BeamLight", "SPOT")
    spot_data.energy = 2500000
    spot_data.color = LAMP[:3]
    spot_data.spot_size = math.radians(6)
    spot_data.spot_blend = 0.7
    spot_data.shadow_soft_size = 0.4
    spot = bpy.data.objects.new("BeamLight", spot_data)
    bpy.context.collection.objects.link(spot)
    spot.location = (0, 0, lamp_z)
    # A few degrees below level, out over the clouds; starts side-on to the opening shot
    # (pointing at the camera it reads as a smudge, not a beam).
    spot.rotation_euler = (math.radians(86), 0, math.radians(30))
    spot.keyframe_insert("rotation_euler", frame=1)
    spot.rotation_euler.z = math.radians(120)  # a quarter turn: never sweeps through the close-ups
    spot.keyframe_insert("rotation_euler", frame=FRAMES)
    glow = bpy.data.lights.new("LampGlow", "POINT")
    glow.energy = 3000
    glow.color = LAMP[:3]
    glow.shadow_soft_size = 0.4
    g = bpy.data.objects.new("LampGlow", glow)
    bpy.context.collection.objects.link(g)
    g.location = (0, 0, lamp_z)
    # The visible shaft: a cone of glowing volume riding the spot, bright at the lamp,
    # fading out to sea (thin haze alone is too faint to show the beam).
    length = 90
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.5, radius2=6, depth=length)
    shaft = bpy.context.object
    shaft.name = "Shaft"
    shaft.parent = spot
    shaft.rotation_euler.x = math.pi  # the spot shines down its local -Z
    shaft.location = (0, 0, -length / 2)
    shaft.data.materials.append(shaft_material())


# (frame, camera position, point looked at); the tower stands at the origin, door to -Y.
SHOTS = (
    (1, (-150, -95, 8), (0, 0, 20)),  # hero: the headland from out at sea
    (70, (-14, -62, 7), (0, -1, 19.5)),  # checklist: low over the water to the door
    (140, (-15, -22, 24), (0, 0, 27)),  # weekly reports: rising up the bands
    (210, (15, -17, 36), (0, 0, 33)),  # hours: round the gallery, the horizon wide
    (285, (6.8, -10, 37.6), (0, 0, 37.3)),  # final report: level with the lantern; the diploma rises
    (FRAMES, (6.4, -9.4, 37.9), (0, 0, 37.7)),
)


def camera(_target_z):
    look = bpy.data.objects.new("Look", None)
    bpy.context.collection.objects.link(look)
    data = bpy.data.cameras.new("Cam")
    data.lens = 24 if PORTRAIT else 38
    data.clip_end = 3000
    cam = bpy.data.objects.new("Cam", data)
    bpy.context.collection.objects.link(cam)
    cam.constraints.new("TRACK_TO").target = look
    # Aim a little left of each subject so it sits in the right third (the text is on the left).
    from mathutils import Vector

    for frame, pos, target in SHOTS:
        pos, target = Vector(pos), Vector(target)
        right = (target - pos).cross(Vector((0, 0, 1))).normalized()
        cam.location = pos
        # Portrait: centred, the text sits below; landscape: right third, text on the left.
        # The closing shots aim nearer centre so the rising diploma never clips a screen edge.
        shift = 0.12 if frame >= 280 else 0.3
        look.location = target if PORTRAIT else target - right * (target - pos).length * shift
        cam.keyframe_insert("location", frame=frame)
        look.keyframe_insert("location", frame=frame)
    for obj in (cam, look):
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = "BEZIER"
                k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"
    bpy.context.scene.camera = cam


def world(night):
    name, strength = SKY["night" if night else "day"]
    w = bpy.data.worlds.new("Sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = image(name, True)
    env.image.colorspace_settings.name = "Linear Rec.709"
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(env.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    # Eevee lifts the sky's sun into a real shadow-casting light.
    w.sun_threshold = 3.0
    w.sun_angle = math.radians(1.5)
    w.use_sun_shadow = True


def render_settings(night):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = (900, 1600) if PORTRAIT else (1600, 900)
    sc.frame_start, sc.frame_end = 1, FRAMES
    sc.eevee.taa_render_samples = 48  # six stills, not a film: afford clean samples
    sc.eevee.use_shadows = True
    sc.eevee.use_raytracing = False  # no water left to reflect; halves the frame time
    sc.eevee.volumetric_tile_size = "2"  # stills, not a film: fine volumes, no blocky beam edges
    sc.eevee.volumetric_samples = 128
    sc.eevee.volumetric_end = 1600
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Base Contrast" if night else "AgX - Medium High Contrast"
    sc.render.image_settings.file_format = "PNG"
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    glare = nt.nodes.new("CompositorNodeGlare")
    glare.glare_type = "FOG_GLOW"
    glare.quality = "HIGH"
    glare.threshold = 1.2
    glare.size = 7
    comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(rl.outputs["Image"], glare.inputs["Image"])
    nt.links.new(glare.outputs["Image"], comp.inputs["Image"])


def build():
    night = THEME == "night"
    reset()
    land = land_material()
    ridge(land)
    pine_forest()
    base = 18.2
    lamp_z = lighthouse(base)
    cottage(base - 0.2)
    slu_flag(base - 0.2)
    cloud_sea(night)
    cordillera(night)
    world(night)
    # Mountain air: a faint haze gives the ranges their depth (and the night beam its shaft).
    mesh(bpy.ops.mesh.primitive_cube_add, haze_material(0.0005 if night else 0.00015), False, size=2600, location=(0, 300, 200)).name = "Air"
    if night:
        beam(lamp_z)
    camera(lamp_z - 7)
    render_settings(night)
    if RENDER_DIR:
        sc = bpy.context.scene
        only = arg("--only")  # e.g. "0,4": re-render just those stills
        for i, frame in enumerate(STILLS):
            if only and str(i) not in only.split(","):
                continue
            sc.frame_set(frame)
            sc.render.filepath = os.path.join(RENDER_DIR, f"{THEME}{'-m' if PORTRAIT else ''}-{i}.png")
            bpy.ops.render.render(write_still=True)


build()
