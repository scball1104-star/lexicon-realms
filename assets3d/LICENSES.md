# assets3d: sources and licenses

Every file in this folder (except this file, `manifest.json` and `_build/`) is listed below with the pack it came
from and that pack's license. All of them are **CC0 1.0** (public domain dedication). Nothing was downloaded to
build this folder: the packs were already on this PC. `_build/build_assets3d.py` made every file (textures resized
and re-encoded with Pillow, the animation library cut to the clips the game plays).

**Not included, by decision:** the Elf, Orc, Imp and Puglin models (Quaternius Asset License, not CC0). The 3D
renderer builds its own stand-ins in code instead.

three.js r170 (MIT) is vendored separately in `src/vendor/three/` with its license.

## Packs

| Folder | Pack | License | Source on this PC |
|---|---|---|---|
| `ubc/` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Universal Base Characters` |
| `hair/` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Universal Base Characters` |
| `mco/` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Modular Character Outfits - Fantasy` |
| `props/` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Fantasy Props MegaKit` |
| `village/` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Medieval Village MegaKit` |
| `nature/` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Stylized Nature MegaKit` |
| `ual/` | Universal Animation Library (Quaternius, free tier) | CC0 1.0 | `D:\LQOnline\vendor_itch\x\Universal Animation Library` |
| `animals/` | Quaternius Animated Animal Pack via poly.pizza | CC0 1.0 | `D:\LQOnline\mockups3d_b\vendor\quaternius_polypizza` |
| `monsters/` | Quaternius Ultimate Monsters Bundle via poly.pizza | CC0 1.0 | `D:\LQOnline\mockups3d_b\vendor\quaternius_polypizza` |
| `tex/` | textures of the packs above (each row below names its pack) | CC0 1.0 | as its pack |

The two animals are Quaternius models published on poly.pizza as CC0 1.0: Wolf https://poly.pizza/m/P1gU3Qkr9r, Deer https://poly.pizza/m/T6Cs7tmMHJ.

The Ghost Skull (the barrow shade) is a Quaternius model published on poly.pizza as CC0 1.0: https://poly.pizza/m/TX8r9WBXpe. The other foes are built in code (src/render3d/creatures.js).

Total size: 22.4 MB in 273 files.

## Files

| File | Pack | License |
|---|---|---|
| `animals/Deer.glb` | Quaternius Animated Animal Pack via poly.pizza | CC0 1.0 |
| `animals/Wolf.glb` | Quaternius Animated Animal Pack via poly.pizza | CC0 1.0 |
| `hair/Hair_Beard.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Beard.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Buns.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Buns.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Buzzed.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Buzzed.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_BuzzedFemale.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_BuzzedFemale.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Long.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_Long.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_SimpleParted.bin` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `hair/Hair_SimpleParted.gltf` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `mco/Female_Peasant_Arms.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Arms.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Body.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Body.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Feet.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Feet.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Legs.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Peasant_Legs.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Acc_Pauldrons.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Acc_Pauldrons.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Arms.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Arms.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Body.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Body.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Feet.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Feet.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Head_Hood.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Head_Hood.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Legs.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Female_Ranger_Legs.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Arms.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Arms.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Body.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Body.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Feet.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Feet.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Legs.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Peasant_Legs.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Acc_Pauldron.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Acc_Pauldron.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Arms.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Arms.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Body.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Body.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Feet_Boots.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Feet_Boots.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Head_Hood.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Head_Hood.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Legs.bin` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `mco/Male_Ranger_Legs.gltf` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `monsters/Ghost_Skull.glb` | Quaternius Ultimate Monsters Bundle via poly.pizza | CC0 1.0 |
| `nature/Bush_Common.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Bush_Common.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Bush_Common_Flowers.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Bush_Common_Flowers.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_2.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_2.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_4.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_4.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_5.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/CommonTree_5.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/DeadTree_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/DeadTree_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/DeadTree_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/DeadTree_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Fern_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Fern_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Flower_3_Group.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Flower_3_Group.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Flower_4_Group.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Flower_4_Group.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Grass_Common_Short.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Grass_Common_Short.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Grass_Wispy_Tall.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Grass_Wispy_Tall.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pebble_Round_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pebble_Round_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pebble_Round_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pebble_Round_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_2.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_2.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_4.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_4.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_5.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Pine_5.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_2.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_2.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/Rock_Medium_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/TwistedTree_1.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/TwistedTree_1.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/TwistedTree_3.bin` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `nature/TwistedTree_3.gltf` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Anvil.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Anvil.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bag.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bag.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Banner_1.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Banner_1.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Barrel.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Barrel.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Barrel_Apples.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Barrel_Apples.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bench.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bench.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Book_7.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Book_7.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bucket_Wooden_1.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Bucket_Wooden_1.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Chest_Wood.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Chest_Wood.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Crate_Wooden.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Crate_Wooden.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/FarmCrate_Apple.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/FarmCrate_Apple.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Shield_Wooden.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Shield_Wooden.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Stall_Cart_Empty.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Stall_Cart_Empty.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Stall_Empty.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Stall_Empty.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Sword_Bronze.bin` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `props/Sword_Bronze.gltf` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_DeadTree.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_DeadTree_Normal.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_NormalTree.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_NormalTree_Normal.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_TwistedTree.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Bark_TwistedTree_Normal.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Flowers.png` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Grass.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Leaf_Pine_C.png` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Leaves.png` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Leaves_NormalTree_C.png` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Leaves_TwistedTree_C.png` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/PathRocks_Diffuse.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/Rocks_Diffuse.jpg` | Stylized Nature MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Brick_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Brick_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Brick_Roughness.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Eye_Brown.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Eye_Normal_png.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Hair_1_BaseColor.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Hair_1_Normal.jpg` | Universal Base Characters (Quaternius, free tier): hair | CC0 1.0 |
| `tex/T_Hair_1_Normal_png.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Hair_2_BaseColor.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Hair_2_Normal.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_MetalOrnaments_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_MetalOrnaments_Roughness.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Peasant_2_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Peasant_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Peasant_Normal.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Peasant_ORM.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Plaster_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Plaster_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Plaster_ORM.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Ranger_3_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Ranger_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Ranger_Normal.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Ranger_ORM.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Female_Dark_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Female_Normal.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Female_Roughness.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Male_Dark_BaseColor.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Male_Normal.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Regular_Male_Roughness.jpg` | Modular Character Outfits - Fantasy (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RockTrim_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RockTrim_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RockTrim_ORM.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RoundTiles_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RoundTiles_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_RoundTiles_Roughness.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Female_Dark_BaseColor.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Female_Normal.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Female_Roughness.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Male_Dark.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Male_Normal.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Superhero_Male_Roughness.jpg` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Cloth_BaseColor.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Cloth_Normal.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Cloth_ORM.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Furniture_BaseColor.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Furniture_Normal.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Furniture_ORM.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Metal_BaseColor.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Metal_Normal.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Metal_ORM.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Props_BaseColor.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Props_Normal.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_Trim_Props_ORM.jpg` | Fantasy Props MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_UnevenBrick_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_UnevenBrick_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_UnevenBrick_Roughness.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_WoodTrim_BaseColor.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_WoodTrim_Normal.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `tex/T_WoodTrim_Roughness.jpg` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `ual/UAL_clips.glb` | Universal Animation Library (Quaternius, free tier) | CC0 1.0 |
| `ubc/Superhero_Female_FullBody.bin` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `ubc/Superhero_Female_FullBody.gltf` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `ubc/Superhero_Male_FullBody.bin` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `ubc/Superhero_Male_FullBody.gltf` | Universal Base Characters (Quaternius, free tier) | CC0 1.0 |
| `village/Corner_Exterior_Brick.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Corner_Exterior_Brick.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Corner_Exterior_Wood.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Corner_Exterior_Wood.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Door_1_Round.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Door_1_Round.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Floor_UnevenBrick.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Floor_UnevenBrick.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Floor_WoodDark.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Floor_WoodDark.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Chimney.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Chimney.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Crate.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Crate.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Wagon.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_Wagon.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_WoodenFence_Single.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Prop_WoodenFence_Single.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x4.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x4.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x6.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x6.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x8.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_4x8.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x10.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x10.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x6.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x6.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x8.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_6x8.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x10.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x10.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x12.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x12.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x8.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_RoundTiles_8x8.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_Tower_RoundTiles.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Roof_Tower_RoundTiles.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Door_Round.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Door_Round.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Straight.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Straight.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Window_Wide_Flat.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Window_Wide_Flat.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Window_Wide_Round.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_Window_Wide_Round.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_WoodGrid.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_Plaster_WoodGrid.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Door_Round.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Door_Round.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Straight.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Straight.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Window_Wide_Round.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Wall_UnevenBrick_Window_Wide_Round.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Window_Wide_Flat1.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Window_Wide_Flat1.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Window_Wide_Round1.bin` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
| `village/Window_Wide_Round1.gltf` | Medieval Village MegaKit (Quaternius, free tier) | CC0 1.0 |
